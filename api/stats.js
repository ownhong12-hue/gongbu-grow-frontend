const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

// 공개 통계 (토큰 불필요)
async function publicStats(req, res) {
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
}

// 개인 통계 (토큰 필요)
async function userStats(req, res) {
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

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ?action=public 이면 토큰 없이 공개 통계
    if (req.query.action === 'public') {
        return publicStats(req, res);
    }

    // 나머지는 개인 통계 (토큰 필요)
    return userStats(req, res);
}

async function mainHandler(req, res) {
    if (req.query.action === 'public') {
        return publicStats(req, res);
    }
    return authenticateToken(handler)(req, res);
}

module.exports = mainHandler;
