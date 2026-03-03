const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

function gettier(points) {
    if (points >= 2000) return { tier: 'Challenger', emoji: '⚡' };
    if (points >= 1500) return { tier: 'Master', emoji: '👑' };
    if (points >= 1000) return { tier: 'Diamond', emoji: '💎' };
    if (points >= 600) return { tier: 'Platinum', emoji: '💜' };
    if (points >= 300) return { tier: 'Gold', emoji: '🥇' };
    if (points >= 100) return { tier: 'Silver', emoji: '🥈' };
    return { tier: 'Bronze', emoji: '🥉' };
}

async function handler(req, res) {
    const path = req.url.split('?')[0];
    const pathParts = path.split('/').filter(p => p);
    const lastPart = pathParts[pathParts.length - 1];

    // GET /api/battle-ratings/me - 내 점수 조회
    if (req.method === 'GET' && lastPart === 'me') {
        try {
            const result = await query(
                `SELECT * FROM battle_ratings WHERE user_id = $1`,
                [req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.json({
                    points: 0,
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    ...gettier(0)
                });
            }

            const data = result.rows[0];
            return res.json({
                points: data.points,
                wins: data.wins,
                losses: data.losses,
                draws: data.draws,
                ...gettier(data.points)
            });

        } catch (error) {
            console.error('점수 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // POST /api/battle-ratings/update - 점수 업데이트
    if (req.method === 'POST' && lastPart === 'update') {
        try {
            const { result } = req.body; // 'win', 'loss', 'draw'

            const pointsMap = { win: 25, loss: -15, draw: 5 };
            const points = pointsMap[result] || 0;

            await query(
                `INSERT INTO battle_ratings (user_id, points, wins, losses, draws)
                 VALUES ($1, GREATEST(0, $2), $3, $4, $5)
                 ON CONFLICT (user_id) DO UPDATE SET
                     points = GREATEST(0, battle_ratings.points + $2),
                     wins = battle_ratings.wins + $3,
                     losses = battle_ratings.losses + $4,
                     draws = battle_ratings.draws + $5,
                     updated_at = NOW()`,
                [
                    req.user.userId,
                    points,
                    result === 'win' ? 1 : 0,
                    result === 'loss' ? 1 : 0,
                    result === 'draw' ? 1 : 0
                ]
            );

            const updated = await query(
                `SELECT * FROM battle_ratings WHERE user_id = $1`,
                [req.user.userId]
            );

            const data = updated.rows[0];
            return res.json({
                points: data.points,
                ...gettier(data.points)
            });

        } catch (error) {
            console.error('점수 업데이트 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // GET /api/battle-ratings/leaderboard - 리더보드
    if (req.method === 'GET' && lastPart === 'leaderboard') {
        try {
            const result = await query(
                `SELECT user_id, points, wins, losses, draws
                 FROM battle_ratings
                 ORDER BY points DESC
                 LIMIT 50`
            );

            const leaderboard = result.rows.map((row, index) => ({
                rank: index + 1,
                user_id: row.user_id,
                nickname: row.user_id.split('_').pop(),
                points: row.points,
                wins: row.wins,
                losses: row.losses,
                draws: row.draws,
                ...gettier(row.points)
            }));

            return res.json({ leaderboard });

        } catch (error) {
            console.error('리더보드 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    return res.status(404).json({ error: 'Not found' });
}

module.exports = authenticateToken(handler);
