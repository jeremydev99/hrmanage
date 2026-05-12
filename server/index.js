/**
 * ㈜사이냅소프트 인사평가 시스템
 * 로컬 테스트 서버 — Node.js + SQLite (설치 불필요)
 * 실행: node server/index.js
 */
const express  = require('express');
const path     = require('path');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const helmet   = require('helmet');
const Database = require('better-sqlite3');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET     = 'synap-hr-local-dev-secret-2025';
const ENC_SECRET     = 'synap-local-enc-secret-32bytes!!';
const DB_PATH        = path.join(__dirname, '..', 'data', 'hrmanage.db');

// ── DB 초기화 ──────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initDB();

function loadTimezone() {
  try {
    const tz = db.prepare("SELECT value FROM app_settings WHERE key='timezone'").get();
    process.env.TZ = tz?.value || 'Asia/Seoul';
    console.log(`✅ 시간대 설정: ${process.env.TZ}`);
  } catch(e) {
    process.env.TZ = 'Asia/Seoul';
  }
}
loadTimezone();

// ── 미들웨어 ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── 암호화 유틸 (AES-256-CBC, 로컬용 간소화) ─────────────
function encrypt(text) {
  if (!text) return '';
  const iv  = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENC_SECRET, 'salt', 32);
  const c   = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}
function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const [ivHex, encHex] = text.split(':');
    const key = crypto.scryptSync(ENC_SECRET, 'salt', 32);
    const d   = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
  } catch { return '[복호화 오류]'; }
}

// ── 감사 로그 헬퍼 ──────────────────────────────────────
let _auditStmt = null; // prepare 캐싱
function auditLog(userId, action, targetId, targetName, detail, ip) {
  try {
    if (!_auditStmt) {
      _auditStmt = db.prepare(
        "INSERT INTO audit_logs(user_id,action,target_id,target_name,detail,ip) VALUES(?,?,?,?,?,?)"
      );
    }
    _auditStmt.run(userId, action, targetId||null, targetName||null, detail||null, ip||null);
  } catch(e) {
    // 컬럼 추가 후 재시도
    try {
      try { db.prepare("ALTER TABLE audit_logs ADD COLUMN target_id INTEGER").run(); } catch(e2) {}
      try { db.prepare("ALTER TABLE audit_logs ADD COLUMN target_name TEXT").run(); } catch(e3) {}
      try { db.prepare("ALTER TABLE audit_logs ADD COLUMN detail TEXT").run(); } catch(e4) {}
      _auditStmt = db.prepare(
        "INSERT INTO audit_logs(user_id,action,target_id,target_name,detail,ip) VALUES(?,?,?,?,?,?)"
      );
      _auditStmt.run(userId, action, targetId||null, targetName||null, detail||null, ip||null);
    } catch(e5) {
      console.error('[auditLog]', e5.message);
    }
  }
}

// ── JWT 미들웨어 ───────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: '토큰이 만료되었습니다.' }); }
}
function adminOnly(req, res, next) {
  if (!['master','admin'].includes(req.user?.role))
    return res.status(403).json({ error: '관리자만 접근 가능합니다.' });
  next();
}
function masterOnly(req, res, next) {
  if (req.user?.role !== 'master')
    return res.status(403).json({ error: '마스터관리자만 접근 가능합니다.' });
  next();
}

