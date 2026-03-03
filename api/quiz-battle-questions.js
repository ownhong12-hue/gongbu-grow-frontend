const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { school_level, grade, semester, subject, count = 5 } = req.query;

    if (!school_level || !grade || !semester || !subject) {
        return res.status(400).json({ error: 'school_level, grade, semester, subject는 필수입니다.' });
    }

    try {
        const result = await query(
            `SELECT id, subject, grade, question, options, answer, explanation, difficulty
             FROM battle_questions
             WHERE status = 'approved'
               AND school_level = $1
               AND grade = $2
               AND semester = $3
               AND subject = $4
             ORDER BY RANDOM()
             LIMIT $5`,
            [school_level, grade, semester, subject, parseInt(count)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '해당 조건의 문제가 없습니다. 관리자에게 문의하세요.' });
        }

        return res.json({ questions: result.rows });

    } catch (error) {
        console.error('문제 조회 오류:', error);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

module.exports = authenticateToken(handler);
