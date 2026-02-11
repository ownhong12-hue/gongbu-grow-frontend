const { query } = require('../_lib/database');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const categories = ['초등학교', '중학교', '고등학교', '대학교'];
        const topSchools = {};
        
        for (const category of categories) {
            const result = await query(`
                SELECT 
                    u.school,
                    COUNT(DISTINCT u.user_id) as student_count,
                    COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) as total_minutes
                FROM users u
                LEFT JOIN study_logs sl ON u.user_id = sl.user_id
                    AND sl.date >= date_trunc('week', CURRENT_DATE)
                WHERE u.school_level LIKE $1
                GROUP BY u.school
                HAVING COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) > 0
                ORDER BY total_minutes DESC
                LIMIT 3
            `, [`%${category}%`]);
            
            topSchools[category] = result.rows.map((school, index) => ({
                rank: index + 1,
                school: school.school,
                studentCount: parseInt(school.student_count),
                totalHours: Math.floor(school.total_minutes / 60),
                totalMinutes: Math.floor(school.total_minutes % 60)
            }));
        }
        
        res.json({
            success: true,
            period: 'weekly',
            topSchools
        });
        
    } catch (error) {
        console.error('학교 랭킹 조회 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다' });
    }
};
