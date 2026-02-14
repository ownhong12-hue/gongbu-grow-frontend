const { query } = require('./_lib/database');
const { checkQuizProfanity } = require('./_lib/profanity');

module.exports = async (req, res) => {
    const path = req.url.split('?')[0];
    const pathParts = path.split('/').filter(p => p);
    
    // POST /api/quizzes/upload
   if (req.method === 'POST') {

        try {
            const {
                user_id, nickname, quiz_type = 'normal',
                school_level, grade, subject, title, description,
                quiz_data, difficulty
            } = req.body;

            if (!user_id || !title || !quiz_data) {
                return res.status(400).json({ error: '필수 정보를 모두 입력해주세요.' });
            }

            const quizToCheck = {
                title, description,
                questions: quiz_data.questions || []
            };
            
            if (checkQuizProfanity(quizToCheck)) {
                return res.status(400).json({ 
                    error: '부적절한 단어가 포함되어 있습니다. 내용을 수정해주세요.' 
                });
            }

            if (quiz_type === 'normal' && (!school_level || !grade || !subject)) {
                return res.status(400).json({ error: '일반 퀴즈는 학교급, 학년, 과목이 필요합니다.' });
            }

            const result = await query(`
                INSERT INTO shared_quizzes (
                    user_id, nickname, quiz_type, school_level, grade, subject, 
                    title, description, quiz_data, difficulty
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
            `, [user_id, nickname, quiz_type, school_level, grade, subject, title, description, JSON.stringify(quiz_data), difficulty]);

            return res.status(201).json({
                message: '퀴즈가 성공적으로 업로드되었습니다!',
                quiz: result.rows[0]
            });
        } catch (error) {
            console.error('퀴즈 업로드 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    // GET /api/quizzes (목록)
    if (req.method === 'GET' && pathParts.length === 2) {
        try {
            const { quiz_type, school_level, grade, subject, sort = 'latest', limit = 20 } = req.query;

            let whereConditions = [];
            let params = [];
            let paramIndex = 1;

            if (quiz_type) {
                whereConditions.push(`quiz_type = $${paramIndex++}`);
                params.push(quiz_type);
            }
            if (school_level) {
                whereConditions.push(`school_level = $${paramIndex++}`);
                params.push(school_level);
            }
            if (grade) {
                whereConditions.push(`grade = $${paramIndex++}`);
                params.push(parseInt(grade));
            }
            if (subject) {
                whereConditions.push(`subject = $${paramIndex++}`);
                params.push(subject);
            }

            const whereClause = whereConditions.length > 0 
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            let orderBy = '';
            switch (sort) {
                case 'popular':
                    orderBy = 'ORDER BY view_count DESC, like_count DESC';
                    break;
                case 'likes':
                    orderBy = 'ORDER BY like_count DESC';
                    break;
                case 'solves':
                    orderBy = 'ORDER BY solve_count DESC';
                    break;
                default:
                    orderBy = 'ORDER BY created_at DESC';
            }

            const result = await query(`
                SELECT 
                    id, user_id, nickname, quiz_type, school_level, grade, subject,
                    title, description, difficulty,
                    view_count, solve_count, like_count, created_at
                FROM shared_quizzes
                ${whereClause}
                ${orderBy}
                LIMIT $${paramIndex}
            `, [...params, parseInt(limit)]);

            return res.json({
                count: result.rows.length,
                quizzes: result.rows
            });
        } catch (error) {
            console.error('퀴즈 목록 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }
    
    return res.status(404).json({ error: 'Not found' });
};
