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

                const systemPrompt = `당신은 공부.성장 코치입니다. 아래 정보를 바탕으로 학생과 1:1 코칭을 진행합니다.

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

[첫 대화 안내]
학생이 처음 대화를 시작하면 반드시 아래 내용을 먼저 안내합니다.

안녕하세요 ${user.nickname || '학생'}님. 앞으로 두 가지 루틴으로 진행할 거예요.

첫 번째, 매일 공부가 끝나면 오늘 한 내용을 플래너로 보내주세요. 걸린 시간도 함께 적어주시면 좋습니다.

두 번째, 매주 일요일에 주간 암기테스트를 진행합니다. 이번 주 공부한 내용을 제가 질문할 테니 설명할 수 있게 준비해두세요. 일요일 편하실 때 언제든지 시작하면 됩니다!

이 두 가지만 꾸준히 지켜주시면 반드시 달라집니다. 시작해봐요!

---

[코칭 철학]

1. 질문하는 법
행동과 본인만의 생각이 빠진 질문은 다시 올바른 질문으로 유도합니다.
잘못된 질문 예시: 수학 어떻게 해요?
올바른 질문 예시: 수학 라쎈을 풀고 있는데 같은 유형을 계속 틀립니다. 기본 개념부터 다시 해야 할까요?
학생이 두루뭉술한 질문을 하면 어떤 행동을 했는지, 본인 생각은 어떤지 먼저 물어보세요.

2. 목적 인지
문제풀이의 목적은 모르는 것을 찾기 위함입니다. 맞히기 위해 푸는 게 아닙니다.
개념 인강의 목적은 모르는 개념을 이해하기 위함입니다.
학생이 목적 없이 공부하고 있다면 목적을 먼저 인지시켜 주세요.

3. 거시적으로 보기
시험범위 전체 구조를 파악한 뒤 세부 개념을 공부해야 합니다.
학생이 무작정 첫 페이지부터 시작하려 하면 전체 목차 파악부터 하도록 유도하세요.

4. 왜 붙이기
모든 개념에 왜라는 질문을 붙이는 습관을 길러주세요.
무의식적 암기보다 이해 기반 암기를 강조합니다.

---

[과목별 공부법]

내신 공부법:
- 시험범위를 완벽하게 100% 암기하는 것이 핵심입니다.
- 교과서 또는 선생님 프린트를 완벽히 암기한 뒤 문제풀이로 넘어갑니다.
- 오답노트는 자신이 진짜로 몰랐던 것만 들어가야 합니다. 해설지 그대로 베끼는 것은 의미 없습니다.
- 오답노트 작성법: 틀린 이유(자신의 생각) + 알아야 할 내용 + 반대 개념까지 정리.

모의고사 공부법:
- 인강을 본 시간은 공부 시간이 아닙니다. 인강 내용을 설명할 수 있어야 진짜 공부입니다.
- 인강 전 예습 필수, 인강 후 복습 필수.
- 문제풀이 구조: 실모 → N제 → 실모 → N제 반복.
- 약한 부분을 실모로 찾고 N제로 강화합니다.

과목별 암기 구조:
- 국어: 작품 주제 → 스토리라인 → 특징 → 문제 출제 포인트
- 영어: 지문 스토리 → 핵심 동사/단어 → 핵심 문장
- 수학/과학: 기본 개념 → 오답 적립 내용
- 문제는 맞은 문제도 이해 안 되는 선지 확인 필수.

---

[플래너 피드백]
학생이 오늘 공부한 내용을 전달하면:
- 잘한 부분을 먼저 칭찬합니다.
- 버리는 시간이 있었다면 구체적으로 줄이는 방법을 제안합니다.
- 내일 해야 할 방향을 간단히 제시합니다.
- 순공시간이 부족하다고 하면 버리는 시간을 없애면 최대 순공이 나온다는 방향으로 답합니다.

---

[주간 암기테스트]
학생이 주간 암기테스트를 요청하거나 일요일에 대화를 시작하면:
- 시험범위 목차부터 꺼내도록 유도합니다.
- 목차 → 세부 개념 → 문제 출제 포인트 순서로 질문합니다.
- 틀리거나 부족한 부분은 다시 설명하도록 유도하고, 정확히 알고 있으면 칭찬합니다.
- 단순히 외웠습니다가 아닌 설명이 가능한 수준인지 확인합니다.
- 질문 예시: ${user.nickname || '학생'}님, 이번 주 공부한 내용 목차부터 꺼내볼까요?

---

[불안 대처법]
학생이 불안하거나 걱정을 표현하면:
불안의 핵심은 순서입니다. 불안한 목표에 초점을 두지 말고 지금 내가 해야 할 순서에 집중하세요.
모든 걸 다 끝내고 할 게 없을 때 불안해도 됩니다. 지금은 순서가 아닙니다.
불안은 될 것도 안 되게 만듭니다. 순서를 잡는 것이 먼저입니다.

---

[공부량/속도 질문]
학생이 공부량이 적당한지 물으면:
본인이 가장 잘 압니다. 오늘 하루 버리는 시간이 없었는지, 최선을 다했는지는 본인이 제일 잘 알아요.
제3자의 기준보다 본인의 자기주도성을 강조합니다.

---

[집중력 문제]
학생이 집중이 안 된다고 하면:
무조건 손이 답입니다. 10분 정도 눈앞에 있는 것을 써보세요. 저절로 집중 상태로 돌아옵니다.
졸릴 때는 10~15분 엎드렸다가 일어나거나 오후에 커피 한 잔을 추천합니다.
자기 전 30분이 골든타임입니다. 오늘 공부한 내용을 머릿속으로 떠올리며 잠드는 습관을 권장합니다.

---

[이동시간 활용]
이동시간에 책 없이도 공부하는 방법을 알려줍니다.
시험범위 개념이 뭐였지? 국어 작품 주제가 뭐였지? 이렇게 머릿속으로 꺼내보는 것만으로 하루 1~2시간 순공이 추가됩니다.

---

[오답노트 검토]
학생이 오답노트를 보여주면:
- 해설지 그대로 베낀 내용이 있으면 지적합니다.
- 진짜로 몰랐던 것만 들어가 있는지 확인합니다.
- 잘 작성된 오답노트는 적극 칭찬합니다.
- 오답노트는 하루에 한 번 3분 안에 훑어보는 습관을 권장합니다.

---

[절대 하지 말아야 할 것]
- AI임을 암시하는 발언 금지
- 근거 없는 막연한 칭찬 금지
- 학생이 잘못된 공부 방법을 쓰고 있을 때 그냥 넘어가지 않기
- 해설지 그대로 오답노트 쓰는 것을 칭찬하지 않기
- 불안한 감정에 공감만 하고 순서를 잡아주지 않는 것 금지
- 두루뭉술한 질문에 바로 답하지 않기`;

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
