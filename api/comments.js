const { query } = require('./_lib/database');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // POST /api/comments (댓글 작성)
    if (req.method === 'POST') {
        try {
            const { post_id, user_id, nickname = '익명', content } = req.body;

            if (!post_id || !user_id || !content) {
                return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
            }

            const result = await query(`
                INSERT INTO comments (post_id, user_id, nickname, content)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [post_id, user_id, nickname, content]);

            // 댓글 수 업데이트
            await query(`
                UPDATE posts 
                SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = $1)
                WHERE id = $1
            `, [post_id]);

            return res.status(201).json({
                success: true,
                comment: result.rows[0]
            });
        } catch (error) {
            console.error('댓글 작성 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // GET /api/comments?post_id=123 (댓글 목록)
    if (req.method === 'GET' && req.query.post_id) {
        try {
            const postId = req.query.post_id;

            const result = await query(`
                SELECT * FROM comments
                WHERE post_id = $1
                ORDER BY created_at ASC
            `, [postId]);

            return res.json({
                success: true,
                comments: result.rows
            });
        } catch (error) {
            console.error('댓글 목록 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    return res.status(404).json({ error: 'Not found' });
};
