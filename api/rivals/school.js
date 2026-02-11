const { query } = require('../_lib/database');
const { authenticateToken } = require('../_lib/middleware');

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const user = await query(
            'SELECT school, school_level FROM users WHERE user_id = $1',
            [req.user.userId]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
        }
        
        const { school, school_level } = user.rows[0];
        
        const rivals = await query(`
            SELECT 
                u.user_id,
                u.nickname,
                u.school,
                u.school_level,
                u.points,
                u.tier,
                COALESCE(SUM(CASE 
                    WHEN sl.date >= date_trunc('week', CURRENT_DATE) 
                    THEN (sl.hours * 60 + sl.minutes) 
                    ELSE 0 
                END), 0) as weekly_minutes,
                COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) as total_minutes
            FROM users u
            LEFT JOIN study_logs sl ON u.user_id = sl.user_id
            WHERE u.school = $1
            GROUP BY u.user_id, u.nickname, u.school, u.school_level, u.points, u.tier
            ORDER BY total_minutes DESC
            LIMIT 50
        `, [school]);
        
        const response = {
            school,
            school_level,
            rivals: rivals.rows.map((r, index) => ({
                rank: index + 1,
                userId: r.user_id,
                nickname: r.nickname,
                school: r.school,
                schoolLevel: r.school_level,
                weeklyMinutes: parseInt(r.weekly_minutes),
                totalMinutes: parseInt(r.total_minutes),
                weeklyHours: Math.floor(r.weekly_minutes / 60),
                totalHours: Math.floor(r.total_minutes / 60),
                points: r.points,
                tier: r.tier,
                isCurrentUser: r.user_id === req.user.userId
            }))
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('학교 라이벌 조회 오류:', error);
        res.status(500).json({ 
            error: '서버 오류가 발생했습니다',
            details: error.message 
        });
    }
}

module.exports = authenticateToken(handler);
