const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

async function handler(req, res) {
    const path = req.url.split('?')[0];
    const pathParts = path.split('/').filter(p => p);
    const lastPart = pathParts[pathParts.length - 1];

    // POST /api/matchmaking - 대기열 입장 or 매칭
    if (req.method === 'POST' && lastPart === 'matchmaking') {
        try {
            const { school_level, grade, semester, subject } = req.body;

            if (!school_level || !grade || !semester || !subject) {
                return res.status(400).json({ error: '필수 항목이 없습니다.' });
            }

            // 기존 대기열에서 나 제거 (중복 방지)
            await query(
                `DELETE FROM matchmaking_queue WHERE user_id = $1 AND status = 'waiting'`,
                [req.user.userId]
            );

            // 같은 조건으로 대기 중인 상대 찾기
            const opponent = await query(
                `SELECT * FROM matchmaking_queue 
                 WHERE school_level = $1 AND grade = $2 AND semester = $3 AND subject = $4
                   AND status = 'waiting' AND user_id != $5
                 ORDER BY created_at ASC
                 LIMIT 1`,
                [school_level, grade, semester, subject, req.user.userId]
            );

            if (opponent.rows.length > 0) {
                // 상대 찾음 - 방 만들기
                const opponentData = opponent.rows[0];

                // 문제 가져오기
                const questions = await query(
                    `SELECT id, question, options, answer, explanation
                     FROM battle_questions
                     WHERE status = 'approved'
                       AND school_level = $1 AND grade = $2 AND semester = $3 AND subject = $4
                     ORDER BY RANDOM() LIMIT 5`,
                    [school_level, grade, semester, subject]
                );

                if (questions.rows.length === 0) {
                    return res.status(404).json({ error: '해당 조건의 문제가 없습니다.' });
                }

                // 방 생성
                const room = await query(
    `INSERT INTO battle_rooms 
        (room_code, host_id, guest_id, school_level, grade, semester, subject, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'playing')
     RETURNING id`,
    ['MM' + Math.random().toString(36).substring(2, 6).toUpperCase(), opponentData.user_id, req.user.userId, school_level, grade, semester, subject]
);

                const roomId = room.rows[0].id;

                // 상대 대기열 업데이트
                await query(
                    `UPDATE matchmaking_queue SET status = 'matched', room_id = $1 WHERE id = $2`,
                    [roomId, opponentData.id]
                );

                return res.json({
                    matched: true,
                    room_id: roomId,
                    role: 'guest',
                    questions: questions.rows
                });

            } else {
                // 상대 없음 - 대기열 등록
                const queued = await query(
                    `INSERT INTO matchmaking_queue 
                        (user_id, school_level, grade, semester, subject, status)
                     VALUES ($1, $2, $3, $4, $5, 'waiting')
                     RETURNING id`,
                    [req.user.userId, school_level, grade, semester, subject]
                );

                return res.json({
                    matched: false,
                    queue_id: queued.rows[0].id
                });
            }

        } catch (error) {
            console.error('매칭 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // GET /api/matchmaking/status?queue_id=xxx - 매칭 상태 확인
    if (req.method === 'GET' && lastPart === 'status') {
        try {
            const { queue_id } = req.query;

            const result = await query(
                `SELECT * FROM matchmaking_queue WHERE id = $1`,
                [queue_id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: '대기열을 찾을 수 없습니다.' });
            }

            const queueData = result.rows[0];

            if (queueData.status === 'matched' && queueData.room_id) {
                // 문제 가져오기
                const questions = await query(
                    `SELECT id, question, options, answer, explanation
                     FROM battle_questions
                     WHERE status = 'approved'
                       AND school_level = $1 AND grade = $2 AND semester = $3 AND subject = $4
                     ORDER BY RANDOM() LIMIT 5`,
                    [queueData.school_level, queueData.grade, queueData.semester, queueData.subject]
                );

                return res.json({
                    matched: true,
                    room_id: queueData.room_id,
                    role: 'host',
                    questions: questions.rows
                });
            }

            return res.json({ matched: false });

        } catch (error) {
            console.error('매칭 상태 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // DELETE /api/matchmaking - 대기열 취소
    if (req.method === 'DELETE') {
        try {
            await query(
                `DELETE FROM matchmaking_queue WHERE user_id = $1 AND status = 'waiting'`,
                [req.user.userId]
            );
            return res.json({ message: '대기열에서 제거되었습니다.' });
        } catch (error) {
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    return res.status(404).json({ error: 'Not found' });
}

module.exports = authenticateToken(handler);
