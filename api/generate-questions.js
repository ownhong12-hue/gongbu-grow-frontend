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

        if (type === 'get_profile') {
            try {
                const { rows } = await query(`SELECT exam_date, subject_goals FROM coaching_profile WHERE user_id = $1`, [userId]);
                return res.json({ success: true, profile: rows[0] || null });
            } catch (error) {
                console.error('프로필 불러오기 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

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

        if (type === 'get_notes') {
            try {
                const { rows } = await query(`SELECT subject, content, updated_at FROM coaching_notes WHERE user_id = $1 ORDER BY subject ASC`, [userId]);
                return res.json({ success: true, notes: rows });
            } catch (error) {
                console.error('중요점 불러오기 오류:', error);
                return res.status(500).json({ success: false, error: '서버 오류' });
            }
        }

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

                const systemPrompt = `당신은 공부.성장 코치입니다. 아래 학생 정보를 참고하여 매일 공부 점검을 진행합니다.

[학생 정보]
이름: ${user.nickname || '학생'}
학교급: ${user.school_level || '미설정'}
${dday}
과목별 목표: ${goalsText}
과목별 시험범위 및 중요점: ${notesText}

---

[코치 정체성]
당신은 공부.성장 코치입니다. 절대 AI라고 밝히지 마세요. 학생 곁에서 직접 봐주는 선생님처럼 행동하세요.
말투는 친근하고 따뜻하되 너무 가볍지 않게, 존댓말을 사용합니다.
느낌표는 가끔씩만 사용합니다. 이모티콘과 ㅠㅠ 같은 표현은 자제합니다.
답변은 너무 길지 않게, 핵심만 전달합니다.
학생 이름을 자주 불러주세요.

---

[이 채팅창의 목적]
이 채팅창은 매일 공부한 내용을 점검하고 점수와 평가를 받는 공간입니다.
학생이 오늘 공부한 내용을 설명하면 꼬리질문을 통해 진짜 이해했는지 확인하고 점수를 매깁니다.

---

[첫 메시지]
학생이 처음 대화를 시작하면 반드시 아래 내용을 그대로 보냅니다.

안녕하세요 ${user.nickname || '학생'}님! 오늘 순공시간과 과목별 공부한 내용을 보내주세요. 내용을 바탕으로 점수와 평가를 드릴게요!

예시) 오늘 순공 5시간이고, 수학은 지수함수 개념공부와 문제풀이 20문제, 국어는 이육사 청포도 작품 공부, 영어는 교과서 본문 1과 공부했습니다.

---

[점검 진행 방식]

1단계 - 학생이 순공시간 + 과목별 공부 내용 서술
2단계 - 코치가 과목별로 꼬리질문 진행
  - 수학/과학: 어떤 개념을 배웠는지 + 틀린 문제에서 몰랐던 게 무엇인지
  - 국어: 작품 주제와 특징 + 몰랐던 단어나 표현
  - 영어: 핵심 문장과 주제 + 몰랐던 단어
3단계 - 학생이 꼬리질문에 답변
4단계 - 최종 점수와 평가 출력

꼬리질문은 과목당 1~2개만 합니다. 너무 많이 묻지 마세요.
모든 과목 꼬리질문이 끝나면 반드시 최종 평가로 넘어가세요.

---

[점수 기준 (100점 만점)]
공부 내용 설명 가능 여부와 꼬리질문 답변 정확도로 기본 점수 산정.
순공시간 4시간 이상: 감점 없음.
순공시간 4시간 미만: 10점 감점.

설명이 명확하고 왜 그런지까지 알면 높은 점수.
설명은 했지만 이유를 모르면 중간 점수.
설명을 못하면 낮은 점수.

---

[최종 평가 출력 형식]
꼬리질문이 모두 끝나면 반드시 아래 형식으로 출력합니다.

📊 오늘의 공부 점검 결과

총점: OO점 / 100점
한줄 총평: (한 문장으로)

과목별 평가:
- 수학: (잘 설명한 부분 / 꼬리질문에서 막힌 부분)
- 국어: (잘 설명한 부분 / 꼬리질문에서 막힌 부분)
- 영어: (잘 설명한 부분 / 꼬리질문에서 막힌 부분)

내일 다시 봐야 할 것:
(꼬리질문에서 막힌 부분만 콕 집어서)

---

[절대 하지 말아야 할 것]
- AI임을 암시하는 발언 금지
- 꼬리질문 없이 바로 점수 주지 않기
- 과목당 꼬리질문 3개 이상 하지 않기
- 최종 평가 형식 임의로 바꾸지 않기
- 근거 없는 막연한 칭찬 금지`;

                const conversationHistory = recentMessages.map(m => ({
                    role: m.role === 'coach' ? 'assistant' : 'user',
                    content: m.message
                }));
                conversationHistory.push({ role: 'user', content: message });

                const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                const claudeRes = await client.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 2000,
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
2. 오답 3개는 명확하게 틀린 것으로 구성
3. 정답은 반드시 1개만 존재해야 함
4. 해설은 왜 정답인지, 왜 나머지가 오답인지 명확한 근거 포함
5. 난이도는 전반적으로 매우 쉽게 구성할 것
6. 문제는 명확하고 간결하게
7. 수식은 LaTeX 형식 절대 사용 금지. 일반 텍스트로 작성
8. 문제와 보기에 특수문자나 이모지 사용 금지
9. 보기는 반드시 "① 내용", "② 내용", "③ 내용", "④ 내용" 형식으로 작성
10. 문제 길이는 100자 이내
11. 해설은 200자 이내
12. 보기 4개의 길이가 너무 차이나지 않게 비슷한 길이로 작성
13. 정답이 항상 1번이 되지 않도록 다양하게 배치
14. 같은 문제나 비슷한 문제 반복 출제 금지
15. 부정형 표현 사용 금지
16. 텍스트로 표현 불가능한 형식 사용 금지

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 절대 포함 금지:

{"questions":[{"question":"문제내용","options":["① 보기1","② 보기2","③ 보기3","④ 보기4"],"answer":0,"explanation":"정답 해설","difficulty":"easy"}]}`;

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
