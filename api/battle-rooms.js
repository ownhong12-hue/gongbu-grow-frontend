const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function handler(req, res) {
    const path = req.url.split('?')[0];
    const pathParts = path.split('/').filter(p => p);

    // POST /api/battle-rooms - 방 만들기
    if (req.method === 'POST' && pathParts[pathParts.length - 1] === 'battle-rooms') {
        try {
            const { school_level, grade, semester, subject } = req.body;

            if (!school_level || !grade || !semester || !subject) {
                return res.status(400).json({ error: '필수 항목이 없습니다.' });
            }

            // 문제 5개 랜덤으로 가져오기
            const questions = await query(
                `SELECT id, question, options, answer, explanation
                 FROM battle_questions
                 WHERE status = 'approved'
                   AND school_level = $1
                   AND grade = $2
                   AND semester = $3
                   AND subject = $4
                 ORDER BY RANDOM()
                 LIMIT 5`,
                [school_level, grade, semester, subject]
            );

            if (questions.rows.length === 0) {
                return res.status(404).json({ error: '해당 조건의 문제가 없습니다.' });
            }

            // 방 코드 생성
            let roomCode;
            let attempts = 0;
            while (attempts < 10) {
                roomCode = generateRoomCode();
                const existing = await query(
                    `SELECT id FROM battle_rooms WHERE room_code = $1 AND status != 'finished'`,
                    [roomCode]
                );
                if (existing.rows.length === 0) break;
                attempts++;
            }

            // 방 생성
            const room = await query(
                `INSERT INTO battle_rooms 
                    (room_code, host_id, school_level, grade, semester, subject, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'waiting')
                 RETURNING id`,
                [roomCode, req.user.userId, school_level, grade, semester, subject]
            );

            return res.status(201).json({
                room_id: room.rows[0].id,
                room_code: roomCode
            });

        } catch (error) {
            console.error('방 생성 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // POST /api/battle-rooms/join - 방 참가
    if (req.method === 'POST' && pathParts[pathParts.length - 1] === 'join') {
        try {
            const { room_code } = req.body;

            const room = await query(
                `SELECT * FROM battle_rooms WHERE room_code = $1 AND status = 'waiting'`,
                [room_code]
            );

            if (room.rows.length === 0) {
                return res.status(404).json({ error: '방을 찾을 수 없거나 이미 시작된 방입니다.' });
            }

            const roomData = room.rows[0];

            if (roomData.host_id === req.user.userId) {
                return res.status(400).json({ error: '자신이 만든 방에는 참가할 수 없습니다.' });
            }

            // 방 상태 업데이트
            await query(
                `UPDATE battle_rooms SET guest_id = $1, status = 'playing' WHERE id = $2`,
                [req.user.userId, roomData.id]
            );

            // 문제 가져오기
            const questions = await query(
                `SELECT id, question, options, answer, explanation
                 FROM battle_questions
                 WHERE status = 'approved'
                   AND school_level = $1
                   AND grade = $2
                   AND semester = $3
                   AND subject = $4
                 ORDER BY RANDOM()
                 LIMIT 5`,
                [roomData.school_level, roomData.grade, roomData.semester, roomData.subject]
            );

            return res.json({
                room_id: roomData.id,
                questions: questions.rows
            });

        } catch (error) {
            console.error('방 참가 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // GET /api/battle-rooms/:id - 방 상태 확인
    if (req.method === 'GET' && pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'battle-rooms') {
        try {
            const roomId = pathParts[pathParts.length - 1];

            const room = await query(
                `SELECT * FROM battle_rooms WHERE id = $1`,
                [roomId]
            );

            if (room.rows.length === 0) {
                return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
            }

            const roomData = room.rows[0];

            if (roomData.status !== 'playing') {
                return res.json({ status: roomData.status });
            }

            // 문제 가져오기
            const questions = await query(
                `SELECT id, question, options, answer, explanation
                 FROM battle_questions
                 WHERE status = 'approved'
                   AND school_level = $1
                   AND grade = $2
                   AND semester = $3
                   AND subject = $4
                 ORDER BY RANDOM()
                 LIMIT 5`,
                [roomData.school_level, roomData.grade, roomData.semester, roomData.subject]
            );

            return res.json({
                status: roomData.status,
                questions: questions.rows,
                host_score: roomData.host_score,
                guest_score: roomData.guest_score
            });

        } catch (error) {
            console.error('방 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // POST /api/battle-rooms/:id/answer - 답변 제출
    if (req.method === 'POST' && pathParts[pathParts.length - 1] === 'answer') {
        try {
            const roomId = pathParts[pathParts.length - 2];
            const { question_id, selected_answer, question_index } = req.body;

            const room = await query(
                `SELECT * FROM battle_rooms WHERE id = $1`,
                [roomId]
            );

            if (room.rows.length === 0) {
                return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
            }

            const roomData = room.rows[0];

            // 정답 확인
            const questionData = await query(
                `SELECT answer FROM battle_questions WHERE id = $1`,
                [question_id]
            );

            const isCorrect = questionData.rows.length > 0 &&
                questionData.rows[0].answer === selected_answer;

            // 답변 저장
            await query(
                `INSERT INTO battle_answers (room_id, user_id, question_id, selected_answer, is_correct)
                 VALUES ($1, $2, $3, $4, $5)`,
                [roomId, req.user.userId, question_id, selected_answer, isCorrect]
            );

            // 점수 업데이트
            if (isCorrect) {
                const isHost = roomData.host_id === req.user.userId;
                await query(
                    `UPDATE battle_rooms SET ${isHost ? 'host_score' : 'guest_score'} = ${isHost ? 'host_score' : 'guest_score'} + 1 WHERE id = $1`,
                    [roomId]
                );
            }

            return res.json({ is_correct: isCorrect });

        } catch (error) {
            console.error('답변 제출 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    // GET /api/battle-rooms/:id/scores - 점수 확인
    if (req.method === 'GET' && pathParts[pathParts.length - 1] === 'scores') {
        try {
            const roomId = pathParts[pathParts.length - 2];

            const room = await query(
                `SELECT host_score, guest_score FROM battle_rooms WHERE id = $1`,
                [roomId]
            );

            if (room.rows.length === 0) {
                return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
            }

            return res.json({
                host_score: room.rows[0].host_score,
                guest_score: room.rows[0].guest_score
            });

        } catch (error) {
            console.error('점수 조회 오류:', error);
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    }

    return res.status(404).json({ error: 'Not found' });
}

module.exports = authenticateToken(handler);
