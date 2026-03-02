const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('./_lib/database');

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
   (특정 교육과정 버전이나 교과서에 종속되지 않는 내용)
2. 오답 3개는 명확하게 틀린 것으로 구성 - 헷갈리거나 애매한 오답 절대 금지
3. 정답은 반드시 1개만 존재해야 함
4. 해설은 왜 정답인지, 왜 나머지가 오답인지 명확한 근거 포함
5. 난이도는 전반적으로 쉽게 구성하되, 학생들이 한 번쯤 헷갈릴 수 있는 포인트를 담을 것
   - 단순 암기보다는 개념을 살짝 비틀거나 착각하기 쉬운 부분 출제
   - 예: 헷갈리는 맞춤법, 자주 틀리는 공식 적용, 비슷해 보이는 개념 구분 등
6. 문제는 명확하고 간결하게, 중의적 해석 절대 금지

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
