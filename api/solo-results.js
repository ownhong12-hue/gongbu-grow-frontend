const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { school_level, grade, semester, subject, total_questions, correct_count } = req.body;

    if (!school_level || !grade || !semester || !subject) {
        return res.status(400).json({ error: '필수 항목이 없습니다.' });
    }

    try {
        await query(
            `INSERT INTO solo_results 
                (user_id, school_level, grade, semester, subject, total_questions, correct_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.user.userId, school_level, grade, semester, subject, total_questions, correct_count]
        );

        return res.status(201).json({ message: '결과가 저장되었습니다.' });

    } catch (error) {
        console.error('솔로 결과 저장 오류:', error);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

module.exports = authenticateToken(handler);
