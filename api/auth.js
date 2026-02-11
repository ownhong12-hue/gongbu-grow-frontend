const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./_lib/database');
const { hasProfanity } = require('./_lib/profanity');

const generateUserId = (school, level, nickname) => {
    return `${school}_${level}_${nickname}`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9가-힣_]/g, '');
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { school, school_level, nickname, password, region, district, school_type } = req.body;
        
        if (!school || !school_level || !nickname || !password) {
            return res.status(400).json({ 
                success: false, 
                error: '모든 필드를 입력해주세요' 
            });
        }
        
        if (hasProfanity(nickname)) {
            return res.status(400).json({
                success: false,
                error: '부적절한 닉네임입니다. 다른 닉네임을 사용해주세요.'
            });
        }
        
        if (!/^\d{4}$/.test(password)) {
            return res.status(400).json({ 
                success: false, 
                error: '비밀번호는 4자리 숫자여야 합니다' 
            });
        }
        
        const userId = generateUserId(school, school_level, nickname);
        
        const existingUser = await query(
            'SELECT * FROM users WHERE user_id = $1',
            [userId]
        );
        
        if (existingUser.rows.length > 0) {
            const user = existingUser.rows[0];
            const validPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!validPassword) {
                return res.status(401).json({ 
                    success: false, 
                    error: '비밀번호가 일치하지 않습니다' 
                });
            }
            
            await query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
                [userId]
            );
            
            const token = jwt.sign(
                { userId: user.user_id, nickname: user.nickname },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );
            
            return res.json({
                success: true,
                isNewUser: false,
                token,
                user: {
                    userId: user.user_id,
                    nickname: user.nickname,
                    school: user.school,
                    school_level: user.school_level,
                    tier: user.tier,
                    points: user.points
                }
            });
            
        } else {
            const passwordHash = await bcrypt.hash(password, 10);
            
            const result = await query(`
                INSERT INTO users (
                    user_id, nickname, school, school_level, 
                    region, district, school_type, password_hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                userId, nickname, school, school_level,
                region, district, school_type, passwordHash
            ]);
            
            const newUser = result.rows[0];
            
            const token = jwt.sign(
                { userId: newUser.user_id, nickname: newUser.nickname },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );
            
            return res.status(201).json({
                success: true,
                isNewUser: true,
                token,
                user: {
                    userId: newUser.user_id,
                    nickname: newUser.nickname,
                    school: newUser.school,
                    school_level: newUser.school_level,
                    tier: newUser.tier,
                    points: newUser.points
                }
            });
        }
        
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ 
            success: false, 
            error: '서버 오류가 발생했습니다' 
        });
    }
};
