const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

async function handler(req, res) {
    if (req.method === 'POST') {
        const { exam_name, subject, score, max_score, exam_date } = req.body;
        const userId = req.user.userId;
        
        const result = await query(`
            INSERT INTO grades (user_id, exam_name, subject, score, max_score, exam_date)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [userId, exam_name, subject, score, max_score, exam_date]);
        
        return res.status(201).json({
            success: true,
            grade: result.rows[0]
        });
    }
    
    if (req.method === 'GET') {
        const userId = req.user.userId;
        
        const result = await query(
            'SELECT * FROM grades WHERE user_id = $1 ORDER BY exam_date DESC',
            [userId]
        );
        
        return res.json({
            success: true,
            grades: result.rows
        });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = authenticateToken(handler);
