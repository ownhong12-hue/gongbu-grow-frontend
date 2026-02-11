const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const userId = req.user.userId;
        
        const totalHours = await query(`
            SELECT 
                COALESCE(SUM(hours + minutes::decimal/60), 0) as total
            FROM study_logs
            WHERE user_id = $1
        `, [userId]);
        
        const weeklyHours = await query(`
            SELECT 
                COALESCE(SUM(hours + minutes::decimal/60), 0) as total
            FROM study_logs
            WHERE user_id = $1
            AND date >= CURRENT_DATE - INTERVAL '7 days'
        `, [userId]);
        
        const subjectStats = await query(`
            SELECT 
                subject,
                COALESCE(SUM(hours + minutes::decimal/60), 0) as total_hours,
                COUNT(*) as session_count
            FROM study_logs
            WHERE user_id = $1
            GROUP BY subject
            ORDER BY total_hours DESC
        `, [userId]);
        
        res.json({
            success: true,
            totalHours: parseFloat(totalHours.rows[0].total).toFixed(1),
            weeklyHours: parseFloat(weeklyHours.rows[0].total).toFixed(1),
            subjectStats: subjectStats.rows
        });
        
    } catch (error) {
        console.error('User stats error:', error);
        res.status(500).json({ error: '개인 통계 조회 실패' });
    }
}

module.exports = authenticateToken(handler);
