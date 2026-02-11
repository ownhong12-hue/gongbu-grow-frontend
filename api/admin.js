const { query } = require('./_lib/database');

const adminAuth = (req) => {
    const admin_password = req.headers['admin_password'];
    
    if (!admin_password || admin_password !== process.env.ADMIN_PASSWORD) {
        return false;
    }
    return true;
};

module.exports = async (req, res) => {
    if (!adminAuth(req)) {
        return res.status(401).json({ error: '관리자 권한이 없습니다.' });
    }

    const path = req.url.split('?')[0];
    const pathParts = path.split('/').filter(p => p);
    
    // GET /api/admin/stats
    if (req.method === 'GET' && pathParts[pathParts.length - 1] === 'stats') {
        try {
            const stats = {};
            
            const users = await query(`SELECT COUNT(*) as count FROM users`);
            stats.total_users = parseInt(users.rows[0].count);
            
            const quizzes = await query(`SELECT COUNT(*) as count FROM shared_quizzes`);
            stats.total_quizzes = parseInt(quizzes.rows[0].count);
            
            const reports = await query(`SELECT COUNT(*) as count FROM quiz_reports WHERE status = 'pending'`);
            stats.pending_reports = parseInt(reports.rows[0].count);
            
            const todayQuizzes = await query(`
                SELECT COUNT(*) as count FROM shared_quizzes 
                WHERE DATE(created_at) = CURRENT_DATE
            `);
            stats.today_quizzes = parseInt(todayQuizzes.rows[0].count);
            
            return res.json(stats);
        } catch (error) {
            console.error('통계 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // GET /api/admin/reports
    if (req.method === 'GET' && pathParts[pathParts.length - 1] === 'reports') {
        try {
            const { status = 'pending' } = req.query;
            
            const result = await query(`
                SELECT 
                    r.id as report_id, r.quiz_id, r.reporter_id,
                    r.reason, r.description, r.status,
                    r.created_at as reported_at,
                    q.title as quiz_title,
                    q.user_id as quiz_author_id,
                    q.nickname as quiz_author,
                    COUNT(r2.id) as report_count
                FROM quiz_reports r
                JOIN shared_quizzes q ON r.quiz_id = q.id
                LEFT JOIN quiz_reports r2 ON r.quiz_id = r2.quiz_id
                WHERE r.status = $1
                GROUP BY r.id, q.id
                ORDER BY report_count DESC, r.created_at DESC
            `, [status]);
            
            return res.json({
                count: result.rows.length,
                reports: result.rows
            });
        } catch (error) {
            console.error('신고 목록 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // DELETE /api/admin/quizzes/:id
    if (req.method === 'DELETE' && pathParts[pathParts.length - 2] === 'quizzes') {
        try {
            const id = pathParts[pathParts.length - 1];
            
            await query(`DELETE FROM shared_quizzes WHERE id = $1`, [id]);
            
            return res.json({ message: '퀴즈가 삭제되었습니다.' });
        } catch (error) {
            console.error('퀴즈 삭제 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    return res.status(404).json({ error: 'Not found' });
};
