const { query } = require('./_lib/database');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const urlPath = req.url.split('?')[0];
    const afterApi = urlPath.replace('/api/posts', '');
    
    // POST /api/posts (글 작성)
    if (req.method === 'POST' && afterApi === '') {
        try {
            const {
                user_id,
                nickname = '익명',
                school_level,
                title,
                content
            } = req.body;

            if (!user_id || !school_level || !title || !content) {
                return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
            }

            const result = await query(`
                INSERT INTO posts (user_id, nickname, school_level, title, content)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [user_id, nickname, school_level, title, content]);

            return res.status(201).json({
                message: '게시글이 작성되었습니다!',
                post: result.rows[0]
            });
        } catch (error) {
            console.error('글 작성 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // GET /api/posts?id=123 (단일 글) - 먼저 체크!
    if (req.method === 'GET' && req.query.id) {
        try {
            const postId = req.query.id;
            
            const result = await query(`
                SELECT * FROM posts WHERE id = $1
            `, [postId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
            }
            
            // 조회수 증가
            await query(`
                UPDATE posts SET view_count = view_count + 1 WHERE id = $1
            `, [postId]);
            
            return res.json({
                success: true,
                post: result.rows[0]
            });
        } catch (error) {
            console.error('글 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // GET /api/posts (목록) - 나중에 체크!
    if (req.method === 'GET' && afterApi === '') {
        try {
            const { school_level, sort = 'latest', limit = 20 } = req.query;

            let whereClause = '';
            let params = [];
            let paramIndex = 1;

            if (school_level && school_level !== 'all') {
                whereClause = `WHERE school_level = $${paramIndex++}`;
                params.push(school_level);
            }

            let orderBy = 'ORDER BY created_at DESC';
            if (sort === 'popular') {
                orderBy = 'ORDER BY view_count DESC, created_at DESC';
            }

            const result = await query(`
                SELECT 
                    id, user_id, nickname, school_level, title,
                    SUBSTRING(content, 1, 100) as preview,
                    view_count, comment_count, like_count,
                    created_at
                FROM posts
                ${whereClause}
                ${orderBy}
                LIMIT $${paramIndex}
            `, [...params, parseInt(limit)]);

            return res.json({
                count: result.rows.length,
                posts: result.rows
            });
        } catch (error) {
            console.error('목록 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    return res.status(404).json({ error: 'Not found' });
};
