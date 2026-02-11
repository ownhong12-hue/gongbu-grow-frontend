const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');
const { calculateTierFromRank } = require('./_lib/tier-system');

async function updateUserTier(userId) {
    try {
        const userInfo = await query(
            'SELECT school_level FROM users WHERE user_id = $1',
            [userId]
        );
        
        if (userInfo.rows.length === 0) return;
        
        const { school_level } = userInfo.rows[0];
        
        let schoolCategory;
        if (school_level.includes('초등학교')) {
            schoolCategory = '초등학교';
        } else if (school_level.includes('중학교')) {
            schoolCategory = '중학교';
        } else if (school_level.includes('고등학교')) {
            schoolCategory = '고등학교';
        } else if (school_level.includes('대학교')) {
            schoolCategory = '대학교';
        } else if (school_level.includes('대학원')) {
            schoolCategory = '대학원';
        } else {
            schoolCategory = school_level;
        }
        
        const totalUsersResult = await query(`
            SELECT COUNT(*) as total 
            FROM users 
            WHERE school_level LIKE $1
        `, [`%${schoolCategory}%`]);
        
        const totalUsers = parseInt(totalUsersResult.rows[0].total);
        
        const myRankResult = await query(`
            WITH ranked_users AS (
                SELECT 
                    u.user_id,
                    COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) as total_minutes,
                    RANK() OVER (ORDER BY COALESCE(SUM(sl.hours * 60 + sl.minutes), 0) DESC) as rank
                FROM users u
                LEFT JOIN study_logs sl ON u.user_id = sl.user_id
                WHERE u.school_level LIKE $1
                GROUP BY u.user_id
            )
            SELECT rank FROM ranked_users WHERE user_id = $2
        `, [`%${schoolCategory}%`, userId]);
        
        if (myRankResult.rows.length === 0) return;
        
        const myRank = parseInt(myRankResult.rows[0].rank);
        const tierInfo = calculateTierFromRank(myRank, totalUsers);
        
        await query(
            'UPDATE users SET tier = $1 WHERE user_id = $2',
            [tierInfo.name, userId]
        );
        
    } catch (error) {
        console.error('티어 업데이트 오류:', error);
    }
}

async function handler(req, res) {
    if (req.method === 'POST') {
        const { subject, hours, minutes, date, notes } = req.body;
        const userId = req.user.userId;
        
        const result = await query(`
            INSERT INTO study_logs (user_id, subject, hours, minutes, date, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [userId, subject, hours || 0, minutes || 0, date, notes]);
        
        await updateUserTier(userId);
        
        return res.status(201).json({
            success: true,
            log: result.rows[0]
        });
    }
    
    if (req.method === 'GET') {
        const userId = req.user.userId;
        const { startDate, endDate } = req.query;
        
        let queryText = 'SELECT * FROM study_logs WHERE user_id = $1';
        let params = [userId];
        
        if (startDate && endDate) {
            queryText += ' AND date BETWEEN $2 AND $3';
            params.push(startDate, endDate);
        }
        
        queryText += ' ORDER BY date DESC, created_at DESC';
        
        const result = await query(queryText, params);
        
        return res.json({
            success: true,
            logs: result.rows
        });
    }
    
    if (req.method === 'DELETE') {
        const userId = req.user.userId;
        const logId = req.url.split('/').pop();
        
        await query(
            'DELETE FROM study_logs WHERE id = $1 AND user_id = $2',
            [logId, userId]
        );
        
        await updateUserTier(userId);
        
        return res.json({ success: true });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = authenticateToken(handler);
