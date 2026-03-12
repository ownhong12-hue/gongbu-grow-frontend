const { query } = require('./_lib/database');
const { authenticateToken } = require('./_lib/middleware');

// 6자리 랜덤 코드 생성
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function handler(req, res) {

  // role 설정
  if (req.method === 'PUT' && req.query.action === 'set-role') {
    const { role } = req.body;
    const userId = req.user.userId;

    if (!['teacher', 'student', 'both'].includes(role)) {
      return res.status(400).json({ error: '유효하지 않은 role입니다.' });
    }

    await query(
      'UPDATE users SET role = $1 WHERE user_id = $2',
      [role, userId]
    );

    return res.json({ success: true, role });
  }

  // 내 role 조회
  if (req.method === 'GET' && req.query.action === 'my-role') {
    const userId = req.user.userId;

    const result = await query(
      'SELECT role FROM users WHERE user_id = $1',
      [userId]
    );

    return res.json({ success: true, role: result.rows[0]?.role || null });
  }

  // 과외방 생성 (선생님)
  if (req.method === 'POST' && req.query.action === 'create') {
    const { room_name } = req.body;
    const userId = req.user.userId;

    if (!room_name) {
      return res.status(400).json({ error: '방 이름을 입력해주세요.' });
    }

    // 중복 없는 코드 생성
    let room_code;
    let exists = true;
    while (exists) {
      room_code = generateRoomCode();
      const check = await query(
        'SELECT id FROM tutoring_rooms WHERE room_code = $1',
        [room_code]
      );
      exists = check.rows.length > 0;
    }

    const result = await query(`
      INSERT INTO tutoring_rooms (room_code, teacher_id, room_name)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [room_code, userId, room_name]);

    return res.status(201).json({ success: true, room: result.rows[0] });
  }

  // 과외방 참여 (학생, 코드 입력)
  if (req.method === 'POST' && req.query.action === 'join') {
    const { room_code } = req.body;
    const userId = req.user.userId;

    if (!room_code) {
      return res.status(400).json({ error: '코드를 입력해주세요.' });
    }

    // 방 존재 확인
    const roomResult = await query(
      'SELECT * FROM tutoring_rooms WHERE room_code = $1',
      [room_code.toUpperCase()]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: '존재하지 않는 코드입니다.' });
    }

    const room = roomResult.rows[0];

    // 선생님 본인이 참여하려는 경우 방지
    if (room.teacher_id === userId) {
      return res.status(400).json({ error: '본인이 만든 방입니다.' });
    }

    // 이미 참여 중인지 확인
    const memberCheck = await query(
      'SELECT id FROM tutoring_members WHERE room_id = $1 AND student_id = $2',
      [room.id, userId]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ error: '이미 참여 중인 방입니다.' });
    }

    await query(
      'INSERT INTO tutoring_members (room_id, student_id) VALUES ($1, $2)',
      [room.id, userId]
    );

    return res.json({ success: true, room });
  }

  // 내 과외방 목록 조회
  if (req.method === 'GET' && req.query.action === 'my-rooms') {
    const userId = req.user.userId;

    // 선생님으로 만든 방
    const teacherRooms = await query(`
      SELECT r.*, 'teacher' as my_role,
        COUNT(m.id) as member_count
      FROM tutoring_rooms r
      LEFT JOIN tutoring_members m ON m.room_id = r.id
      WHERE r.teacher_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `, [userId]);

    // 학생으로 참여한 방
    const studentRooms = await query(`
      SELECT r.*, 'student' as my_role,
        u.nickname as teacher_nickname
      FROM tutoring_rooms r
      JOIN tutoring_members m ON m.room_id = r.id
      JOIN users u ON u.user_id = r.teacher_id
      WHERE m.student_id = $1
      ORDER BY m.joined_at DESC
    `, [userId]);

    return res.json({
      success: true,
      teacher_rooms: teacherRooms.rows,
      student_rooms: studentRooms.rows
    });
  }

  // 과외방 단일 조회
  if (req.method === 'GET' && req.query.action === 'room-detail') {
    const { room_id } = req.query;
    const userId = req.user.userId;

    const result = await query(`
      SELECT r.*, u.nickname as teacher_nickname
      FROM tutoring_rooms r
      JOIN users u ON u.user_id = r.teacher_id
      WHERE r.id = $1
    `, [room_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    }

    return res.json({ success: true, room: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = authenticateToken(handler);
