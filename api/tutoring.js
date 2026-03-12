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
  const action = req.query.action;

  // ==================== ROOM ====================

  // role 설정
  if (req.method === 'PUT' && action === 'set-role') {
    const { role } = req.body;
    const userId = req.user.userId;
    if (!['teacher', 'student', 'both'].includes(role)) {
      return res.status(400).json({ error: '유효하지 않은 role입니다.' });
    }
    await query('UPDATE users SET role = $1 WHERE user_id = $2', [role, userId]);
    return res.json({ success: true, role });
  }

  // role 조회
  if (req.method === 'GET' && action === 'my-role') {
    const userId = req.user.userId;
    const result = await query('SELECT role FROM users WHERE user_id = $1', [userId]);
    return res.json({ success: true, role: result.rows[0]?.role || null });
  }

  // 과외방 생성
  if (req.method === 'POST' && action === 'create-room') {
    const { room_name } = req.body;
    const userId = req.user.userId;
    if (!room_name) return res.status(400).json({ error: '방 이름을 입력해주세요.' });

    let room_code;
    let exists = true;
    while (exists) {
      room_code = generateRoomCode();
      const check = await query('SELECT id FROM tutoring_rooms WHERE room_code = $1', [room_code]);
      exists = check.rows.length > 0;
    }

    const result = await query(
      'INSERT INTO tutoring_rooms (room_code, teacher_id, room_name) VALUES ($1, $2, $3) RETURNING *',
      [room_code, userId, room_name]
    );
    return res.status(201).json({ success: true, room: result.rows[0] });
  }

  // 과외방 참여
  if (req.method === 'POST' && action === 'join-room') {
    const { room_code } = req.body;
    const userId = req.user.userId;
    if (!room_code) return res.status(400).json({ error: '코드를 입력해주세요.' });

    const roomResult = await query('SELECT * FROM tutoring_rooms WHERE room_code = $1', [room_code.toUpperCase()]);
    if (roomResult.rows.length === 0) return res.status(404).json({ error: '존재하지 않는 코드입니다.' });

    const room = roomResult.rows[0];
    if (room.teacher_id === userId) return res.status(400).json({ error: '본인이 만든 방입니다.' });

    const memberCheck = await query(
      'SELECT id FROM tutoring_members WHERE room_id = $1 AND student_id = $2',
      [room.id, userId]
    );
    if (memberCheck.rows.length > 0) return res.status(400).json({ error: '이미 참여 중인 방입니다.' });

    await query('INSERT INTO tutoring_members (room_id, student_id) VALUES ($1, $2)', [room.id, userId]);
    return res.json({ success: true, room });
  }

  // 내 과외방 목록
  if (req.method === 'GET' && action === 'my-rooms') {
    const userId = req.user.userId;

    const teacherRooms = await query(`
      SELECT r.*, 'teacher' as my_role, COUNT(m.id) as member_count
      FROM tutoring_rooms r
      LEFT JOIN tutoring_members m ON m.room_id = r.id
      WHERE r.teacher_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `, [userId]);

    const studentRooms = await query(`
      SELECT r.*, 'student' as my_role, u.nickname as teacher_nickname
      FROM tutoring_rooms r
      JOIN tutoring_members m ON m.room_id = r.id
      JOIN users u ON u.user_id = r.teacher_id
      WHERE m.student_id = $1
      ORDER BY m.joined_at DESC
    `, [userId]);

    return res.json({ success: true, teacher_rooms: teacherRooms.rows, student_rooms: studentRooms.rows });
  }

  // 과외방 상세
  if (req.method === 'GET' && action === 'room-detail') {
    const { room_id } = req.query;
    const result = await query(`
      SELECT r.*, u.nickname as teacher_nickname
      FROM tutoring_rooms r
      JOIN users u ON u.user_id = r.teacher_id
      WHERE r.id = $1
    `, [room_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return res.json({ success: true, room: result.rows[0] });
  }

  // ==================== SUBJECTS ====================

  // 과목 목록 조회
  if (req.method === 'GET' && action === 'subjects') {
    const { room_id } = req.query;
    const subjects = await query(
      'SELECT * FROM tutoring_subjects WHERE room_id = $1 ORDER BY display_order',
      [room_id]
    );
    const parts = await query(
      'SELECT * FROM tutoring_parts WHERE subject_id IN (SELECT id FROM tutoring_subjects WHERE room_id = $1) ORDER BY display_order',
      [room_id]
    );
    return res.json({ success: true, subjects: subjects.rows, parts: parts.rows });
  }

  // 과목 추가
  if (req.method === 'POST' && action === 'add-subject') {
    const { room_id, subject_name } = req.body;
    const result = await query(
      'INSERT INTO tutoring_subjects (room_id, subject_name) VALUES ($1, $2) RETURNING *',
      [room_id, subject_name]
    );
    return res.status(201).json({ success: true, subject: result.rows[0] });
  }

  // 과목 삭제
  if (req.method === 'DELETE' && action === 'delete-subject') {
    const { subject_id } = req.query;
    await query('DELETE FROM tutoring_subjects WHERE id = $1', [subject_id]);
    return res.json({ success: true });
  }

  // 파트 추가
  if (req.method === 'POST' && action === 'add-part') {
    const { subject_id, part_name } = req.body;
    const result = await query(
      'INSERT INTO tutoring_parts (subject_id, part_name) VALUES ($1, $2) RETURNING *',
      [subject_id, part_name]
    );
    return res.status(201).json({ success: true, part: result.rows[0] });
  }

  // 파트 삭제
  if (req.method === 'DELETE' && action === 'delete-part') {
    const { part_id } = req.query;
    await query('DELETE FROM tutoring_parts WHERE id = $1', [part_id]);
    return res.json({ success: true });
  }

  // ==================== LESSONS ====================

  // 수업 기록 추가
  if (req.method === 'POST' && action === 'add-lesson') {
    const { room_id, lesson_date, content, feedback, next_plan, duration_min } = req.body;
    const userId = req.user.userId;
    if (!room_id || !lesson_date) return res.status(400).json({ error: '필수 항목을 입력해주세요.' });

    const result = await query(`
      INSERT INTO lesson_records (room_id, lesson_date, content, feedback, next_plan, duration_min, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [room_id, lesson_date, content, feedback, next_plan, duration_min, userId]);
    return res.status(201).json({ success: true, lesson: result.rows[0] });
  }

  // 수업 기록 목록
  if (req.method === 'GET' && action === 'lessons') {
    const { room_id } = req.query;
    const result = await query(
      'SELECT * FROM lesson_records WHERE room_id = $1 ORDER BY lesson_date DESC',
      [room_id]
    );
    return res.json({ success: true, lessons: result.rows });
  }

  // 수업 기록 수정
  if (req.method === 'PUT' && action === 'update-lesson') {
    const { lesson_id, content, feedback, next_plan, duration_min } = req.body;
    const result = await query(`
      UPDATE lesson_records SET content=$1, feedback=$2, next_plan=$3, duration_min=$4
      WHERE id=$5 RETURNING *
    `, [content, feedback, next_plan, duration_min, lesson_id]);
    return res.json({ success: true, lesson: result.rows[0] });
  }

  // 수업 기록 삭제
  if (req.method === 'DELETE' && action === 'delete-lesson') {
    const { lesson_id } = req.query;
    await query('DELETE FROM lesson_records WHERE id = $1', [lesson_id]);
    return res.json({ success: true });
  }

  // ==================== EXAMS ====================

  // 시험 성적 추가
  if (req.method === 'POST' && action === 'add-exam') {
    const { room_id, subject_id, exam_name, exam_date, score, max_score } = req.body;
    if (!room_id || !exam_name || !exam_date) return res.status(400).json({ error: '필수 항목을 입력해주세요.' });

    const result = await query(`
      INSERT INTO exam_scores (room_id, subject_id, exam_name, exam_date, score, max_score)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [room_id, subject_id, exam_name, exam_date, score, max_score]);
    return res.status(201).json({ success: true, exam: result.rows[0] });
  }

  // 시험 성적 목록
  if (req.method === 'GET' && action === 'exams') {
    const { room_id } = req.query;
    const result = await query(`
      SELECT e.*, s.subject_name
      FROM exam_scores e
      LEFT JOIN tutoring_subjects s ON s.id = e.subject_id
      WHERE e.room_id = $1
      ORDER BY e.exam_date DESC
    `, [room_id]);
    return res.json({ success: true, exams: result.rows });
  }

  // 시험 삭제
  if (req.method === 'DELETE' && action === 'delete-exam') {
    const { exam_id } = req.query;
    await query('DELETE FROM exam_scores WHERE id = $1', [exam_id]);
    return res.json({ success: true });
  }

  // ==================== WRONG ANSWERS ====================

  // 오답 추가
  if (req.method === 'POST' && action === 'add-wrong') {
    const { room_id, exam_id, subject_id, part_id, problem_number, reason } = req.body;
    const result = await query(`
      INSERT INTO wrong_answers (room_id, exam_id, subject_id, part_id, problem_number, reason)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [room_id, exam_id, subject_id, part_id, problem_number, reason]);
    return res.status(201).json({ success: true, wrong: result.rows[0] });
  }

  // 오답 목록
  if (req.method === 'GET' && action === 'wrong-answers') {
    const { room_id, subject_id, part_id } = req.query;
    let q = `
      SELECT w.*, s.subject_name, p.part_name
      FROM wrong_answers w
      LEFT JOIN tutoring_subjects s ON s.id = w.subject_id
      LEFT JOIN tutoring_parts p ON p.id = w.part_id
      WHERE w.room_id = $1
    `;
    const params = [room_id];
    if (subject_id) { q += ` AND w.subject_id = $${params.length + 1}`; params.push(subject_id); }
    if (part_id) { q += ` AND w.part_id = $${params.length + 1}`; params.push(part_id); }
    q += ' ORDER BY w.created_at DESC';

    const result = await query(q, params);
    return res.json({ success: true, wrong_answers: result.rows });
  }

  // 오답 해결 처리
  if (req.method === 'PUT' && action === 'resolve-wrong') {
    const { wrong_id } = req.body;
    await query('UPDATE wrong_answers SET is_resolved = TRUE WHERE id = $1', [wrong_id]);
    return res.json({ success: true });
  }

  // 오답 삭제
  if (req.method === 'DELETE' && action === 'delete-wrong') {
    const { wrong_id } = req.query;
    await query('DELETE FROM wrong_answers WHERE id = $1', [wrong_id]);
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'action 파라미터가 필요합니다.' });
}

module.exports = authenticateToken(handler);