// 공지사항 조회 (인증 불필요 — 로그인 화면에서도 사용)
app.get('/api/notice', (req, res) => {
  try {
    const notice = db.prepare(
      "SELECT value, updated_by, updated_at FROM app_settings WHERE key='notice'"
    ).get();
    if (!notice) return res.json({ content: '', author_name: '', author_title: '', updated_at: '' });
    const author = notice.updated_by
      ? db.prepare('SELECT name, title FROM users WHERE id=?').get(notice.updated_by)
      : null;
    res.json({
      content: notice.value || '',
      author_name: author?.name || '',
      author_title: author?.title || '',
      updated_at: notice.updated_at || '',
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 공지사항 수정 (admin+)
app.post('/api/notice', auth, adminOnly, (req, res) => {
  try {
    const { content } = req.body;
    db.prepare(`
      INSERT INTO app_settings(key, value, updated_by, updated_at)
      VALUES('notice', ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
    `).run(content || '', req.user.sub);
    auditLog(req.user.sub, 'NOTICE_UPDATED', null, null,
      `공지사항 수정 (${(content||'').length}자)`, req.ip);
    const author = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.sub);
    res.json({ success: true, author_name: author?.name });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 세션 정책 조회
app.get('/api/settings/session-policy', auth, (req, res) => {
  try {
    const policy = db.prepare("SELECT value FROM app_settings WHERE key='session_policy'").get();
    res.json(JSON.parse(policy?.value || '{"close_on_browser_close":false,"timeout_minutes":480}'));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 세션 정책 설정 (master만)
app.post('/api/settings/session-policy', auth, masterOnly, (req, res) => {
  try {
    const { close_on_browser_close, timeout_minutes } = req.body;
    const safeTimeout = Math.min(parseInt(timeout_minutes) || 480, 480);
    if (safeTimeout < 1)
      return res.status(400).json({ error: '최소 1분 이상이어야 합니다.' });
    const policy = { close_on_browser_close: !!close_on_browser_close, timeout_minutes: safeTimeout };
    db.prepare(`
      INSERT INTO app_settings(key,value,updated_by,updated_at)
      VALUES('session_policy',?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at
    `).run(JSON.stringify(policy), req.user.sub);
    auditLog(req.user.sub, 'SESSION_POLICY_CHANGED', null, null,
      `세션 정책 변경: 브라우저종료=${policy.close_on_browser_close}, 만료=${safeTimeout}분`, req.ip);
    res.json({ success: true, policy });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
//  AUTH API
// ════════════════════════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  if (user.account_status === 'pending')
    return res.status(403).json({ error: '가입 승인 대기 중입니다. 관리자의 승인을 기다려주세요.' });
  if (user.account_status === 'rejected')
    return res.status(403).json({ error: '가입이 거절되었습니다. 관리자에게 문의하세요.' });
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET, { expiresIn: '8h' }
  );
  auditLog(user.id, 'LOGIN', user.id, user.name, `로그인 (${user.role})`, req.ip);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email,
    role: user.role, dept: user.dept, title: user.title, manager_id: user.manager_id } });
});

// 신규 가입 신청 (인증 불필요 — 누구나 신청 가능)
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, dept, title, signup_note } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  const exists = db.prepare('SELECT 1 FROM users WHERE email=?').get(email);
  if (exists) return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(
    'INSERT INTO users(name,email,password_hash,role,dept,title,account_status,signup_note,is_active) VALUES(?,?,?,?,?,?,?,?,?)'
  ).run(name, email, hash, 'user', dept||'', title||'', 'pending', signup_note||'', 0);
  res.json({ success: true, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.' });
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = db.prepare('SELECT id,name,email,role,dept,title,manager_id FROM users WHERE id=?').get(req.user.sub);
  res.json(u || {});
});

// ════════════════════════════════════════════════════════════
//  USERS & ORG
// ════════════════════════════════════════════════════════════
app.get('/api/users', auth, (req, res) => {
  const users = db.prepare('SELECT id,name,email,role,dept,grade,title,manager_id,is_active,account_status,org_id FROM users').all();
  res.json(users);
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { name, email, password, role, dept, title, manager_id } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: '필수 항목 누락' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(
    'INSERT INTO users(name,email,password_hash,role,dept,title,manager_id) VALUES(?,?,?,?,?,?,?)'
  ).run(name, email, hash, role||'user', dept||'', title||'', manager_id||null);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/users/:id', auth, adminOnly, (req, res) => {
  const { role, dept, title, manager_id, is_active } = req.body;
  db.prepare('UPDATE users SET role=COALESCE(?,role), dept=COALESCE(?,dept), title=COALESCE(?,title), manager_id=?, is_active=COALESCE(?,is_active) WHERE id=?')
    .run(role, dept, title, manager_id !== undefined ? manager_id : db.prepare('SELECT manager_id FROM users WHERE id=?').get(req.params.id)?.manager_id, is_active, req.params.id);
  res.json({ success: true });
});

// 가입 신청 목록 조회 (admin+)
app.get('/api/users/signup-requests', auth, adminOnly, (req, res) => {
  const rows = db.prepare(
    "SELECT id,name,email,dept,title,signup_note,account_status,created_at FROM users WHERE account_status IN ('pending','rejected') ORDER BY created_at DESC"
  ).all();
  res.json(rows);
});

// 가입 승인 (admin+)
app.post('/api/users/:id/approve', auth, adminOnly, (req, res) => {
  const { role, dept, title, manager_id } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자 없음' });
  db.prepare("UPDATE users SET account_status='approved', is_active=1, role=?, dept=COALESCE(?,dept), title=COALESCE(?,title), manager_id=? WHERE id=?")
    .run(role||'user', dept, title, manager_id||null, req.params.id);
  db.prepare("INSERT INTO audit_logs(user_id,action,ip) VALUES(?,?,?)").run(req.user.sub, 'ACCOUNT_APPROVED:'+req.params.id, req.ip);
  res.json({ success: true });
});

// 가입 거절 (admin+)
app.post('/api/users/:id/reject', auth, adminOnly, (req, res) => {
  db.prepare("UPDATE users SET account_status='rejected', is_active=0 WHERE id=?").run(req.params.id);
  db.prepare("INSERT INTO audit_logs(user_id,action,ip) VALUES(?,?,?)").run(req.user.sub, 'ACCOUNT_REJECTED:'+req.params.id, req.ip);
  res.json({ success: true });
});

// 계정 비활성화/활성화 토글 (admin+)
app.post('/api/users/:id/toggle-active', auth, adminOnly, (req, res) => {
  const user = db.prepare('SELECT is_active FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: '사용자 없음' });
  const newVal = user.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active=? WHERE id=?').run(newVal, req.params.id);
  db.prepare("INSERT INTO audit_logs(user_id,action,ip) VALUES(?,?,?)").run(req.user.sub, (newVal?'ACCOUNT_ENABLED':'ACCOUNT_DISABLED')+':'+req.params.id, req.ip);
  res.json({ success: true, is_active: newVal });
});

// 조직도: 특정 사용자의 승인 체계 반환
app.get('/api/users/:id/approvers', auth, (req, res) => {
  const approvers = [];
  let cur = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  let level = 0;
  while (cur?.manager_id && level < 5) {
    cur = db.prepare('SELECT id,name,dept,title,manager_id FROM users WHERE id=?').get(cur.manager_id);
    if (cur) approvers.push({ ...cur, level: ++level });
    else break;
  }
  res.json(approvers);
});

// ════════════════════════════════════════════════════════════
//  GOAL CATEGORIES
// ════════════════════════════════════════════════════════════
app.get('/api/categories', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM goal_categories WHERE is_active=1 ORDER BY sort_order').all());
});

app.post('/api/categories', auth, adminOnly, (req, res) => {
  const { name, description, weight, color, text_color, sort_order } = req.body;
  const r = db.prepare(
    'INSERT INTO goal_categories(name,description,weight,color,text_color,sort_order,created_by) VALUES(?,?,?,?,?,?,?)'
  ).run(name, description||'', weight||0, color||'#E6F1FB', text_color||'#0C447C', sort_order||0, req.user.sub);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/categories/:id', auth, adminOnly, (req, res) => {
  const { name, description, weight, color, text_color, sort_order, is_active } = req.body;
  db.prepare('UPDATE goal_categories SET name=?,description=?,weight=?,color=?,text_color=?,sort_order=?,is_active=? WHERE id=?')
    .run(name, description, weight, color, text_color, sort_order, is_active??1, req.params.id);
  res.json({ success: true });
});

app.delete('/api/categories/:id', auth, masterOnly, (req, res) => {
  db.prepare('UPDATE goal_categories SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
//  EVAL CYCLES & GOALS
// ════════════════════════════════════════════════════════════
app.get('/api/evals', auth, (req, res) => {
  const isAdmin = ['master','admin'].includes(req.user.role);
  const rows = isAdmin
    ? db.prepare('SELECT e.*,u.name as user_name,u.dept FROM eval_cycles e JOIN users u ON e.user_id=u.id ORDER BY e.created_at DESC').all()
    : db.prepare('SELECT e.*,u.name as user_name,u.dept FROM eval_cycles e JOIN users u ON e.user_id=u.id WHERE e.user_id=? OR e.user_id IN (SELECT id FROM users WHERE manager_id=?) ORDER BY e.created_at DESC').all(req.user.sub, req.user.sub);
  // 복호화: 관리자, 본인, 승인자(상위관리자) 모두 가능
  rows.forEach(r => {
    const isOwner    = String(r.user_id) === String(req.user.sub);
    const isApprover = !!db.prepare(
      `WITH RECURSIVE chain(id,manager_id) AS (
         SELECT id,manager_id FROM users WHERE id=?
         UNION ALL SELECT u.id,u.manager_id FROM users u JOIN chain c ON u.id=c.manager_id
       ) SELECT 1 FROM chain WHERE id=? LIMIT 1`
    ).get(r.user_id, req.user.sub);

    if (isAdmin || isOwner || isApprover) {
      r.self_reason   = r.self_reason   ? decrypt(r.self_reason)   : '';
      r.reject_reason = r.reject_reason ? decrypt(r.reject_reason) : '';
    } else {
      r.self_reason   = null;
      r.reject_reason = null;
    }
  });
  res.json(rows);
});

app.post('/api/evals', auth, (req, res) => {
  try {
    const { period_type, period_label, eval_year } = req.body;
    // 방어: 값 누락 시 기본값 적용
    const safePeriodType  = period_type  || 'q';
    const safePeriodLabel = period_label || (eval_year || '2025년') + ' 1분기';
    const safeYear        = eval_year    || '2025년';
    // 이미 draft 상태인 eval이 있으면 그것을 반환 (중복 생성 방지)
    const existing = db.prepare(
      "SELECT id FROM eval_cycles WHERE user_id=? AND phase='draft' ORDER BY created_at DESC LIMIT 1"
    ).get(req.user.sub);
    if (existing) return res.json({ id: existing.id });
    const r = db.prepare(
      'INSERT INTO eval_cycles(user_id,period_type,period_label,eval_year) VALUES(?,?,?,?)'
    ).run(req.user.sub, safePeriodType, safePeriodLabel, safeYear);
    res.json({ id: r.lastInsertRowid });
  } catch(err) {
    console.error('[POST /api/evals]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/evals/:id/goals', auth, (req, res) => {
  const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: '없음' });
  const isAdmin = ['master','admin'].includes(req.user.role);
  const isOwner = String(ev.user_id) === String(req.user.sub);
  const isApprover = !!db.prepare(
    `WITH RECURSIVE chain(id,manager_id) AS (
       SELECT id,manager_id FROM users WHERE id=?
       UNION ALL SELECT u.id,u.manager_id FROM users u JOIN chain c ON u.id=c.manager_id
     ) SELECT 1 FROM chain WHERE id=? LIMIT 1`
  ).get(ev.user_id, req.user.sub);
  const canSee = isAdmin || isOwner || isApprover;
  if (!canSee) return res.status(403).json({ error: '권한 없음' });
  const goals = db.prepare('SELECT g.*,c.name as cat_name,c.color,c.text_color FROM goals g JOIN goal_categories c ON g.category_id=c.id WHERE g.eval_id=? ORDER BY c.sort_order,g.sort_order').all(req.params.id);
  const canDecrypt = isAdmin || isOwner || isApprover;
  goals.forEach(g => {
    g.name = canDecrypt ? decrypt(g.name) : '***';
    g.kpi  = canDecrypt ? decrypt(g.kpi)  : '***';
  });
  res.json(goals);
});

app.post('/api/evals/:id/goals', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(409).json({ error: '승인된 평가는 수정할 수 없습니다.' });
    const { goals, self_reason } = req.body;
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM goals WHERE eval_id=?').run(req.params.id);
      (goals || []).forEach((g, i) => {
        db.prepare('INSERT INTO goals(eval_id,category_id,name,kpi,weight,sort_order) VALUES(?,?,?,?,?,?)')
          .run(req.params.id, g.category_id, encrypt(g.name || ''), encrypt(g.kpi || ''), Number(g.weight) || 0, i);
      });
      if (self_reason !== undefined) {
        db.prepare("UPDATE eval_cycles SET self_reason=?,updated_at=datetime('now') WHERE id=?")
          .run(encrypt(self_reason), req.params.id);
      }
    });
    tx();
    res.json({ success: true });
  } catch(err) {
    console.error('[POST goals]', err);
    res.status(500).json({ error: err.message });
  }
});

// 반려된 평가를 draft로 되돌려 재제출 가능하게 함
app.patch('/api/evals/:id/reopen', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (ev.phase !== 'rejected')
      return res.json({ success: true }); // 이미 draft면 그냥 통과
    db.prepare("UPDATE eval_cycles SET phase='draft',reject_reason=NULL,updated_at=datetime('now') WHERE id=?").run(ev.id);
    db.prepare("UPDATE goals SET status='draft' WHERE eval_id=?").run(ev.id);
    res.json({ success: true });
  } catch(err) {
    console.error('[reopen]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/evals/:id/submit', auth, (req, res) => {
  const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.id);
  if (!ev || String(ev.user_id) !== String(req.user.sub)) return res.status(403).json({ error: '권한 없음' });
  if (!['draft'].includes(ev.phase)) return res.status(409).json({ error: '제출 불가 상태: ' + ev.phase });
  const { self_reason } = req.body;
  db.prepare("UPDATE eval_cycles SET phase='pending',self_reason=?,submitted_at=datetime('now'),updated_at=datetime('now') WHERE id=?")
    .run(encrypt(self_reason||''), req.params.id);
  db.prepare("UPDATE goals SET status='pending' WHERE eval_id=?").run(req.params.id);
  const targetUser = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.sub);
  auditLog(req.user.sub, 'GOAL_SUBMITTED', ev.id, targetUser?.name, `목표 승인 요청 제출 (${ev.period_label||''})`, req.ip);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
//  APPROVALS (목표 승인)
// 내 목표 승인 이력 전체 (반려 포함)
app.get('/api/evals/my-history', auth, (req, res) => {
  try {
    const evs = db.prepare(
      "SELECT * FROM eval_cycles WHERE user_id=? ORDER BY created_at DESC"
    ).all(req.user.sub);

    const result = evs.map(ev => {
      const goals = db.prepare(
        `SELECT g.*, c.name as cat_name FROM goals g
         JOIN goal_categories c ON g.category_id=c.id
         WHERE g.eval_id=? ORDER BY c.sort_order, g.sort_order`
      ).all(ev.id).map(g => ({
        ...g,
        name: g.name ? decrypt(g.name) : '',
        kpi:  g.kpi  ? decrypt(g.kpi)  : '',
      }));

      const approvals = db.prepare(
        `SELECT a.*, u.name as approver_name, u.title as approver_title
         FROM goal_approvals a JOIN users u ON a.approver_id=u.id
         WHERE a.eval_id=? ORDER BY a.created_at DESC`
      ).all(ev.id).map(a => ({
        ...a,
        note: a.note ? decrypt(a.note) : '',
      }));

      return {
        ...ev,
        self_reason:   ev.self_reason   ? decrypt(ev.self_reason)   : '',
        reject_reason: ev.reject_reason ? decrypt(ev.reject_reason) : '',
        goals,
        approvals,
      };
    });
    res.json(result);
  } catch(err) {
    console.error('[evals/my-history]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// 내가 승인한 이력 목록 (기간 필터 지원)
app.get('/api/approvals/my-history', auth, (req, res) => {
  try {
    const { period_label, eval_year } = req.query;
    let sql = `SELECT a.*, e.user_id, e.period_label, e.eval_year, e.phase,
               u.name as target_name, u.dept as target_dept, u.title as target_title,
               u.grade as target_grade
               FROM goal_approvals a
               JOIN eval_cycles e ON a.eval_id = e.id
               JOIN users u ON e.user_id = u.id
               WHERE a.approver_id = ?`;
    const params = [req.user.sub];
    if (period_label) { sql += ' AND e.period_label=?'; params.push(period_label); }
    if (eval_year)    { sql += ' AND e.eval_year=?';    params.push(eval_year); }
    sql += ' ORDER BY a.created_at DESC';
    const rows = db.prepare(sql).all(...params).map(r => ({
      ...r,
      note: r.note ? decrypt(r.note) : '',
    }));

    // 각 row에 최종평가 + 목표 정보 추가
    const enriched = rows.map(r => {
      const fe = db.prepare('SELECT * FROM final_evaluations WHERE eval_id=?').get(r.eval_id);
      const goals = db.prepare(
        `SELECT g.id, g.weight, g.category_id,
                g.name as name_enc, g.kpi as kpi_enc,
                c.name as cat_name, c.color, c.text_color
         FROM goals g JOIN goal_categories c ON g.category_id=c.id
         WHERE g.eval_id=? ORDER BY c.sort_order, g.sort_order`
      ).all(r.eval_id).map(g => ({
        ...g,
        name: g.name_enc ? decrypt(g.name_enc) : '',
        kpi:  g.kpi_enc  ? decrypt(g.kpi_enc)  : '',
      }));
      let finalData = null;
      if (fe) {
        const scores = db.prepare('SELECT * FROM final_eval_scores WHERE final_id=?').all(fe.id);
        const secondMgrUser = fe.second_mgr_id
          ? db.prepare('SELECT name, title FROM users WHERE id=?').get(fe.second_mgr_id)
          : null;
        const mgrUser = fe.mgr_approver_id
          ? db.prepare('SELECT name, title FROM users WHERE id=?').get(fe.mgr_approver_id)
          : null;
        finalData = {
          self_done:         fe.self_done,
          mgr_done:          fe.mgr_done,
          mgr_approver_name: mgrUser?.name || '',
          second_mgr_done:   fe.second_mgr_done,
          second_mgr_name:   secondMgrUser?.name || '',
          second_mgr_note:   fe.second_mgr_note && fe.second_mgr_done ? decrypt(fe.second_mgr_note) : null,
          final_score:       fe.final_score,
          final_grade:       fe.final_grade,
          selected_grade:    fe.selected_grade,
          mgr_note:          fe.mgr_note && fe.mgr_done ? decrypt(fe.mgr_note) : null,
          scores,
        };
      }
      return { ...r, goals, final_eval: finalData };
    });
    res.json(enriched);
  } catch(err) {
    console.error('[my-history]', err);
    res.status(500).json({ error: err.message });
  }
});

// 승인 의견 수정
app.patch('/api/approvals/:approvalId', auth, (req, res) => {
  try {
    const setting = db.prepare("SELECT value FROM app_settings WHERE key='approval_edit'").get();
    if (!setting || setting.value !== '1')
      return res.status(403).json({ error: '승인 수정이 허용되지 않은 상태입니다.' });
    const appr = db.prepare('SELECT * FROM goal_approvals WHERE id=?').get(req.params.approvalId);
    if (!appr) return res.status(404).json({ error: '없음' });
    if (String(appr.approver_id) !== String(req.user.sub) && !['master','admin'].includes(req.user.role))
      return res.status(403).json({ error: '본인 승인만 수정 가능합니다.' });
    const { note } = req.body;
    db.prepare('UPDATE goal_approvals SET note=? WHERE id=?').run(encrypt(note||''), req.params.approvalId);
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(appr.eval_id);
    auditLog(req.user.sub, 'APPROVAL_EDITED', ev?.user_id, null,
      `${appr.level}차 승인 의견 수정 (${ev?.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 승인 취소
app.delete('/api/approvals/:approvalId', auth, (req, res) => {
  try {
    const setting = db.prepare("SELECT value FROM app_settings WHERE key='approval_edit'").get();
    if (!setting || setting.value !== '1')
      return res.status(403).json({ error: '승인 취소가 허용되지 않은 상태입니다.' });
    const appr = db.prepare('SELECT * FROM goal_approvals WHERE id=?').get(req.params.approvalId);
    if (!appr) return res.status(404).json({ error: '없음' });
    if (String(appr.approver_id) !== String(req.user.sub) && !['master','admin'].includes(req.user.role))
      return res.status(403).json({ error: '본인 승인만 취소 가능합니다.' });
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(appr.eval_id);
    db.prepare('DELETE FROM goal_approvals WHERE id=?').run(req.params.approvalId);
    db.prepare("UPDATE eval_cycles SET phase='pending',approved_at=NULL,updated_at=datetime('now') WHERE id=?")
      .run(appr.eval_id);
    db.prepare("UPDATE goals SET status='pending' WHERE eval_id=?").run(appr.eval_id);
    const targetUser = db.prepare('SELECT name FROM users WHERE id=?').get(ev?.user_id);
    auditLog(req.user.sub, 'APPROVAL_CANCELLED', ev?.user_id, targetUser?.name,
      `${appr.level}차 승인 취소 (${ev?.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/approvals/pending', auth, (req, res) => {
  // 내가 다음 승인자인 평가 목록
  const pending = db.prepare(`
    SELECT e.*,u.name as user_name,u.dept,u.title,u.manager_id
    FROM eval_cycles e JOIN users u ON e.user_id=u.id
    WHERE e.phase='pending'
  `).all().filter(ev => isNextApprover(req.user.sub, ev.user_id, ev.id));

  // 승인자는 직원 의견 복호화해서 볼 수 있음
  pending.forEach(ev => {
    ev.self_reason   = ev.self_reason   ? decrypt(ev.self_reason)   : '';
    ev.reject_reason = ev.reject_reason ? decrypt(ev.reject_reason) : '';
  });
  res.json(pending);
});

function isNextApprover(approverId, targetUserId, evalId) {
  // 조직도 상 approverId가 targetUserId의 몇 번째 상위자인지 파악
  // chain에 String으로 통일해서 비교 (DB integer vs JWT string 타입 불일치 방지)
  const chain = [];
  let cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(targetUserId));
  while (cur?.manager_id && chain.length < 5) {
    chain.push(String(cur.manager_id));  // 반드시 String으로 저장
    cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(cur.manager_id));
  }
  const myLevel = chain.indexOf(String(approverId)) + 1;
  if (!myLevel) return false;
  // 이미 이 레벨 승인했는지 확인
  const done = db.prepare('SELECT 1 FROM goal_approvals WHERE eval_id=? AND level=?').get(evalId, myLevel);
  return !done;
}

app.post('/api/approvals/:evalId/approve', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev || ev.phase !== 'pending') return res.status(400).json({ error: '승인 불가 상태' });
    if (!isNextApprover(req.user.sub, ev.user_id, ev.id)) return res.status(403).json({ error: '승인 권한 없음' });

    const { note } = req.body;
    const chain    = getApproverChain(ev.user_id);
    const myLevel  = chain.indexOf(String(req.user.sub)) + 1;
    if (!myLevel) return res.status(403).json({ error: '승인 권한 없음' });

    db.prepare('INSERT INTO goal_approvals(eval_id,approver_id,level,action,note) VALUES(?,?,?,?,?)')
      .run(ev.id, req.user.sub, myLevel, 'approved', encrypt(note||''));

    // 작은따옴표로 통일 (큰따옴표는 SQLite에서 컬럼명으로 인식됨)
    const doneCount = db.prepare("SELECT COUNT(*) as c FROM goal_approvals WHERE eval_id=? AND action='approved'").get(ev.id).c;
    const finalApproved = doneCount >= chain.length;

    if (finalApproved) {
      db.prepare("UPDATE eval_cycles SET phase='approved',approved_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(ev.id);
      db.prepare("UPDATE goals SET status='approved' WHERE eval_id=?").run(ev.id);
    }
    const targetUser2 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
    const approverUser = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.sub);
    const actionLabel  = finalApproved ? 'GOAL_FINAL_APPROVED' : 'GOAL_APPROVED';
    const detail       = finalApproved
      ? `${myLevel}차 최종 승인 완료 — 목표 확정 (${ev.period_label||''})`
      : `${myLevel}차 승인 완료 (${ev.period_label||''})`;
    auditLog(req.user.sub, actionLabel, ev.user_id, targetUser2?.name, detail, req.ip);
    res.json({ success: true, finalApproved });
  } catch(err) {
    console.error('[approve]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/approvals/:evalId/reject', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev || ev.phase !== 'pending') return res.status(400).json({ error: '반려 불가 상태' });
    if (!isNextApprover(req.user.sub, ev.user_id, ev.id)) return res.status(403).json({ error: '권한 없음' });
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: '반려 사유 필수' });
    const chain   = getApproverChain(ev.user_id);
    const myLevel = chain.indexOf(String(req.user.sub)) + 1;

    db.prepare('INSERT INTO goal_approvals(eval_id,approver_id,level,action,note) VALUES(?,?,?,?,?)')
      .run(ev.id, req.user.sub, myLevel, 'rejected', encrypt(note));

    // phase = 'rejected' (draft 아님 — 피평가자가 반려 사유 확인 후 수정 가능)
    // reject_reason 컬럼에 사유 저장 (마이그레이션으로 자동 추가)
    db.prepare("UPDATE eval_cycles SET phase='rejected',reject_reason=?,updated_at=datetime('now') WHERE id=?")
      .run(encrypt(note), ev.id);
    // 기존 승인 이력 초기화 (재제출 시 처음부터 다시 승인)
    db.prepare("DELETE FROM goal_approvals WHERE eval_id=?").run(ev.id);
    db.prepare("UPDATE goals SET status='draft' WHERE eval_id=?").run(ev.id);
    const targetUser3 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
    auditLog(req.user.sub, 'GOAL_REJECTED', ev.user_id, targetUser3?.name,
      `목표 반려 (${ev.period_label||''}) — 사유: ${note}`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[reject]', err);
    res.status(500).json({ error: err.message });
  }
});

function getApproverChain(userId) {
  const chain = [];
  let cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(userId));
  while (cur?.manager_id && chain.length < 5) {
    chain.push(String(cur.manager_id));
    cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(cur.manager_id));
  }
  return chain;
}

app.get('/api/approvals/:evalId/history', auth, (req, res) => {
  const rows = db.prepare('SELECT a.*,u.name as approver_name,u.title FROM goal_approvals a JOIN users u ON a.approver_id=u.id WHERE a.eval_id=? ORDER BY a.level').all(req.params.evalId);
  const isAdmin = ['master','admin'].includes(req.user.role);
  rows.forEach(r => { r.note = isAdmin ? decrypt(r.note) : null; });
  res.json(rows);
});

// ════════════════════════════════════════════════════════════
//  FEEDBACK (중간 피드백)
// ════════════════════════════════════════════════════════════
app.get('/api/feedback/:evalId', auth, (req, res) => {
  const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
  if (!ev) return res.status(404).json({ error: '없음' });
  const isAdmin = ['master','admin'].includes(req.user.role);
  const isOwner = String(ev.user_id) === String(req.user.sub);
  const fbs = db.prepare('SELECT f.*,u.name as author_name FROM feedbacks f JOIN users u ON f.author_id=u.id WHERE f.eval_id=? ORDER BY f.created_at DESC').all(req.params.evalId);
  fbs.forEach(fb => {
    fb.overall_note = (isAdmin || isOwner || fb.author_id === req.user.sub) ? decrypt(fb.overall_note) : null;
    fb.items = db.prepare('SELECT fi.*,g.name as goal_enc FROM feedback_items fi JOIN goals g ON fi.goal_id=g.id WHERE fi.feedback_id=?').all(fb.id)
      .map(it => ({ ...it, note: isAdmin||isOwner ? decrypt(it.note) : null,
                           goal_name: isAdmin||isOwner ? decrypt(it.goal_enc) : '***' }));
  });
  res.json(fbs);
});

app.post('/api/feedback/:evalId', auth, (req, res) => {
  const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
  if (!ev || !['approved','final_self','final_mgr_pending'].includes(ev.phase))
    return res.status(400).json({ error: '승인된 평가에만 피드백 가능' });
  const { overall_note, items } = req.body; // items: [{goal_id, score, note}]
  const fb = db.prepare('INSERT INTO feedbacks(eval_id,author_id,overall_note) VALUES(?,?,?)')
    .run(req.params.evalId, req.user.sub, encrypt(overall_note||''));
  (items||[]).forEach(it => {
    db.prepare('INSERT INTO feedback_items(feedback_id,goal_id,score,note) VALUES(?,?,?,?)')
      .run(fb.lastInsertRowid, it.goal_id, it.score||null, encrypt(it.note||''));
  });
  const fbTargetUser = db.prepare('SELECT user_id FROM eval_cycles WHERE id=?').get(req.params.evalId);
  const fbTarget     = fbTargetUser ? db.prepare('SELECT name FROM users WHERE id=?').get(fbTargetUser.user_id) : null;
  auditLog(req.user.sub, 'FEEDBACK_SUBMITTED', fbTargetUser?.user_id, fbTarget?.name,
    `중간 피드백 제출 (평가ID: ${req.params.evalId})`, req.ip);
  res.json({ id: fb.lastInsertRowid });
});

// ════════════════════════════════════════════════════════════
//  FINAL EVALUATION (최종 평가)
// ════════════════════════════════════════════════════════════
app.get('/api/final/:evalId', auth, (req, res) => {
  const fe = db.prepare('SELECT * FROM final_evaluations WHERE eval_id=?').get(req.params.evalId);
  if (!fe) return res.json(null);
  const isAdmin = ['master','admin'].includes(req.user.role);
  const ev2 = db.prepare('SELECT user_id FROM eval_cycles WHERE id=?').get(req.params.evalId);
  const isOwner = ev2 && String(ev2.user_id) === String(req.user.sub);
  // 승인자 체인 전체 열람 허용
  const finalChain = [];
  let finalCur = ev2 ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev2.user_id)) : null;
  while (finalCur?.manager_id && finalChain.length < 5) {
    finalChain.push(String(finalCur.manager_id));
    finalCur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(finalCur.manager_id));
  }
  const isChainApprover = finalChain.includes(String(req.user.sub));
  const canRead = isAdmin || isOwner || isChainApprover;
  if (canRead) {
    fe.self_note       = fe.self_note       ? decrypt(fe.self_note)       : '';
    fe.mgr_note        = fe.mgr_note        ? decrypt(fe.mgr_note)        : '';
    fe.second_mgr_note = fe.second_mgr_note ? decrypt(fe.second_mgr_note) : '';
  } else {
    fe.self_note = null; fe.mgr_note = null; fe.second_mgr_note = null;
  }
  fe.scores = db.prepare('SELECT * FROM final_eval_scores WHERE final_id=?').all(fe.id);
  res.json(fe);
});

app.post('/api/final/:evalId/self', auth, (req, res) => {
  const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
  if (!ev || String(ev.user_id) !== String(req.user.sub)) return res.status(403).json({ error: '권한 없음' });
  if (!['approved','final_self'].includes(ev.phase)) return res.status(400).json({ error: '자기평가 불가 상태' });

  // 이미 제출 완료된 경우 재제출 차단
  const existFe = db.prepare('SELECT self_done FROM final_evaluations WHERE eval_id=?').get(ev.id);
  if (existFe?.self_done === 1) return res.status(400).json({ error: '이미 제출된 자기평가는 수정할 수 없습니다.' });

  const { self_note, scores } = req.body;
  let fe = db.prepare('SELECT * FROM final_evaluations WHERE eval_id=?').get(ev.id);
  if (!fe) {
    // INSERT 시 self_done=1 함께 저장
    const r = db.prepare("INSERT INTO final_evaluations(eval_id,self_note,self_done,self_done_at) VALUES(?,?,1,datetime('now'))").run(ev.id, encrypt(self_note||''));
    fe = { id: r.lastInsertRowid };
  } else {
    db.prepare("UPDATE final_evaluations SET self_note=?,self_done=1,self_done_at=datetime('now') WHERE id=?").run(encrypt(self_note||''), fe.id);
  }
  db.prepare('DELETE FROM final_eval_scores WHERE final_id=? AND self_score IS NOT NULL').run(fe.id);
  (scores||[]).forEach(s => {
    const ex = db.prepare('SELECT id FROM final_eval_scores WHERE final_id=? AND goal_id=?').get(fe.id, s.goal_id);
    if (ex) db.prepare('UPDATE final_eval_scores SET self_score=? WHERE id=?').run(s.score, ex.id);
    else db.prepare('INSERT INTO final_eval_scores(final_id,goal_id,self_score) VALUES(?,?,?)').run(fe.id, s.goal_id, s.score);
  });
  db.prepare("UPDATE eval_cycles SET phase='final_mgr_pending',updated_at=datetime('now') WHERE id=?").run(ev.id);
  res.json({ success: true });
});

app.post('/api/final/:evalId/mgr', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev || !['final_mgr_pending','final_mgr2_pending'].includes(ev.phase))
      return res.status(400).json({ error: '상사 평가 불가 상태' });

    const targetUser = db.prepare('SELECT manager_id FROM users WHERE id=?').get(ev.user_id);
    const isAdmin    = ['master','admin'].includes(req.user.role);
    const isDirect   = String(targetUser?.manager_id) === String(req.user.sub);

    // 2차 평가 여부 판단 — 조직도 기반 (isAdmin 여부와 무관하게 먼저 확인)
    const secondEnabled = getSetting('second_final', '0') === '1';
    let isSecond = false;
    if (secondEnabled) {
      const directMgr = targetUser?.manager_id
        ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(targetUser.manager_id))
        : null;
      isSecond = String(directMgr?.manager_id) === String(req.user.sub);
    }

    // 권한 체크: 직속 상사도, 2차 평가자도, 관리자도 아니면 403
    if (!isDirect && !isSecond && !isAdmin) {
      return res.status(403).json({ error: '평가 권한 없음' });
    }

    console.log('[최종평가제출]', {
      evalId: req.params.evalId, userId: req.user.sub,
      isDirect, isSecond, isAdmin, phase: ev.phase
    });

    let fe = db.prepare('SELECT * FROM final_evaluations WHERE eval_id=?').get(ev.id);
    if (!fe) {
      const r = db.prepare('INSERT INTO final_evaluations(eval_id) VALUES(?)').run(ev.id);
      fe = { id: r.lastInsertRowid };
    }

    const { mgr_note, scores, selected_grade } = req.body;

    if (isSecond) {
      // ── 2차 평가자 제출 ──────────────────────────────────
      // 1차가 완료됐는지 확인
      if (!fe.mgr_done) return res.status(400).json({ error: '1차 평가자가 먼저 평가를 완료해야 합니다.' });

      // 2차 별점 저장
      (scores||[]).forEach(s => {
        const ex = db.prepare('SELECT id FROM final_eval_scores WHERE final_id=? AND goal_id=?').get(fe.id, s.goal_id);
        if (ex) {
          db.prepare('UPDATE final_eval_scores SET second_mgr_score=? WHERE id=?').run(s.score, ex.id);
        } else {
          db.prepare('INSERT INTO final_eval_scores(final_id,goal_id,second_mgr_score) VALUES(?,?,?)').run(fe.id, s.goal_id, s.score);
        }
      });

      db.prepare(`UPDATE final_evaluations
        SET second_mgr_note=?, second_mgr_done=1,
            second_mgr_done_at=datetime('now'), second_mgr_id=?,
            selected_grade=COALESCE(?,selected_grade), second_selected_grade=?
        WHERE id=?`)
        .run(encrypt(mgr_note||''), req.user.sub, selected_grade||null, selected_grade||'', fe.id);
      db.prepare("UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?").run(ev.id);
      db.prepare("UPDATE final_evaluations SET locked=1, locked_at=datetime('now') WHERE id=?").run(fe.id);

      const t2 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
      auditLog(req.user.sub, 'FINAL_EVAL_2ND', ev.user_id, t2?.name,
        `2차 최종평가 완료 (${ev.period_label||''})`, req.ip);
      res.json({ success: true, is_second: true });

    } else {
      // ── 1차 평가자 제출 ──────────────────────────────────
      (scores||[]).forEach(s => {
        const ex = db.prepare('SELECT id FROM final_eval_scores WHERE final_id=? AND goal_id=?').get(fe.id, s.goal_id);
        if (ex) db.prepare('UPDATE final_eval_scores SET mgr_score=? WHERE id=?').run(s.score, ex.id);
        else db.prepare('INSERT INTO final_eval_scores(final_id,goal_id,mgr_score) VALUES(?,?,?)').run(fe.id, s.goal_id, s.score);
      });

      // 최종 점수 계산
      const goals = db.prepare('SELECT g.weight,fes.mgr_score FROM goals g JOIN final_eval_scores fes ON fes.goal_id=g.id WHERE g.eval_id=? AND fes.mgr_score IS NOT NULL').all(ev.id);
      const totalW     = goals.reduce((a, g) => a + g.weight, 0) || 1;
      const score      = goals.reduce((a, g) => a + (g.mgr_score / 5 * 100) * (g.weight / totalW), 0);
      const finalScore = Math.round(score * 10) / 10;
      const grade      = finalScore >= 90 ? 'S' : finalScore >= 80 ? 'A' : finalScore >= 70 ? 'B' : finalScore >= 60 ? 'C' : 'D';

      const finalGradeCode = selected_grade || grade;
      db.prepare("UPDATE final_evaluations SET mgr_note=?,mgr_done=1,mgr_done_at=datetime('now'),mgr_approver_id=?,final_score=?,final_grade=?,selected_grade=? WHERE id=?")
        .run(encrypt(mgr_note||''), req.user.sub, finalScore, finalGradeCode, selected_grade||grade, fe.id);

      // 2차 평가 설정 여부에 따라 phase 결정
      if (secondEnabled) {
        // 2차 평가자가 존재하는지 확인 (직속 상사의 상사)
        const directMgrUser = targetUser?.manager_id
          ? db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(targetUser.manager_id))
          : null;
        if (directMgrUser?.manager_id) {
          // 2차 평가자 있음 → final_mgr2_pending
          db.prepare("UPDATE eval_cycles SET phase='final_mgr2_pending',updated_at=datetime('now') WHERE id=?").run(ev.id);
        } else {
          // 2차 평가자 없음 → 바로 final_done
          db.prepare("UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?").run(ev.id);
          db.prepare("UPDATE final_evaluations SET locked=1,locked_at=datetime('now') WHERE id=?").run(fe.id);
        }
      } else {
        // 2차 평가 꺼짐 → 바로 final_done
        db.prepare("UPDATE eval_cycles SET phase='final_done',locked=1,updated_at=datetime('now') WHERE id=?").run(ev.id);
        db.prepare("UPDATE final_evaluations SET locked=1,locked_at=datetime('now') WHERE id=?").run(fe.id);
      }

      const t1 = db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id);
      auditLog(req.user.sub, 'FINAL_EVAL_LOCKED', ev.user_id, t1?.name,
        `1차 최종평가 완료 — 점수: ${finalScore}점 / 등급: ${grade} (${ev.period_label||''})`, req.ip);
      res.json({ success: true, final_score: finalScore, grade });
    }
  } catch(err) {
    console.error('[final mgr]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════
// ── 평가 기간 관리 API ───────────────────────────────────

// 전체 평가 기간 목록
app.get('/api/eval-periods', auth, (req, res) => {
  try {
    // eval_periods 테이블 없으면 빈 배열 반환
    const periods = db.prepare(
      "SELECT * FROM eval_periods ORDER BY eval_year DESC, period_label"
    ).all();
    res.json(periods);
  } catch(err) {
    res.json([]); // 테이블 없으면 빈 배열
  }
});

// 활성화된 평가 기간만 (직원용)
app.get('/api/eval-periods/active', auth, (req, res) => {
  try {
    const periods = db.prepare(
      "SELECT * FROM eval_periods WHERE is_active=1 ORDER BY eval_year DESC, period_label"
    ).all();
    res.json(periods);
  } catch(err) {
    res.json([]); // 테이블 없으면 빈 배열
  }
});

// 평가 기간 추가 (admin+)
app.post('/api/eval-periods', auth, adminOnly, (req, res) => {
  try {
    const { period_type, period_label, eval_year, is_active } = req.body;
    if (!period_type || !period_label || !eval_year)
      return res.status(400).json({ error: '필수 항목 누락' });
    const exists = db.prepare(
      'SELECT 1 FROM eval_periods WHERE period_label=? AND eval_year=?'
    ).get(period_label, eval_year);
    if (exists) return res.status(409).json({ error: '이미 존재하는 기간입니다.' });
    const r = db.prepare(
      'INSERT INTO eval_periods(period_type,period_label,eval_year,is_active,created_by) VALUES(?,?,?,?,?)'
    ).run(period_type, period_label, eval_year, is_active ?? 1, req.user.sub);
    res.json({ id: r.lastInsertRowid });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 평가 기간 활성/비활성 토글 (admin+)
app.patch('/api/eval-periods/:id/toggle', auth, adminOnly, (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ error: '없음' });
    const next = p.is_active ? 0 : 1;
    db.prepare('UPDATE eval_periods SET is_active=? WHERE id=?').run(next, req.params.id);
    res.json({ success: true, is_active: next });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 평가 기간 삭제 (master만)
app.delete('/api/eval-periods/:id', auth, masterOnly, (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ error: '없음' });
    const inUse = db.prepare(
      'SELECT 1 FROM eval_cycles WHERE period_label=? AND eval_year=?'
    ).get(p.period_label, p.eval_year);
    if (inUse) return res.status(409).json({ error: '이미 사용 중인 기간은 삭제할 수 없습니다.' });
    db.prepare('DELETE FROM eval_period_modes WHERE period_id=?').run(req.params.id);
    db.prepare('DELETE FROM eval_periods WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 평가기간 전사 기본방식 조회/설정
app.get('/api/eval-periods/:id/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const period = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    res.json({ eval_mode: period.eval_mode || 'MBO', locked: period.locked });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/eval-periods/:id/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const { eval_mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(eval_mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const period = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    if (period.locked && req.user.role !== 'master')
      return res.status(400).json({ error: '잠긴 평가 기간의 방식은 변경할 수 없습니다.' });
    db.prepare('UPDATE eval_periods SET eval_mode=? WHERE id=?').run(eval_mode, req.params.id);
    auditLog(req.user.sub, 'PERIOD_EVAL_MODE_CHANGED', req.params.id,
      period.period_label, `평가기간 방식 변경: ${eval_mode}`, req.ip);
    const warning = period.locked ? '⚠ 잠긴 기간을 강제 변경했습니다.' : null;
    res.json({ success: true, warning });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직별 기간별 평가방식 조회 (organizations 기반)
app.get('/api/eval-periods/:id/org-modes', auth, adminOnly, (req, res) => {
  try {
    const orgs = db.prepare(`
      SELECT o.id as org_id, o.name as org_name,
        o.leader_id, u.name as leader_name,
        COALESCE(epm.eval_mode, ep.eval_mode, 'MBO') as eval_mode,
        epm.locked as org_locked
      FROM organizations o
      LEFT JOIN users u ON o.leader_id = u.id
      LEFT JOIN eval_period_modes epm ON epm.manager_id=o.leader_id AND epm.period_id=?
      LEFT JOIN eval_periods ep ON ep.id=?
      WHERE o.is_active=1 AND o.leader_id IS NOT NULL
      ORDER BY o.sort_order, o.id
    `).all(req.params.id, req.params.id);
    res.json(orgs);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직별 기간별 평가방식 설정
app.post('/api/eval-periods/:id/org-modes', auth, adminOnly, (req, res) => {
  try {
    const { manager_id, eval_mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(eval_mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const period = db.prepare('SELECT * FROM eval_periods WHERE id=?').get(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    const existing = db.prepare(
      'SELECT locked FROM eval_period_modes WHERE period_id=? AND manager_id=?'
    ).get(req.params.id, manager_id);
    if (existing?.locked && req.user.role !== 'master')
      return res.status(400).json({ error: '잠긴 조직의 방식은 변경할 수 없습니다.' });
    db.prepare(`
      INSERT INTO eval_period_modes(period_id, manager_id, eval_mode)
      VALUES(?,?,?)
      ON CONFLICT(period_id, manager_id) DO UPDATE SET eval_mode=?
    `).run(req.params.id, manager_id, eval_mode, eval_mode);
    const mgr = db.prepare('SELECT name FROM users WHERE id=?').get(manager_id);
    auditLog(req.user.sub, 'ORG_EVAL_MODE_CHANGED', manager_id, mgr?.name,
      `조직 평가방식 변경 (${period.period_label}): ${eval_mode}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 평가기간 방식 잠금 (admin+)
app.post('/api/eval-periods/:id/lock', auth, adminOnly, (req, res) => {
  try {
    db.prepare('UPDATE eval_periods SET locked=1 WHERE id=?').run(req.params.id);
    db.prepare('UPDATE eval_period_modes SET locked=1 WHERE period_id=?').run(req.params.id);
    const period = db.prepare('SELECT period_label FROM eval_periods WHERE id=?').get(req.params.id);
    auditLog(req.user.sub, 'PERIOD_LOCKED', req.params.id,
      period?.period_label, '평가기간 방식 잠금', req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 중간 보고 API ────────────────────────────────────────

// 중간 보고 목록 조회
app.get('/api/reports/:evalId', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '없음' });
    const isAdmin   = ['master','admin'].includes(req.user.role);
    const isOwner   = String(ev.user_id) === String(req.user.sub);
    const chain = [];
    let cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev.user_id));
    while (cur?.manager_id && chain.length < 5) {
      chain.push(String(cur.manager_id));
      cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(cur.manager_id));
    }
    const isApprover = chain.includes(String(req.user.sub));
    if (!isAdmin && !isOwner && !isApprover)
      return res.status(403).json({ error: '권한 없음' });

    const reports = db.prepare(
      'SELECT r.*, u.name as author_name FROM progress_reports r JOIN users u ON r.author_id=u.id WHERE r.eval_id=? ORDER BY r.created_at DESC'
    ).all(req.params.evalId).map(r => ({
      ...r,
      content: r.content ? decrypt(r.content) : '',
      files: db.prepare('SELECT id,file_name,file_type,file_size,created_at FROM report_files WHERE report_id=?').all(r.id),
    }));
    res.json(reports);
  } catch(err) {
    console.error('[reports GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// 중간 보고 작성
app.post('/api/reports/:evalId', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '본인만 작성 가능' });
    if (!['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(400).json({ error: '목표 확정 후 작성 가능합니다.' });
    const { content, files } = req.body;
    const r = db.prepare(
      "INSERT INTO progress_reports(eval_id,author_id,content,created_at) VALUES(?,?,?,datetime('now'))"
    ).run(req.params.evalId, req.user.sub, encrypt(content || ''));
    // 파일 저장 (base64)
    (files || []).forEach(f => {
      db.prepare(
        'INSERT INTO report_files(report_id,file_name,file_data,file_type,file_size) VALUES(?,?,?,?,?)'
      ).run(r.lastInsertRowid, f.name, f.data, f.type, f.size);
    });
    auditLog(req.user.sub, 'REPORT_SUBMITTED', ev.user_id, null,
      `중간 보고 작성 (${ev.period_label||''})`, req.ip);
    res.json({ id: r.lastInsertRowid });
  } catch(err) {
    console.error('[reports POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// 파일 다운로드
app.get('/api/files/:fileId', auth, (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM report_files WHERE id=?').get(req.params.fileId);
    if (!f) return res.status(404).json({ error: '파일 없음' });
    res.json({ file_name: f.file_name, file_data: f.file_data, file_type: f.file_type });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 평가 단계 강제 변경 (admin+)
app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, (req, res) => {
  try {
    const { phase } = req.body;
    const validPhases = ['draft','pending','approved','rejected',
                         'final_self','final_mgr_pending','final_mgr2_pending','final_done'];
    if (!validPhases.includes(phase))
      return res.status(400).json({ error: '유효하지 않은 phase입니다.' });

    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });

    const locked = phase === 'final_done' ? 1 : 0;
    db.prepare("UPDATE eval_cycles SET phase=?, locked=?, updated_at=datetime('now') WHERE id=?")
      .run(phase, locked, req.params.evalId);

    if (phase === 'final_done') {
      db.prepare("UPDATE final_evaluations SET locked=1, locked_at=datetime('now') WHERE eval_id=?")
        .run(req.params.evalId);
    }

    const target = db.prepare('SELECT u.name FROM eval_cycles e JOIN users u ON e.user_id=u.id WHERE e.id=?').get(req.params.evalId);
    auditLog(req.user.sub, 'FORCE_PHASE_CHANGE', req.params.evalId, target?.name,
      `평가 단계 강제 변경: ${ev.phase} → ${phase}`, req.ip);

    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 평가 방식 API ─────────────────────────────────────────

// 내 평가 방식 조회 (조직장 설정 상속)
// 활성 기간별 내 평가방식 목록
// 내 소속 조직의 리더 체인 (org_id 기반)
function getMyOrgLeaderChain(userId) {
  try {
    const me = db.prepare('SELECT org_id FROM users WHERE id=?').get(userId);
    if (!me?.org_id) return [];
    const chain = [];
    let currentOrgId = me.org_id;
    for (let depth = 0; depth < 10; depth++) {
      const org = db.prepare('SELECT * FROM organizations WHERE id=?').get(currentOrgId);
      if (!org) break;
      if (org.leader_id) chain.push(org.leader_id);
      if (!org.parent_id) break;
      currentOrgId = org.parent_id;
    }
    return chain;
  } catch(e) { return []; }
}

app.get('/api/eval-periods/my-modes', auth, (req, res) => {
  try {
    const activePeriods = db.prepare(
      "SELECT * FROM eval_periods WHERE is_active=1 ORDER BY eval_year DESC, id DESC"
    ).all();
    const leaderChain = getMyOrgLeaderChain(req.user.sub);

    const result = activePeriods.map(period => {
      // org_id 기반 조직장 체인 탐색 (MBO가 아닌 명시적 설정만 반환)
      for (const leaderId of leaderChain) {
        const orgMode = db.prepare(
          'SELECT eval_mode FROM eval_period_modes WHERE period_id=? AND manager_id=?'
        ).get(period.id, leaderId);
        if (orgMode && orgMode.eval_mode !== 'MBO') return {
          period_id: period.id, period_label: period.period_label,
          eval_year: period.eval_year, mode: orgMode.eval_mode, source: 'org_period'
        };
      }
      // 기간 전사 기본값
      return {
        period_id: period.id, period_label: period.period_label,
        eval_year: period.eval_year, mode: period.eval_mode || 'MBO', source: 'period'
      };
    });

    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings/my-eval-mode', auth, (req, res) => {
  try {
    const activePeriods = db.prepare(
      "SELECT * FROM eval_periods WHERE is_active=1 ORDER BY id DESC"
    ).all();

    if (!activePeriods.length) {
      const global = db.prepare("SELECT value FROM app_settings WHERE key='eval_mode'").get();
      return res.json({ mode: global?.value || 'MBO', source: 'global' });
    }

    const leaderChain = getMyOrgLeaderChain(req.user.sub);

    for (const period of activePeriods) {
      // org_id 기반 조직장 체인 탐색
      for (const leaderId of leaderChain) {
        const orgMode = db.prepare(
          'SELECT eval_mode FROM eval_period_modes WHERE period_id=? AND manager_id=?'
        ).get(period.id, leaderId);
        if (orgMode && orgMode.eval_mode !== 'MBO')
          return res.json({ mode: orgMode.eval_mode, source: 'org_period', period: period.period_label });
      }
      // 기간 전사 기본값
      if (period.eval_mode && period.eval_mode !== 'MBO')
        return res.json({ mode: period.eval_mode, source: 'period', period: period.period_label });
    }

    const global = db.prepare("SELECT value FROM app_settings WHERE key='eval_mode'").get();
    res.json({ mode: global?.value || 'MBO', source: 'global' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 조직장이 팀 평가 방식 설정
app.post('/api/settings/team-eval-mode', auth, (req, res) => {
  try {
    const { mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const isManager = db.prepare('SELECT 1 FROM users WHERE manager_id=? LIMIT 1').get(req.user.sub);
    const isAdmin = ['master','admin'].includes(req.user.role);
    if (!isManager && !isAdmin)
      return res.status(403).json({ error: '하위 팀원이 없으면 설정할 수 없습니다.' });
    const activeEval = db.prepare(
      "SELECT 1 FROM eval_cycles WHERE user_id=? AND phase NOT IN ('final_done') LIMIT 1"
    ).get(req.user.sub);
    if (activeEval && !isAdmin)
      return res.status(400).json({
        error: '진행 중인 평가가 있어 평가 방식을 변경할 수 없습니다. 현재 평가 기간이 완료된 후 변경하세요.'
      });
    db.prepare('UPDATE users SET eval_mode=? WHERE id=?').run(mode, req.user.sub);
    auditLog(req.user.sub, 'TEAM_EVAL_MODE_CHANGED', req.user.sub, null,
      `팀 평가 방식 변경: ${mode}`, req.ip);
    if (activeEval && isAdmin)
      return res.json({ success: true, mode, warning: '진행 중인 평가가 있는 사용자의 방식을 변경했습니다.' });
    res.json({ success: true, mode });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 전사 기본 평가 방식 (admin+)
app.get('/api/settings/eval-mode', auth, (req, res) => {
  const mode = db.prepare("SELECT value FROM app_settings WHERE key='eval_mode'").get();
  res.json({ mode: mode?.value || 'MBO' });
});
app.post('/api/settings/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const { mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('eval_mode',?)").run(mode);
    auditLog(req.user.sub, 'GLOBAL_EVAL_MODE_CHANGED', null, null,
      `전사 평가 방식 변경: ${mode}`, req.ip);
    res.json({ success: true, mode });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 특정 사용자 평가 방식 설정 (admin+)
app.patch('/api/users/:id/eval-mode', auth, adminOnly, (req, res) => {
  try {
    const { mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const isMaster = req.user.role === 'master';
    const activeEval = db.prepare(
      "SELECT 1 FROM eval_cycles WHERE user_id=? AND phase NOT IN ('final_done') LIMIT 1"
    ).get(req.params.id);
    if (activeEval && !isMaster)
      return res.status(400).json({
        error: '진행 중인 평가가 있어 평가 방식을 변경할 수 없습니다. 현재 평가 기간이 완료된 후 변경하세요.'
      });
    db.prepare('UPDATE users SET eval_mode=? WHERE id=?').run(mode, req.params.id);
    const target = db.prepare('SELECT name FROM users WHERE id=?').get(req.params.id);
    auditLog(req.user.sub, 'USER_EVAL_MODE_CHANGED', req.params.id, target?.name,
      `평가 방식 변경: ${mode}`, req.ip);
    if (activeEval && isMaster)
      return res.json({ success: true, warning: '진행 중인 평가가 있는 사용자의 방식을 변경했습니다.' });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// OKR CRUD
app.get('/api/okr', auth, (req, res) => {
  try {
    const cycles = db.prepare(
      'SELECT * FROM okr_cycles WHERE user_id=? ORDER BY created_at DESC'
    ).all(req.user.sub);
    const result = cycles.map(c => ({
      ...c,
      objectives: db.prepare(
        'SELECT * FROM okr_objectives WHERE cycle_id=? ORDER BY sort_order'
      ).all(c.id).map(obj => ({
        ...obj,
        key_results: db.prepare(
          'SELECT * FROM okr_key_results WHERE objective_id=? ORDER BY sort_order'
        ).all(obj.id)
      }))
    }));
    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/okr', auth, (req, res) => {
  try {
    const { period_label, eval_year, objectives } = req.body;
    const r = db.prepare(
      "INSERT INTO okr_cycles(user_id,period_label,eval_year) VALUES(?,?,?)"
    ).run(req.user.sub, period_label, eval_year);
    const cycleId = r.lastInsertRowid;
    (objectives||[]).forEach((obj, oi) => {
      const or = db.prepare(
        'INSERT INTO okr_objectives(cycle_id,title,description,sort_order) VALUES(?,?,?,?)'
      ).run(cycleId, obj.title, obj.description||'', oi);
      (obj.key_results||[]).forEach((kr, ki) => {
        db.prepare(
          'INSERT INTO okr_key_results(objective_id,title,target_value,unit,weight,sort_order) VALUES(?,?,?,?,?,?)'
        ).run(or.lastInsertRowid, kr.title, kr.target_value||100, kr.unit||'%', kr.weight||33, ki);
      });
    });
    res.json({ id: cycleId });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/okr/:id/progress', auth, (req, res) => {
  try {
    const { kr_updates } = req.body;
    (kr_updates||[]).forEach(u => {
      db.prepare('UPDATE okr_key_results SET current_value=? WHERE id=?')
        .run(u.current_value, u.kr_id);
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 전직원 평가 현황 요약 (admin+)
app.get('/api/admin/eval-status', auth, adminOnly, (req, res) => {
  try {
    const users = db.prepare(
      "SELECT id, name, dept, title, manager_id FROM users WHERE is_active=1 AND (account_status='approved' OR account_status IS NULL) ORDER BY dept, name"
    ).all();

    const result = users.map(u => {
      const ev = db.prepare(
        'SELECT * FROM eval_cycles WHERE user_id=? ORDER BY created_at DESC LIMIT 1'
      ).get(u.id);

      let goalCount = 0, feedbackCount = 0, finalScore = null, finalGrade = null, finalEvalId = null;
      if (ev) {
        goalCount     = (db.prepare('SELECT COUNT(*) as c FROM goals WHERE eval_id=?').get(ev.id) || {}).c || 0;
        feedbackCount = (db.prepare('SELECT COUNT(*) as c FROM feedbacks WHERE eval_id=?').get(ev.id) || {}).c || 0;
        const fe      = db.prepare('SELECT id, final_score, final_grade FROM final_evaluations WHERE eval_id=?').get(ev.id);
        finalScore    = fe ? fe.final_score : null;
        finalGrade    = fe ? fe.final_grade : null;
        finalEvalId   = fe ? fe.id         : null;
      }

      return {
        id:             u.id,
        name:           u.name,
        dept:           u.dept  || '',
        title:          u.title || '',
        phase:          ev ? ev.phase        : 'none',
        period_label:   ev ? ev.period_label : '-',
        eval_id:        ev ? ev.id           : null,
        final_eval_id:  finalEvalId,
        goal_count:     goalCount,
        feedback_count: feedbackCount,
        final_score:    finalScore,
        final_grade:    finalGrade,
        submitted_at:   ev ? ev.submitted_at : null,
        approved_at:    ev ? ev.approved_at  : null,
        locked:         ev ? ev.locked       : 0,
      };
    });
    res.json(result);
  } catch(err) {
    console.error('[eval-status]', err);
    res.status(500).json({ error: err.message });
  }
});

// 특정 직원 평가 상세 조회 (admin+)
app.get('/api/admin/eval-detail/:userId', auth, adminOnly, (req, res) => {
  try {
    const u = db.prepare('SELECT id,name,dept,title FROM users WHERE id=?').get(req.params.userId);
    if (!u) return res.status(404).json({ error: '사용자 없음' });

    const ev = db.prepare(
      'SELECT * FROM eval_cycles WHERE user_id=? ORDER BY created_at DESC LIMIT 1'
    ).get(req.params.userId);

    if (!ev) return res.json({ user: u, eval: null, goals: [], feedbacks: [], finalEval: null, approvals: [] });

    const goals = db.prepare(
      'SELECT g.*, c.name as cat_name, c.color, c.text_color FROM goals g JOIN goal_categories c ON g.category_id = c.id WHERE g.eval_id=? ORDER BY c.sort_order, g.sort_order'
    ).all(ev.id).map(g => ({ ...g, name: decrypt(g.name), kpi: decrypt(g.kpi) }));

    const fbs = db.prepare(
      'SELECT f.*, u2.name as author_name FROM feedbacks f JOIN users u2 ON f.author_id = u2.id WHERE f.eval_id=? ORDER BY f.created_at DESC'
    ).all(ev.id).map(f => ({
      ...f,
      overall_note: decrypt(f.overall_note),
      items: db.prepare(
        'SELECT fi.*, g.name as goal_name_enc FROM feedback_items fi JOIN goals g ON fi.goal_id = g.id WHERE fi.feedback_id=?'
      ).all(f.id).map(it => ({ ...it, note: decrypt(it.note), goal_name: decrypt(it.goal_name_enc) })),
    }));

    const fe = db.prepare('SELECT * FROM final_evaluations WHERE eval_id=?').get(ev.id);
    if (fe) {
      fe.self_note = decrypt(fe.self_note);
      fe.mgr_note  = decrypt(fe.mgr_note);
      fe.scores    = db.prepare('SELECT * FROM final_eval_scores WHERE final_id=?').all(fe.id);
    }

    const approvals = db.prepare(
      'SELECT a.*, u3.name as approver_name, u3.title as approver_title FROM goal_approvals a JOIN users u3 ON a.approver_id = u3.id WHERE a.eval_id=? ORDER BY a.level'
    ).all(ev.id).map(a => ({ ...a, note: decrypt(a.note) }));

    res.json({ user: u, eval: ev, goals, feedbacks: fbs, finalEval: fe || null, approvals });
  } catch(err) {
    console.error('[eval-detail]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 성과관리 API ──────────────────────────────────────────

// 대시보드 계층 설정
app.get('/api/settings/dashboard-depth', auth, (req, res) => {
  try {
    const s = db.prepare("SELECT value FROM app_settings WHERE key='dashboard_depth'").get();
    res.json({ depth: parseInt(s?.value || '2') });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/dashboard-depth', auth, adminOnly, (req, res) => {
  try {
    const depth = parseInt(req.body.depth);
    if (![1,2,3].includes(depth))
      return res.status(400).json({ error: '1~3단계만 설정 가능합니다. (4단계 미지원)' });
    db.prepare(`
      INSERT INTO app_settings(key,value,updated_by,updated_at)
      VALUES('dashboard_depth',?,?,datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at
    `).run(depth.toString(), req.user.sub);
    auditLog(req.user.sub, 'DASHBOARD_DEPTH_CHANGED', null, null,
      `대시보드 계층 변경: ${depth}단계`, req.ip);
    res.json({ success: true, depth });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 내 성과 요약
app.get('/api/perf/my-summary', auth, (req, res) => {
  try {
    const { period_id } = req.query;
    const userId = req.user.sub;
    const periods = period_id
      ? [db.prepare('SELECT * FROM eval_periods WHERE id=?').get(period_id)]
      : db.prepare('SELECT * FROM eval_periods WHERE is_active=1 ORDER BY id DESC').all();

    const result = periods.filter(Boolean).map(period => {
      const evals = db.prepare(`
        SELECT e.*, fe.final_score, fe.selected_grade, fe.self_done, fe.mgr_done
        FROM eval_cycles e
        LEFT JOIN final_evaluations fe ON fe.eval_id=e.id
        WHERE e.user_id=? AND e.period_label=? AND e.eval_year=?
      `).all(userId, period.period_label, period.eval_year);

      const reportCount = db.prepare(`
        SELECT COUNT(*) as c FROM progress_reports pr
        JOIN eval_cycles e ON pr.eval_id=e.id
        WHERE e.user_id=? AND e.period_label=?
      `).get(userId, period.period_label)?.c || 0;

      const feedbackCount = db.prepare(`
        SELECT COUNT(*) as c FROM feedbacks f
        JOIN eval_cycles e ON f.eval_id=e.id
        WHERE e.user_id=? AND e.period_label=?
      `).get(userId, period.period_label)?.c || 0;

      const okrCycles = db.prepare(`
        SELECT oc.*, (SELECT COUNT(*) FROM okr_objectives WHERE cycle_id=oc.id) as obj_count
        FROM okr_cycles oc
        WHERE oc.user_id=? AND oc.period_label=?
      `).all(userId, period.period_label);

      let okrAvg = null;
      if (okrCycles.length) {
        let totalKRs = 0, totalPct = 0;
        okrCycles.forEach(cycle => {
          const objs = db.prepare('SELECT * FROM okr_objectives WHERE cycle_id=?').all(cycle.id);
          objs.forEach(obj => {
            db.prepare('SELECT * FROM okr_key_results WHERE objective_id=?').all(obj.id).forEach(kr => {
              totalKRs++;
              totalPct += kr.target_value > 0 ? (kr.current_value / kr.target_value) * 100 : 0;
            });
          });
        });
        okrAvg = totalKRs > 0 ? Math.round(totalPct / totalKRs) : 0;
      }

      return {
        period_id: period.id,
        period_label: period.period_label,
        eval_year: period.eval_year,
        eval_mode: period.eval_mode || 'MBO',
        mbo_score: evals[0]?.final_score || null,
        okr_avg: okrAvg,
        report_count: reportCount,
        feedback_count: feedbackCount,
        phase: evals[0]?.phase || null,
        self_done: evals[0]?.self_done || 0,
        mgr_done: evals[0]?.mgr_done || 0,
      };
    });

    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 팀 성과 요약 (조직장용)
app.get('/api/perf/team-summary', auth, (req, res) => {
  try {
    const { period_id } = req.query;
    const userId = req.user.sub;
    const maxDepth = parseInt(
      db.prepare("SELECT value FROM app_settings WHERE key='dashboard_depth'").get()?.value || '2'
    );

    const myOrg = db.prepare('SELECT * FROM organizations WHERE leader_id=? AND is_active=1').get(userId);
    if (!myOrg) return res.json({ is_leader: false, teams: [] });

    function getSubMembers(orgId, depth) {
      if (depth > maxDepth) return [];
      const members = db.prepare('SELECT id, name, title FROM users WHERE org_id=? AND is_active=1').all(orgId);
      const subOrgs = db.prepare('SELECT * FROM organizations WHERE parent_id=? AND is_active=1').all(orgId);
      return [...members, ...subOrgs.flatMap(o => getSubMembers(o.id, depth + 1))];
    }
    const members = getSubMembers(myOrg.id, 1);

    const periods = period_id
      ? [db.prepare('SELECT * FROM eval_periods WHERE id=?').get(period_id)]
      : db.prepare('SELECT * FROM eval_periods WHERE is_active=1 ORDER BY id DESC LIMIT 3').all();

    const teamData = periods.filter(Boolean).map(period => {
      const memberStats = members.map(m => {
        const ev = db.prepare(`
          SELECT e.phase, fe.final_score, fe.mgr_done
          FROM eval_cycles e
          LEFT JOIN final_evaluations fe ON fe.eval_id=e.id
          WHERE e.user_id=? AND e.period_label=?
          ORDER BY e.id DESC LIMIT 1
        `).get(m.id, period.period_label);

        const okr = db.prepare('SELECT * FROM okr_cycles WHERE user_id=? AND period_label=?').all(m.id, period.period_label);
        let okrAvg = null;
        if (okr.length) {
          let t = 0, p = 0;
          okr.forEach(c => {
            db.prepare('SELECT * FROM okr_objectives WHERE cycle_id=?').all(c.id).forEach(obj => {
              db.prepare('SELECT * FROM okr_key_results WHERE objective_id=?').all(obj.id).forEach(kr => {
                t++;
                p += kr.target_value > 0 ? (kr.current_value/kr.target_value)*100 : 0;
              });
            });
          });
          okrAvg = t > 0 ? Math.round(p/t) : 0;
        }
        return { user_id: m.id, name: m.name, title: m.title,
          phase: ev?.phase||null, final_score: ev?.final_score||null, okr_avg: okrAvg, mgr_done: ev?.mgr_done||0 };
      });

      const scored    = memberStats.filter(m => m.final_score !== null);
      const okrScored = memberStats.filter(m => m.okr_avg !== null);
      return {
        period_label: period.period_label, eval_year: period.eval_year,
        eval_mode: period.eval_mode || 'MBO',
        member_count: members.length,
        team_avg_score: scored.length
          ? Math.round(scored.reduce((a,m)=>a+m.final_score,0)/scored.length*10)/10 : null,
        team_okr_avg: okrScored.length
          ? Math.round(okrScored.reduce((a,m)=>a+m.okr_avg,0)/okrScored.length) : null,
        members: memberStats,
      };
    });

    res.json({ is_leader: true, org_name: myOrg.name, teams: teamData });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// AI 성과 요약 (Claude API)
app.post('/api/perf/ai-summary', auth, async (req, res) => {
  try {
    const { type, data } = req.body;
    let prompt = '';
    if (type === 'personal') {
      prompt = `다음은 ${data.name}님의 성과 데이터입니다. 3줄로 성과를 요약하고 개선 포인트 1가지를 제안해주세요.\n\n평가 데이터:\n${JSON.stringify(data.periods, null, 2)}\n\n형식:\n📊 성과 요약: (2줄)\n💡 개선 제안: (1줄)`;
    } else if (type === 'team') {
      prompt = `다음은 ${data.org_name} 팀의 성과 데이터입니다. 팀 전체 성과를 3줄로 요약하고 리더를 위한 액션 제안 1가지를 해주세요.\n\n팀 데이터:\n${JSON.stringify(data.teams, null, 2)}\n\n형식:\n📊 팀 성과 요약: (2줄)\n💡 리더 액션 제안: (1줄)`;
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const result = await response.json();
    const text = result.content?.[0]?.text || '요약을 생성할 수 없습니다.';
    res.json({ summary: text });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 조직 관리 API ─────────────────────────────────────────

app.get('/api/organizations', auth, (req, res) => {
  try {
    const orgs = db.prepare(`
      SELECT o.*, u.name as leader_name, u.title as leader_title, p.name as parent_name
      FROM organizations o
      LEFT JOIN users u ON o.leader_id = u.id
      LEFT JOIN organizations p ON o.parent_id = p.id
      WHERE o.is_active = 1
      ORDER BY o.sort_order, o.id
    `).all();
    res.json(orgs);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/organizations', auth, adminOnly, (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '조직명은 필수입니다.' });
    const r = db.prepare(
      "INSERT INTO organizations(name,leader_id,parent_id,description,sort_order) VALUES(?,?,?,?,?)"
    ).run(name, leader_id||null, parent_id||null, description||'', sort_order||0);
    auditLog(req.user.sub, 'ORG_CREATED', r.lastInsertRowid, name, `조직 생성: ${name}`, req.ip);
    res.json({ id: r.lastInsertRowid });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/organizations/:id', auth, adminOnly, (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    db.prepare(
      "UPDATE organizations SET name=?,leader_id=?,parent_id=?,description=?,sort_order=? WHERE id=?"
    ).run(name, leader_id||null, parent_id||null, description||'', sort_order||0, req.params.id);
    auditLog(req.user.sub, 'ORG_UPDATED', req.params.id, name, `조직 수정: ${name}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/organizations/:id', auth, masterOnly, (req, res) => {
  try {
    const org = db.prepare('SELECT name FROM organizations WHERE id=?').get(req.params.id);
    db.prepare('UPDATE organizations SET is_active=0 WHERE id=?').run(req.params.id);
    auditLog(req.user.sub, 'ORG_DELETED', req.params.id, org?.name, '조직 비활성화', req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/organizations/:id/members', auth, (req, res) => {
  try {
    const members = db.prepare(
      'SELECT id, name, title, grade, dept, role FROM users WHERE org_id=? AND is_active=1'
    ).all(req.params.id);
    res.json(members);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id/org', auth, adminOnly, (req, res) => {
  try {
    const { org_id } = req.body;
    db.prepare('UPDATE users SET org_id=? WHERE id=?').run(org_id||null, req.params.id);
    const target = db.prepare('SELECT name FROM users WHERE id=?').get(req.params.id);
    const org = org_id ? db.prepare('SELECT name FROM organizations WHERE id=?').get(org_id) : null;
    auditLog(req.user.sub, 'USER_ORG_CHANGED', req.params.id, target?.name,
      `조직 변경: ${org?.name||'미지정'}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 앱 설정 API ──────────────────────────────────────────

function getSetting(key, defaultVal) {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key=?").get(key);
    return row ? row.value : defaultVal;
  } catch(e) { return defaultVal; }
}

function setSetting(key, value) {
  try {
    const exists = db.prepare("SELECT 1 FROM app_settings WHERE key=?").get(key);
    if (exists) db.prepare("UPDATE app_settings SET value=? WHERE key=?").run(value, key);
    else db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?)").run(key, value);
  } catch(e) { console.error('[setSetting]', e.message); }
}

// 이력 공개 설정
app.get('/api/settings/history-visibility', auth, (req, res) => {
  res.json({ enabled: getSetting('history_visibility', '1') === '1' });
});
app.post('/api/settings/history-visibility', auth, adminOnly, (req, res) => {
  setSetting('history_visibility', req.body.enabled ? '1' : '0');
  res.json({ success: true });
});

// 비활성 기간 이력 공개
app.get('/api/settings/history-inactive', auth, (req, res) => {
  res.json({ enabled: getSetting('history_inactive', '0') === '1' });
});
app.post('/api/settings/history-inactive', auth, adminOnly, (req, res) => {
  setSetting('history_inactive', req.body.enabled ? '1' : '0');
  res.json({ success: true });
});

// 피드백 횟수 제한
app.get('/api/settings/feedback-limit', auth, (req, res) => {
  res.json({ limit: parseInt(getSetting('feedback_limit', '0')) });
});
app.post('/api/settings/feedback-limit', auth, adminOnly, (req, res) => {
  setSetting('feedback_limit', String(parseInt(req.body.limit) || 0));
  res.json({ success: true });
});

// 승인 수정/취소 허용
// 2차 최종평가 허용 설정
app.get('/api/settings/second-final', auth, (req, res) => {
  res.json({ enabled: getSetting('second_final', '0') === '1' });
});
app.post('/api/settings/second-final', auth, adminOnly, (req, res) => {
  setSetting('second_final', req.body.enabled ? '1' : '0');
  res.json({ success: true });
});

// 시간대 설정
app.get('/api/settings/timezone', auth, (req, res) => {
  const tz = db.prepare("SELECT value FROM app_settings WHERE key='timezone'").get();
  res.json({ timezone: tz?.value || 'Asia/Seoul' });
});
app.post('/api/settings/timezone', auth, masterOnly, (req, res) => {
  try {
    const { timezone } = req.body;
    const validTimezones = [
      'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
      'Asia/Bangkok', 'Asia/Dubai', 'Europe/London', 'Europe/Paris',
      'Europe/Berlin', 'America/New_York', 'America/Los_Angeles',
      'America/Chicago', 'Australia/Sydney', 'Pacific/Auckland',
      'UTC'
    ];
    if (!validTimezones.includes(timezone))
      return res.status(400).json({ error: '지원하지 않는 시간대입니다.' });
    db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('timezone',?)").run(timezone);
    process.env.TZ = timezone;
    auditLog(req.user.sub, 'TIMEZONE_CHANGED', null, null,
      `시간대 변경: ${timezone}`, req.ip);
    res.json({ success: true, timezone });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 내가 직속 상사(또는 2차 평가자)인 final_mgr_pending eval 목록
app.get('/api/evals/my-mgr-pending', auth, (req, res) => {
  try {
    // 1차: 내 직속 부하의 eval (자기평가 완료 이후 단계 전체)
    const directRows = db.prepare(
      `SELECT e.*,u.name as user_name,u.dept,u.grade,u.title,0 as is_second
       FROM eval_cycles e
       JOIN users u ON e.user_id=u.id
       WHERE e.phase IN ('final_mgr_pending','final_mgr2_pending')
       AND u.manager_id=?
       ORDER BY e.created_at DESC`
    ).all(req.user.sub);

    // 2차 최종평가 설정 확인
    const secondEnabled = getSetting('second_final', '0') === '1';
    let secondRows = [];
    if (secondEnabled) {
      // 2차: 1차 평가자가 이미 평가 완료한 경우만 표시
      secondRows = db.prepare(
        `SELECT e.*,u.name as user_name,u.dept,u.grade,u.title,1 as is_second
         FROM eval_cycles e
         JOIN users u ON e.user_id=u.id
         JOIN final_evaluations fe ON fe.eval_id=e.id
         WHERE e.phase IN ('final_mgr2_pending')
         AND fe.mgr_done=1
         AND u.manager_id IN (SELECT id FROM users WHERE manager_id=?)
         ORDER BY e.created_at DESC`
      ).all(req.user.sub);
    }

    const seen = new Set(directRows.map(r => r.id));
    const combined = [
      ...directRows,
      ...secondRows.filter(r => !seen.has(r.id)),
    ];
    combined.forEach(r => {
      r.self_reason   = r.self_reason   ? decrypt(r.self_reason)   : '';
      r.reject_reason = r.reject_reason ? decrypt(r.reject_reason) : '';
    });
    res.json(combined);
  } catch(err) {
    console.error('[my-mgr-pending]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 등급 기준 API ─────────────────────────────────────────
app.get('/api/grade-criteria', auth, (req, res) => {
  try {
    const grades = db.prepare(
      'SELECT * FROM grade_criteria ORDER BY sort_order, id'
    ).all();
    res.json(grades);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/grade-criteria', auth, adminOnly, (req, res) => {
  try {
    const { grade_code, grade_name, description, note, sort_order } = req.body;
    if (!grade_code || !grade_name) return res.status(400).json({ error: '등급 코드와 명칭은 필수입니다.' });
    const finalSort = sort_order || ((db.prepare('SELECT MAX(sort_order) as m FROM grade_criteria').get()?.m||0) + 1);
    const r = db.prepare(
      'INSERT INTO grade_criteria(grade_code,grade_name,description,note,sort_order) VALUES(?,?,?,?,?)'
    ).run(grade_code, grade_name, description||'', note||'', finalSort);
    res.json({ id: r.lastInsertRowid });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/grade-criteria/:id', auth, adminOnly, (req, res) => {
  try {
    const { grade_code, grade_name, description, note, sort_order } = req.body;
    db.prepare(
      'UPDATE grade_criteria SET grade_code=?,grade_name=?,description=?,note=?,sort_order=COALESCE(?,sort_order) WHERE id=?'
    ).run(grade_code, grade_name, description||'', note||'', sort_order||null, req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/grade-criteria/:id', auth, adminOnly, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM grade_criteria').get()?.c || 0;
    if (total <= 2) return res.status(400).json({ error: '최소 2개 이상의 등급이 필요합니다.' });
    db.prepare('DELETE FROM grade_criteria WHERE id=?').run(req.params.id);
    // sort_order 재정렬
    const remaining = db.prepare('SELECT id FROM grade_criteria ORDER BY sort_order').all();
    remaining.forEach((r, i) => {
      db.prepare('UPDATE grade_criteria SET sort_order=? WHERE id=?').run(i+1, r.id);
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings/approval-edit', auth, (req, res) => {
  res.json({ enabled: getSetting('approval_edit', '0') === '1' });
});
app.post('/api/settings/approval-edit', auth, adminOnly, (req, res) => {
  setSetting('approval_edit', req.body.enabled ? '1' : '0');
  res.json({ success: true });
});

app.get('/api/admin/audit', auth, adminOnly, (req, res) => {
  try {
    const { action, limit = 300 } = req.query;
    // 컬럼 존재 여부 확인
    const cols = db.prepare("PRAGMA table_info(audit_logs)").all().map(c => c.name);
    const hasDetail     = cols.includes('detail');
    const hasTargetName = cols.includes('target_name');
    const hasTargetId   = cols.includes('target_id');

    const selectCols = [
      'a.id', 'a.user_id', 'a.action', 'a.ip', 'a.created_at',
      hasTargetId   ? 'a.target_id'   : 'NULL as target_id',
      hasTargetName ? 'a.target_name' : 'NULL as target_name',
      hasDetail     ? 'a.detail'      : 'NULL as detail',
      'u.name as actor_name', 'u.dept as actor_dept',
    ].join(', ');

    let sql = `SELECT ${selectCols} FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id`;
    const params = [];
    if (action) { sql += ' WHERE a.action=?'; params.push(action); }
    sql += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const logs = db.prepare(sql).all(...params);
    res.json(logs);
  } catch(err) {
    console.error('[audit]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/final/:id/unlock', auth, masterOnly, (req, res) => {
  try {
    const fe = db.prepare('SELECT * FROM final_evaluations WHERE id=?').get(req.params.id);
    if (!fe) return res.status(404).json({ error: '최종평가를 찾을 수 없습니다.' });

    // final_evaluations 완전 초기화
    db.prepare(`UPDATE final_evaluations
      SET locked=0, locked_at=NULL,
          self_done=0, self_done_at=NULL,
          mgr_done=0, mgr_done_at=NULL,
          mgr_approver_id=NULL,
          second_mgr_done=0, second_mgr_done_at=NULL,
          second_mgr_id=NULL,
          final_score=NULL, final_grade=NULL, selected_grade=NULL
      WHERE id=?`).run(req.params.id);

    // eval_cycles → final_self, 잠금 해제
    db.prepare(`UPDATE eval_cycles
      SET phase='final_self', locked=0, updated_at=datetime('now')
      WHERE id=?`).run(fe.eval_id);

    // 별점 초기화
    db.prepare(`UPDATE final_eval_scores
      SET mgr_score=NULL, second_mgr_score=NULL
      WHERE final_id=?`).run(req.params.id);

    const ev = db.prepare('SELECT user_id, period_label FROM eval_cycles WHERE id=?').get(fe.eval_id);
    const target = ev ? db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id) : null;
    auditLog(req.user.sub, 'FINAL_EVAL_UNLOCKED', fe.eval_id, target?.name,
      `최종평가 잠금 해제 및 초기화 (${ev?.period_label||''})`, req.ip);

    res.json({ success: true });
  } catch(err) {
    console.error('[unlock]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ════════════════════════════════════════════════════════════
//  DB INIT
// ════════════════════════════════════════════════════════════
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT DEFAULT 'user',
      dept TEXT, title TEXT, manager_id INTEGER,
      is_active INTEGER DEFAULT 1,
      account_status TEXT DEFAULT 'approved',
      signup_note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action TEXT, ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goal_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT, weight INTEGER DEFAULT 0,
      color TEXT, text_color TEXT, sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1, created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS eval_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, period_type TEXT, period_label TEXT, eval_year TEXT,
      phase TEXT DEFAULT 'draft', self_reason TEXT,
      submitted_at TEXT, approved_at TEXT, locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_id INTEGER NOT NULL, category_id INTEGER NOT NULL,
      name TEXT, kpi TEXT, weight INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0, status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goal_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_id INTEGER NOT NULL, approver_id INTEGER NOT NULL,
      level INTEGER, action TEXT, note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
      overall_note TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS feedback_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL, goal_id INTEGER NOT NULL,
      score INTEGER, note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS final_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_id INTEGER UNIQUE NOT NULL,
      self_note TEXT, self_done INTEGER DEFAULT 0, self_done_at TEXT,
      mgr_note TEXT, mgr_done INTEGER DEFAULT 0, mgr_done_at TEXT,
      mgr_approver_id INTEGER, final_score REAL, final_grade TEXT,
      locked INTEGER DEFAULT 0, locked_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS final_eval_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      final_id INTEGER NOT NULL, goal_id INTEGER NOT NULL,
      self_score INTEGER, mgr_score INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // 컬럼 마이그레이션 (기존 DB 호환)
  const migrations = [
    "ALTER TABLE eval_cycles ADD COLUMN reject_reason TEXT",
    "ALTER TABLE audit_logs ADD COLUMN target_id INTEGER",
    "ALTER TABLE audit_logs ADD COLUMN target_name TEXT",
    "ALTER TABLE audit_logs ADD COLUMN detail TEXT",
    "ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ''",
    `CREATE TABLE IF NOT EXISTS progress_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS report_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      feedback_id INTEGER,
      final_eval_id INTEGER,
      file_name TEXT,
      file_data TEXT,
      file_type TEXT,
      file_size INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
    "ALTER TABLE final_evaluations ADD COLUMN second_mgr_done INTEGER DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS grade_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_code TEXT NOT NULL,
      grade_name TEXT NOT NULL,
      description TEXT,
      note TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE final_evaluations ADD COLUMN selected_grade TEXT",
    "ALTER TABLE final_evaluations ADD COLUMN second_mgr_note TEXT",
    "ALTER TABLE final_evaluations ADD COLUMN second_mgr_id INTEGER",
    "ALTER TABLE final_evaluations ADD COLUMN second_mgr_done_at TEXT",
    "ALTER TABLE final_evaluations ADD COLUMN second_selected_grade TEXT",
    "ALTER TABLE final_eval_scores ADD COLUMN second_mgr_score INTEGER",
    "ALTER TABLE eval_cycles ADD COLUMN phase2 TEXT",
    `CREATE TABLE IF NOT EXISTS eval_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_type TEXT NOT NULL,
      period_label TEXT NOT NULL,
      eval_year TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE users ADD COLUMN eval_mode TEXT DEFAULT 'MBO'",
    `CREATE TABLE IF NOT EXISTS okr_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      period_label TEXT NOT NULL,
      eval_year TEXT NOT NULL,
      phase TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS okr_objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS okr_key_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      objective_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target_value REAL DEFAULT 100,
      current_value REAL DEFAULT 0,
      unit TEXT DEFAULT '%',
      weight INTEGER DEFAULT 33,
      sort_order INTEGER DEFAULT 0
    )`,
    "ALTER TABLE eval_periods ADD COLUMN eval_mode TEXT DEFAULT 'MBO'",
    "ALTER TABLE eval_periods ADD COLUMN locked INTEGER DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS eval_period_modes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id   INTEGER NOT NULL,
      manager_id  INTEGER NOT NULL,
      eval_mode   TEXT NOT NULL DEFAULT 'MBO',
      locked      INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(period_id, manager_id)
    )`,
    `CREATE TABLE IF NOT EXISTS organizations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      leader_id   INTEGER,
      parent_id   INTEGER,
      description TEXT,
      sort_order  INTEGER DEFAULT 0,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE users ADD COLUMN org_id INTEGER",
    "ALTER TABLE app_settings ADD COLUMN updated_by INTEGER",
    "ALTER TABLE app_settings ADD COLUMN updated_at TEXT",
  ];
  migrations.forEach(sql => { try { db.prepare(sql).run(); } catch(e) {} });

  // 기본 등급 기준 시드 (없을 때만)
  try {
    const gradeExists = db.prepare('SELECT 1 FROM grade_criteria LIMIT 1').get();
    if (!gradeExists) {
      const grades = [
        { code:'OI', name:'OI (Outstanding Impact)',    desc:'조직 전체에 탁월한 영향을 미친 최고 수준의 성과를 달성하였습니다.',      note:'최상위 성과자', sort:1 },
        { code:'EE', name:'EE (Exceeds Expectations)',  desc:'기대 수준을 명확히 초과하는 우수한 성과를 지속적으로 창출하였습니다.',    note:'우수 성과자',   sort:2 },
        { code:'SC', name:'SC (Strong Contributor)',    desc:'핵심 목표를 달성하며 팀에 실질적인 기여를 한 성과를 보였습니다.',        note:'우량 기여자',   sort:3 },
        { code:'ME', name:'ME (Meets Expectations)',    desc:'설정된 목표와 기대 수준을 충실히 달성한 안정적인 성과를 보였습니다.',     note:'기준 충족',     sort:4 },
        { code:'PB', name:'PB (Performance Building)',  desc:'일부 목표를 달성하였으나 전반적인 역량 강화와 성과 개선이 필요합니다.',  note:'성과 개선 필요', sort:5 },
        { code:'IR', name:'IR (Improvement Required)',  desc:'주요 목표 달성에 미흡하여 구체적인 개선 계획 수립과 실행이 요구됩니다.',note:'개선 요구',      sort:6 },
        { code:'NC', name:'NC (No Contest)',            desc:'평가를 위한 충분한 활동 및 데이터가 확인되지 않아 등급 산정이 불가합니다.',note:'해당 없음',   sort:7 },
      ];
      const ins = db.prepare('INSERT INTO grade_criteria(grade_code,grade_name,description,note,sort_order) VALUES(?,?,?,?,?)');
      grades.forEach(g => ins.run(g.code, g.name, g.desc, g.note, g.sort));
      console.log('✅ 기본 등급 기준 생성 완료');
    }
  } catch(e) { console.log('[grade seed skip]', e.message); }
  // 기존 action 컬럼에 복합 문자열로 저장된 것들 정리 (action에 ':' 포함된 것)
  try {
    const oldRows = db.prepare("SELECT id, action FROM audit_logs WHERE action LIKE '%:%' OR action LIKE '%—%'").all();
    oldRows.forEach(r => {
      const parts = r.action.split(':');
      const cleanAction = parts[0].trim();
      db.prepare("UPDATE audit_logs SET action=? WHERE id=?").run(cleanAction, r.id);
    });
    if (oldRows.length) console.log('[migration] cleaned', oldRows.length, 'audit log actions');
  } catch(e) {}
  // app_settings 기본값 시드
  try {
    db.prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES('timezone','Asia/Seoul')").run();
    db.prepare("INSERT OR IGNORE INTO app_settings(key,value) VALUES('eval_mode','MBO')").run();
  } catch(e) {}

  // organizations 초기 데이터
  try {
    const orgCount = db.prepare('SELECT COUNT(*) as c FROM organizations').get();
    if (orgCount.c === 0) {
      const rootOrg = db.prepare(
        "INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)"
      ).run('㈜사이냅소프트', 1, null, 0);
      const rootId = rootOrg.lastInsertRowid;
      const hrOrg    = db.prepare("INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)").run('인사팀', 2, rootId, 1);
      const devOrg   = db.prepare("INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)").run('개발팀', 4, rootId, 2);
      const salesOrg = db.prepare("INSERT INTO organizations(name, leader_id, parent_id, sort_order) VALUES(?,?,?,?)").run('영업팀', 7, rootId, 3);
      const orgMap = [
        [1, rootId], [2, hrOrg.lastInsertRowid], [3, hrOrg.lastInsertRowid],
        [4, devOrg.lastInsertRowid], [5, devOrg.lastInsertRowid], [6, devOrg.lastInsertRowid],
        [7, salesOrg.lastInsertRowid],
      ];
      orgMap.forEach(([userId, orgId]) => {
        db.prepare('UPDATE users SET org_id=? WHERE id=?').run(orgId, userId);
      });
      console.log('[DB] organizations 초기 데이터 생성 완료');
    }
  } catch(e) { console.log('[org seed skip]', e.message); }

  // 공지사항 초기 데이터
  try {
    const noticeExists = db.prepare("SELECT value FROM app_settings WHERE key='notice'").get();
    if (!noticeExists) {
      const noticeContent = `테스트 계정 안내

[마스터관리자] ceo@synapsoft.com / admin1234
[인사팀장] hr1@synapsoft.com / admin1234
[인사팀원] hr2@synapsoft.com / admin1234
[개발팀장] dev1@synapsoft.com / user1234
[시니어개발자] dev2@synapsoft.com / user1234
[주니어개발자] dev3@synapsoft.com / user1234
[영업팀장] sales1@synapsoft.com / user1234
[영업사원] sales2@synapsoft.com / user1234`;
      db.prepare(
        "INSERT INTO app_settings(key, value, updated_by, updated_at) VALUES('notice', ?, 1, datetime('now'))"
      ).run(noticeContent);
      console.log('[DB] 공지사항 초기 데이터 생성 완료');
    }
  } catch(e) { console.log('[notice seed skip]', e.message); }

  seedInitialData();
  loadTimezone();
}

function seedInitialData() {
  const exists = db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (exists) return;
  console.log('📦 초기 데이터 생성 중...');
  // 사용자 생성
  const users = [
    { name:'이대표',   email:'ceo@synapsoft.com',    pw:'admin1234', role:'master', dept:'경영진',  title:'대표이사',       mgr:null },
    { name:'김인사',   email:'hr1@synapsoft.com',     pw:'admin1234', role:'master', dept:'인사팀',  title:'인사팀장',       mgr:1 },
    { name:'박인사',   email:'hr2@synapsoft.com',     pw:'admin1234', role:'admin',  dept:'인사팀',  title:'인사팀원',       mgr:2 },
    { name:'최개발',   email:'dev1@synapsoft.com',    pw:'user1234',  role:'user',   dept:'개발팀',  title:'개발팀장',       mgr:1 },
    { name:'정개발',   email:'dev2@synapsoft.com',    pw:'user1234',  role:'user',   dept:'개발팀',  title:'시니어개발자',   mgr:4 },
    { name:'한개발',   email:'dev3@synapsoft.com',    pw:'user1234',  role:'user',   dept:'개발팀',  title:'주니어개발자',   mgr:5 },
    { name:'오영업',   email:'sales1@synapsoft.com',  pw:'user1234',  role:'user',   dept:'영업팀',  title:'영업팀장',       mgr:1 },
    { name:'강영업',   email:'sales2@synapsoft.com',  pw:'user1234',  role:'user',   dept:'영업팀',  title:'영업사원',       mgr:7 },
  ];
  const ins = db.prepare('INSERT INTO users(name,email,password_hash,role,dept,title,manager_id) VALUES(?,?,?,?,?,?,?)');
  users.forEach(u => ins.run(u.name, u.email, bcrypt.hashSync(u.pw, 10), u.role, u.dept, u.title, u.mgr));
  // 카테고리
  const cats = [
    ['업적목표','핵심 성과 및 목표 달성',50,'#FFF4EC','#7A2F02',1],
    ['업무능력','직무 역량 및 전문성',   30,'#E1F5EE','#085041',2],
    ['근무태도','협업, 책임감, 성실성',  20,'#EEEDFE','#3C3489',3],
  ];
  const insCat = db.prepare('INSERT INTO goal_categories(name,description,weight,color,text_color,sort_order,created_by) VALUES(?,?,?,?,?,?,1)');
  cats.forEach(c => insCat.run(...c));
  console.log('✅ 초기 데이터 생성 완료');
}

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  ㈜사이냅소프트 인사평가 시스템               ║');
  console.log('║  로컬 테스트 서버 가동 완료                   ║');
  console.log(`║  브라우저 접속: http://localhost:${PORT}        ║`);
  console.log('╠════════════════════════════════════════════╣');
  console.log('║  [마스터관리자] ceo@synapsoft.com             ║');
  console.log('║  [인사팀장]    hr1@synapsoft.com              ║');
  console.log('║  [개발팀장]    dev1@synapsoft.com             ║');
  console.log('║  [일반직원]    dev3@synapsoft.com             ║');
  console.log('║  공통 비밀번호: admin1234 / user1234          ║');
  console.log('╚════════════════════════════════════════════╝\n');
});
