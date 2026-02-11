const { query } = require('./_lib/database');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const activeNow = await query(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM users
            WHERE last_login > NOW() - INTERVAL '10 minutes'
        `);
        
        const todayActive = await query(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM users
            WHERE last_login::date = CURRENT_DATE
        `);
        
        const totalUsers = await query('SELECT COUNT(*) as count FROM users');
        
        res.json({
            success: true,
            activeNow: parseInt(activeNow.rows[0].count) || 0,
            todayActive: parseInt(todayActive.rows[0].count) || 0,
            totalUsers: parseInt(totalUsers.rows[0].count) || 0
        });
        
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: '통계 조회 실패' });
    }
};
