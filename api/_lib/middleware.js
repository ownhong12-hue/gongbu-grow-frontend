const jwt = require('jsonwebtoken');

const authenticateToken = (handler) => async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: '인증 토큰이 필요합니다' });
        }
        
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = user;
        
        return handler(req, res);
    } catch (err) {
        return res.status(403).json({ error: '유효하지 않은 토큰입니다' });
    }
};

module.exports = {
    authenticateToken
};
