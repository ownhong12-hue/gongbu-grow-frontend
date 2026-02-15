const { query } = require('./_lib/database');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // POST /api/post-likes (좋아요 추가)
    if (req.method === 'POST') {
        try {
            const { post_id, user_id } = req.body;

            if (!post_id || !user_id) {
                return res.status(400).json({ error: '필수 정보가 없습니다.' });
            }

            // 이미 좋아요 했는지 확인
            const existing = await query(`
                SELECT * FROM post_likes
                WHERE post_id = $1 AND user_id = $2
            `, [post_id, user_id]);

            if (existing.rows.length > 0) {
                return res.status(400).json({ error: '이미 좋아요를 눌렀습니다.' });
            }

            // 좋아요 추가
            await query(`
                INSERT INTO post_likes (post_id, user_id)
                VALUES ($1, $2)
            `, [post_id, user_id]);

            // 좋아요 수 업데이트
            await query(`
                UPDATE posts 
                SET like_count = (SELECT COUNT(*) FROM post_likes WHERE post_id = $1)
                WHERE id = $1
            `, [post_id]);

            return res.json({ success: true, message: '좋아요!' });
        } catch (error) {
            console.error('좋아요 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // DELETE /api/post-likes (좋아요 취소)
    if (req.method === 'DELETE') {
        try {
            const { post_id, user_id } = req.body;

            if (!post_id || !user_id) {
                return res.status(400).json({ error: '필수 정보가 없습니다.' });
            }

            // 좋아요 삭제
            await query(`
                DELETE FROM post_likes
                WHERE post_id = $1 AND user_id = $2
            `, [post_id, user_id]);

            // 좋아요 수 업데이트
            await query(`
                UPDATE posts 
                SET like_count = (SELECT COUNT(*) FROM post_likes WHERE post_id = $1)
                WHERE id = $1
            `, [post_id]);

            return res.json({ success: true, message: '좋아요 취소' });
        } catch (error) {
            console.error('좋아요 취소 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    return res.status(404).json({ error: 'Not found' });
};
