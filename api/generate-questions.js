const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

const adminAuth = (req) => {
    const admin_password = req.headers['admin_password'];
    if (!admin_password || admin_password !== process.env.ADMIN_PASSWORD) {
        return false;
    }
    return true;
};

const SCHOOL_LEVEL_MAP = {
    '초등': '초등학교',
    '중학': '중학교',
    '고등': '고등학교'
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, admin_password');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type } = req.method === 'GET' ? req.query : (req.body || {});

    // ─────────────────────────────────────────
    // 코칭 관련 기능 (토큰 인증 필요)
    // ─────────────────────────────────────────
    if (['save_message','get_messages','save_profile','get_profile','save_note','get_notes','chat'].includes(type)) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, error: '인증 토큰이 필요합니다' });

        let userId;
        try {
            const jwt = require('jsonwebtoken');
            const user = jwt.verify(token, process.env.JWT_SECRET);
            userId = user.userId;
        } catch {
            return res.status(403).json({ success: false, error: '유효하지 않은 토큰입니다' });
        }

        if (!userId) return res.status(401).json({ success: false, error: '인증이 필요합니다' });

        // 채팅 메시지 저장
        if (type === 'save_message') {
            try {
                const { role, message } = req.body;
                if (!role || !message) return res.status(400).json({ success: false, error: 'role과 message가 필요합니다' });
                await query(`INSERT INTO coaching_messages (user_id, role, message) VALUES ($1, $2, $3)`, [userId, role, message]);
                return res.json({ success: true });
            } catch (error) {
                console.error('메시지 저장 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

        // 채팅 내역 불러오기
        if (type === 'get_messages') {
            try {
                const { rows } = await query(
                    `SELECT role, message, created_at FROM coaching_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 50`,
                    [userId]
                );
                return res.json({ success: true, messages: rows });
            } catch (error) {
                console.error('메시지 불러오기 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

        // 프로필 저장
        if (type === 'save_profile') {
            try {
                const { exam_date, subject_goals } = req.body;
                await query(
                    `INSERT INTO coaching_profile (user_id, exam_date, subject_goals, updated_at)
                     VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (user_id) DO UPDATE
                     SET exam_date = $2, subject_goals = $3, updated_at = NOW()`,
                    [userId, exam_date || null, JSON.stringify(subject_goals || {})]
                );
                return res.json({ success: true });
            } catch (error) {
                console.error('프로필 저장 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

        // 프로필 불러오기
        if (type === 'get_profile') {
            try {
                const { rows } = await query(`SELECT exam_date, subject_goals FROM coaching_profile WHERE user_id = $1`, [userId]);
                return res.json({ success: true, profile: rows[0] || null });
            } catch (error) {
                console.error('프로필 불러오기 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

        // 중요점 저장
        if (type === 'save_note') {
            try {
                const { subject, content } = req.body;
                if (!subject) return res.status(400).json({ success: false, error: 'subject가 필요합니다' });
                await query(
                    `INSERT INTO coaching_notes (user_id, subject, content, updated_at)
                     VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (user_id, subject) DO UPDATE
                     SET content = $3, updated_at = NOW()`,
                    [userId, subject, content || '']
                );
                return res.json({ success: true });
            } catch (error) {
                console.error('중요점 저장 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

        // 중요점 불러오기
        if (type === 'get_notes') {
            try {
                const { rows } = await query(`SELECT subject, content, updated_at FROM coaching_notes WHERE user_id = $1 ORDER BY subject ASC`, [userId]);
                return res.json({ success: true, notes: rows });
            } catch (error) {
                console.error('중요점 불러오기 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

        // AI 코치 채팅
        if (type === 'chat') {
            try {
                const { message } = req.body;
                if (!message) return res.status(400).json({ success: false, error: 'message가 필요합니다' });

                const [profileResult, notesResult, messagesResult, userResult] = await Promise.all([
                    query(`SELECT exam_date, subject_goals FROM coaching_profile WHERE user_id = $1`, [userId]),
                    query(`SELECT subject, content FROM coaching_notes WHERE user_id = $1`, [userId]),
                    query(`SELECT role, message FROM coaching_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
                    query(`SELECT nickname, school_level FROM users WHERE user_id = $1`, [userId])
                ]);

                const profile = profileResult.rows[0] || {};
                const notes = notesResult.rows;
                const recentMessages = messagesResult.rows.reverse();
                const user = userResult.rows[0] || {};

                let dday = '';
                if (profile.exam_date) {
                    const diff = Math.ceil((new Date(profile.exam_date) - new Date()) / (1000 * 60 * 60 * 24));
                    dday = `시험까지 D-${diff}`;
                }

                const goals = profile.subject_goals || {};
                const goalsText = Object.entries(goals).map(([s, g]) => `${s}: ${g}%`).join(', ') || '미설정';
                const notesText = notes.length > 0 ? notes.map(n => `[${n.subject}] ${n.content}`).join('\n') : '아직 입력 없음';

                const systemPrompt = `너는 공부.성장 코치야. 학생들에게 공부 방향을 잡아주고 동기부여를 해주는 역할이야.
절대 AI 티 내지 마. 친근하고 따뜻하게, 마치 옆에서 직접 봐주는 선생님처럼 대화해.
반말 하지 말고 존댓말로, 하지만 딱딱하지 않게.

[학생 정보]
이름: ${user.nickname || '학생'}
학교급: ${user.school_level || '미설정'}
${dday}
과목별 목표: ${goalsText}

[학생이 적은 중요점]
${notesText}`;

                const conversationHistory = recentMessages.map(m => ({
                    role: m.role === 'coach' ? 'assistant' : 'user',
                    content: m.message
                }));
                conversationHistory.push({ role: 'user', content: message });

                const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                const claudeRes = await client.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1000,
                    system: systemPrompt,
                    messages: conversationHistory
                });

                const reply = claudeRes.content?.[0]?.text;
                if (!reply) throw new Error('응답 없음');

                await query(`INSERT INTO coaching_messages (user_id, role, message) VALUES ($1, $2, $3)`, [userId, 'user', message]);
                await query(`INSERT INTO coaching_messages (user_id, role, message) VALUES ($1, $2, $3)`, [userId, 'coach', reply]);

                return res.json({ success: true, reply });
            } catch (error) {
                console.error('채팅 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }
    }

    // ─────────────────────────────────────────
    // 문제 생성 기능 (기존)
    // ─────────────────────────────────────────
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });
    }

    if (!adminAuth(req)) {
        return res.status(401).json({ error: '관리자 권한이 없습니다.' });
    }

    const { school_level, grade, semester, subject, count = 5 } = req.body;

    if (!school_level || !grade || !semester || !subject) {
        return res.status(400).json({ error: 'school_level, grade, semester, subject는 필수입니다.' });
    }

    if (count < 1 || count > 20) {
        return res.status(400).json({ error: '문제 수는 1~20 사이여야 합니다.' });
    }

    try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const prompt = `당신은 대한민국 ${SCHOOL_LEVEL_MAP[school_level]} ${grade}학년 ${semester}학기 ${subject} 교육 전문가입니다.

아래 기준을 반드시 준수하여 4지선다형 문제를 정확히 ${count}개 생성하세요.

[출제 기준]
1. 해당 학교급/학년/학기/과목에서 보편적으로 다루는 핵심 개념 기준으로 출제
2. 오답 3개는 명확하게 틀린 것으로 구성 - 헷갈리거나 애매한 오답 절대 금지
3. 정답은 반드시 1개만 존재해야 함
4. 해설은 왜 정답인지, 왜 나머지가 오답인지 명확한 근거 포함
5. 난이도는 전반적으로 매우 쉽게 구성할 것
6. 문제는 명확하고 간결하게, 중의적 해석 절대 금지
7. 수식은 LaTeX($...$) 형식 절대 사용 금지. 일반 텍스트로 작성할 것
8. 문제와 보기에 특수문자나 이모지 사용 금지
9. 보기는 반드시 "① 내용", "② 내용", "③ 내용", "④ 내용" 형식으로 작성
10. 문제 길이는 100자 이내로 간결하게
11. 해설은 200자 이내로 핵심만 설명
12. 보기 4개의 길이가 너무 차이나지 않게 비슷한 길이로 작성
13. 정답이 항상 ①번이 되지 않도록 다양하게 배치
14. 같은 문제나 비슷한 문제 반복 출제 금지
15. 문제에 "다음 중", "아닌 것은" 같은 부정형 표현 사용 금지
16. 밑줄, 괄호, 표, 그림 등 텍스트로 표현 불가능한 형식 사용 금지

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 포함 금지:

{"questions":[{"question":"문제내용","options":["① 보기1","② 보기2","③ 보기3","④ 보기4"],"answer":0,"explanation":"정답 해설 (오답 이유 포함)","difficulty":"easy"}]}

- answer: 0~3 정수 (정답 인덱스)
- difficulty: "easy" 또는 "medium" 만 사용 (hard 금지)`;

        const message = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }]
        });

        const responseText = message.content[0].text.trim();

        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (e) {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('AI 응답 파싱 실패');
            parsed = JSON.parse(match[0]);
        }

        const questions = parsed.questions;
        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('유효한 문제가 생성되지 않았습니다.');
        }

        const insertedIds = [];
        for (const q of questions) {
            const result = await query(
                `INSERT INTO battle_questions 
                    (subject, grade, question, options, answer, explanation, difficulty, status, school_level, semester)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $9)
                 RETURNING id`,
                [
                    subject,
                    String(grade),
                    q.question,
                    JSON.stringify(q.options),
                    q.answer,
                    q.explanation,
                    q.difficulty || 'easy',
                    school_level,
                    String(semester)
                ]
            );
            insertedIds.push(result.rows[0].id);
        }

        return res.status(201).json({
            message: `${insertedIds.length}개의 문제가 생성되어 바로 사용 가능합니다.`,
            count: insertedIds.length,
            ids: insertedIds
        });

    } catch (error) {
        console.error('문제 생성 오류:', error);
        return res.status(500).json({ error: '문제 생성 중 오류가 발생했습니다.', detail: error.message });
    }
};
