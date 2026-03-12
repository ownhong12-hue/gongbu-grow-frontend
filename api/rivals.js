const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const action = req.query.action;

    // 학교 라이벌 (?action=school)
    if (action === 'school') {
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
                    u.user_id, u.nickname, u.school, u.school_level, u.points, u.tier,
                    COALESCE(SUM(CASE 
                        WHEN sl.date >= date_trunc('week', CURRENT_DATE) 
                        THEN (sl.hours * 60 + sl.minutes) ELSE 0 
                    END), 0) as weekly_minutes,
                    COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) as total_minutes
                FROM users u
                LEFT JOIN study_logs sl ON u.user_id = sl.user_id
                WHERE u.school = $1
                GROUP BY u.user_id, u.nickname, u.school, u.school_level, u.points, u.tier
                ORDER BY total_minutes DESC
                LIMIT 50
            `, [school]);

            return res.json({
                school, school_level,
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
            });
        } catch (error) {
            console.error('학교 라이벌 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다', details: error.message });
        }
    }

    // 전국 랭킹 (?action=global)
    if (action === 'global') {
        try {
            let schoolCategory = req.query.schoolLevel;

            if (!schoolCategory) {
                const user = await query(
                    'SELECT school_level FROM users WHERE user_id = $1',
                    [req.user.userId]
                );
                if (user.rows.length === 0) {
                    return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
                }
                const { school_level } = user.rows[0];
                if (school_level.includes('초등학교')) schoolCategory = '초등학교';
                else if (school_level.includes('중학교')) schoolCategory = '중학교';
                else if (school_level.includes('고등학교')) schoolCategory = '고등학교';
                else if (school_level.includes('대학교')) schoolCategory = '대학교';
                else if (school_level.includes('대학원')) schoolCategory = '대학원';
                else schoolCategory = school_level;
            }

            const totalCountResult = await query(`
                SELECT COUNT(*) as total FROM users WHERE school_level LIKE $1
            `, [`%${schoolCategory}%`]);

            const totalCount = parseInt(totalCountResult.rows[0].total);

            const globalRanking = await query(`
                SELECT 
                    u.user_id, u.nickname, u.school, u.school_level, u.region, u.points, u.tier,
                    COALESCE(SUM(CASE 
                        WHEN sl.date >= date_trunc('week', CURRENT_DATE) 
                        THEN (sl.hours * 60 + sl.minutes) ELSE 0 
                    END), 0) as weekly_minutes,
                    COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) as total_minutes
                FROM users u
                LEFT JOIN study_logs sl ON u.user_id = sl.user_id
                WHERE u.school_level LIKE $1
                GROUP BY u.user_id, u.nickname, u.school, u.school_level, u.region, u.points, u.tier
                ORDER BY total_minutes DESC
                LIMIT 500
            `, [`%${schoolCategory}%`]);

            const weeklyRanking = await query(`
                SELECT 
                    u.user_id, u.nickname, u.school, u.school_level, u.region, u.points, u.tier,
                    COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) as weekly_minutes
                FROM users u
                LEFT JOIN study_logs sl ON u.user_id = sl.user_id 
                    AND sl.date >= date_trunc('week', CURRENT_DATE)
                WHERE u.school_level LIKE $1
                GROUP BY u.user_id, u.nickname, u.school, u.school_level, u.region, u.points, u.tier
                ORDER BY weekly_minutes DESC
                LIMIT 500
            `, [`%${schoolCategory}%`]);

            return res.json({
                schoolCategory, totalCount,
                totalRanking: globalRanking.rows.map((r, index) => ({
                    rank: index + 1,
                    userId: r.user_id,
                    nickname: r.nickname,
                    school: r.school,
                    schoolLevel: r.school_level,
                    region: r.region,
                    totalMinutes: parseInt(r.total_minutes),
                    totalHours: Math.floor(r.total_minutes / 60),
                    points: r.points, tier: r.tier,
                    isCurrentUser: r.user_id === req.user.userId
                })),
                weeklyRanking: weeklyRanking.rows.map((r, index) => ({
                    rank: index + 1,
                    userId: r.user_id,
                    nickname: r.nickname,
                    school: r.school,
                    schoolLevel: r.school_level,
                    region: r.region,
                    weeklyMinutes: parseInt(r.weekly_minutes),
                    weeklyHours: Math.floor(r.weekly_minutes / 60),
                    points: r.points, tier: r.tier,
                    isCurrentUser: r.user_id === req.user.userId
                }))
            });
        } catch (error) {
            console.error('전국 랭킹 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다', details: error.message });
        }
    }

    // 탑스쿨 (?action=top-schools) - 토큰 불필요하지만 여기선 통합
    if (action === 'top-schools') {
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

            return res.json({ success: true, period: 'weekly', topSchools });
        } catch (error) {
            console.error('학교 랭킹 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다' });
        }
    }

    return res.status(400).json({ error: 'action 파라미터가 필요합니다 (school, global, top-schools)' });
}

module.exports = authenticateToken(handler);
