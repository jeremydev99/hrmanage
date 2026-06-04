/**
 * ㈜사이냅소프트 인사평가 시스템
 * 로컬 테스트 서버 — Node.js + SQLite (설치 불필요)
 * 실행: node server/index.js
 */
require('dotenv').config();
const express  = require('express');
const path     = require('path');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const helmet   = require('helmet');
const Database = require('better-sqlite3');

// Repository Pattern
const {
  getUserRepository,
  getGoalCategoryRepository,
  getGradeCriteriaRepository,
  getOrganizationRepository,
  getEvalCycleRepository,
  getGoalRepository,
  getFeedbackRepository,
  getFinalEvaluationRepository,
  getProgressReportRepository,
  getGoalApprovalRepository,
  getEvalPeriodRepository,
  getAdminRepository,
  getGradePolicyRepository,
} = require('./config/repository-factory');
const userRepo = getUserRepository();
const goalCategoryRepo = getGoalCategoryRepository();
const gradeCriteriaRepo = getGradeCriteriaRepository();
const organizationRepo = getOrganizationRepository();
const evalCycleRepo = getEvalCycleRepository();
const goalRepo = getGoalRepository();
const feedbackRepo = getFeedbackRepository();
const finalEvalRepo = getFinalEvaluationRepository();
const progressReportRepo  = getProgressReportRepository();
const approvalRepo        = getGoalApprovalRepository();
const evalPeriodRepo      = getEvalPeriodRepository();
const adminRepo           = getAdminRepository();
const gradePolicyRepo     = getGradePolicyRepository();

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET     = process.env.JWT_SECRET || 'synap-hr-local-dev-secret-2025';
const ENC_SECRET     = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
const DB_PATH        = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hrmanage.db');

// ── DB 초기화 ──────────────────────────────────────────────
const db = new Database(DB_PATH);
// journal_mode: 로컬은 WAL(성능 우위), Docker+Windows 바인드 마운트는 DELETE 필수
// (SQLITE_IOERR_SHMOPEN 회피)
db.pragma(`journal_mode = ${process.env.SQLITE_JOURNAL_MODE || 'WAL'}`);
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

// ── 비밀번호 정책 검증 ────────────────────────────────────
function validatePassword(password, user) {
  if (!password || password.length < 8)
    return { valid: false, error: '비밀번호는 최소 8자 이상이어야 합니다.' };
  if (password.length > 128)
    return { valid: false, error: '비밀번호는 128자 이하여야 합니다.' };

  const typeCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[!@#$%^&*()\-_+=[\]{}|;:,.<>?]/]
    .filter(r => r.test(password)).length;
  if (typeCount < 2)
    return { valid: false, error: '비밀번호는 영문·숫자·특수문자 중 2종 이상을 포함해야 합니다.' };

  const weak = [
    'password','password1','password123',
    '12345678','123456789','qwerty','qwerty123',
    'admin','admin1234','admin1',
    'user1234','user','user123',
    'synapsoft','synap1234',
  ];
  if (weak.includes(password.toLowerCase()))
    return { valid: false, error: '자주 사용되는 약한 비밀번호는 사용할 수 없습니다.' };

  if (user) {
    if (user.email && password.toLowerCase() === user.email.toLowerCase().split('@')[0])
      return { valid: false, error: '비밀번호는 이메일 아이디와 동일할 수 없습니다.' };
    if (user.name && user.name.length >= 4 && password.toLowerCase().includes(user.name.toLowerCase()))
      return { valid: false, error: '비밀번호에 이름을 포함할 수 없습니다.' };
  }
  return { valid: true };
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
// [INFRA-A2] notice/settings 6건 → getSettingRow/upsertSettingMeta/userRepo async 전환
app.get('/api/notice', async (req, res) => {
  try {
    const notice = getSettingRow('notice');
    if (!notice) return res.json({ content: '', author_name: '', author_title: '', updated_at: '' });
    const author = notice.updated_by ? await userRepo.findById(notice.updated_by) : null;
    res.json({
      content: notice.value || '',
      author_name: author?.name || '',
      author_title: author?.title || '',
      updated_at: notice.updated_at || '',
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 공지사항 수정 (admin+)
app.post('/api/notice', auth, adminOnly, async (req, res) => {
  try {
    const { content } = req.body;
    upsertSettingMeta('notice', content || '', req.user.sub);
    auditLog(req.user.sub, 'NOTICE_UPDATED', null, null,
      `공지사항 수정 (${(content||'').length}자)`, req.ip);
    const author = await userRepo.findById(req.user.sub);
    res.json({ success: true, author_name: author?.name });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 세션 정책 조회
app.get('/api/settings/session-policy', auth, (req, res) => {
  try {
    const value = getSetting('session_policy', null);
    res.json(JSON.parse(value || '{"close_on_browser_close":false,"timeout_minutes":480}'));
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
    upsertSettingMeta('session_policy', JSON.stringify(policy), req.user.sub);
    auditLog(req.user.sub, 'SESSION_POLICY_CHANGED', null, null,
      `세션 정책 변경: 브라우저종료=${policy.close_on_browser_close}, 만료=${safeTimeout}분`, req.ip);
    res.json({ success: true, policy });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
//  AUTH API
// ════════════════════════════════════════════════════════════
// [INFRA-A2] auth 3건 → userRepo async 전환
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await userRepo.findByEmail(email);
    if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash))
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
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 신규 가입 신청 (인증 불필요 — 누구나 신청 가능)
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, dept, title, signup_note } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  try {
    const exists = await userRepo.findByEmail(email);
    if (exists) return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
    const hash = bcrypt.hashSync(password, 10);
    await userRepo.createSignup({ name, email, passwordHash: hash, dept, title, signupNote: signup_note });
    res.json({ success: true, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// [PROMPT_36-4] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/auth/me', auth, (req, res) => {
//   const u = db.prepare('SELECT id,name,email,role,dept,title,manager_id FROM users WHERE id=?').get(req.user.sub);
//   res.json(u || {});
// });

// [PROMPT_36-4] Repository Pattern 적용
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await userRepo.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: 'User not found' });
    delete user.password_hash;
    res.json(user);
  } catch (e) {
    console.error('[/api/auth/me]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 본인 비밀번호 변경
app.post('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password, new_password_confirm } = req.body;

    if (!current_password || !new_password || !new_password_confirm)
      return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    if (new_password !== new_password_confirm)
      return res.status(400).json({ error: '새 비밀번호와 확인이 일치하지 않습니다.' });
    if (new_password === current_password)
      return res.status(400).json({ error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });

    const user = await userRepo.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      auditLog(req.user.sub, 'PASSWORD_CHANGE_FAILED', req.user.sub, user.name, '현재 비밀번호 불일치', req.ip);
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }

    const validation = validatePassword(new_password, user);
    if (!validation.valid)
      return res.status(400).json({ error: validation.error });

    const newHash = await bcrypt.hash(new_password, 10);
    await userRepo.updatePassword(req.user.sub, newHash);

    auditLog(req.user.sub, 'PASSWORD_CHANGED', req.user.sub, user.name, '본인 비밀번호 변경', req.ip);
    res.json({ success: true, message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.', logout_required: true });
  } catch (err) {
    console.error('[POST /api/auth/change-password]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  USERS & ORG
// ════════════════════════════════════════════════════════════
// [INFRA-2A-MIGRATE-A1] users 도메인 → userRepo async 전환 (15건 → 0건 db.prepare)
app.get('/api/users', auth, async (req, res) => {
  try {
    const users = await userRepo.findAll();
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { name, email, password, role, dept, title, manager_id } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: '필수 항목 누락' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const id = await userRepo.createAdmin({ name, email, passwordHash: hash, role, dept, title, managerId: manager_id });
    res.json({ id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/users/:id', auth, adminOnly, async (req, res) => {
  const { role, dept, title, manager_id, is_active } = req.body;
  try {
    await userRepo.updatePartial(req.params.id, { role, dept, title, manager_id, is_active });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 가입 신청 목록 조회 (admin+)
app.get('/api/users/signup-requests', auth, adminOnly, async (req, res) => {
  try {
    const rows = await userRepo.findSignupRequests();
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 가입 승인 (admin+)
app.post('/api/users/:id/approve', auth, adminOnly, async (req, res) => {
  const { role, dept, title, manager_id } = req.body;
  try {
    const user = await userRepo.findById(req.params.id);
    if (!user) return res.status(404).json({ error: '사용자 없음' });
    await userRepo.approveSignup(req.params.id, { role, dept, title, managerId: manager_id });
    auditLog(req.user.sub, 'ACCOUNT_APPROVED', req.params.id, user.name, null, req.ip);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 가입 거절 (admin+)
app.post('/api/users/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    await userRepo.rejectSignup(req.params.id);
    auditLog(req.user.sub, 'ACCOUNT_REJECTED', req.params.id, null, null, req.ip);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 계정 비활성화/활성화 토글 (admin+)
app.post('/api/users/:id/toggle-active', auth, adminOnly, async (req, res) => {
  try {
    const newVal = await userRepo.toggleActive(req.params.id);
    if (newVal === null) return res.status(404).json({ error: '사용자 없음' });
    auditLog(req.user.sub, newVal ? 'ACCOUNT_ENABLED' : 'ACCOUNT_DISABLED', req.params.id, null, null, req.ip);
    res.json({ success: true, is_active: newVal });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 조직도: 특정 사용자의 승인 체계 반환
app.get('/api/users/:id/approvers', auth, async (req, res) => {
  try {
    const approvers = await userRepo.getApproverChain(req.params.id);
    res.json(approvers);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════
//  GOAL CATEGORIES
// ════════════════════════════════════════════════════════════
// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/categories', auth, (req, res) => {
//   res.json(db.prepare('SELECT * FROM goal_categories WHERE is_active=1 ORDER BY sort_order').all());
// });

// [PROMPT_36-6] Repository Pattern 적용
app.get('/api/categories', auth, async (req, res) => {
  try {
    const categories = await goalCategoryRepo.findAllActive();
    res.json(categories);
  } catch (e) {
    console.error('[GET /api/categories]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리
// app.post('/api/categories', auth, adminOnly, (req, res) => {
//   const { name, description, weight, color, text_color, sort_order } = req.body;
//   const r = db.prepare(
//     'INSERT INTO goal_categories(name,description,weight,color,text_color,sort_order,created_by) VALUES(?,?,?,?,?,?,?)'
//   ).run(name, description||'', weight||0, color||'#E6F1FB', text_color||'#0C447C', sort_order||0, req.user.sub);
//   res.json({ id: r.lastInsertRowid });
// });

// [PROMPT_36-6] Repository Pattern 적용
app.post('/api/categories', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, weight, color, text_color, sort_order } = req.body;
    const id = await goalCategoryRepo.create({
      name, description, weight, color, text_color, sort_order,
      created_by: req.user.sub,
    });
    res.json({ id });
  } catch (e) {
    console.error('[POST /api/categories]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리
// app.put('/api/categories/:id', auth, adminOnly, (req, res) => {
//   const { name, description, weight, color, text_color, sort_order, is_active } = req.body;
//   db.prepare('UPDATE goal_categories SET name=?,description=?,weight=?,color=?,text_color=?,sort_order=?,is_active=? WHERE id=?')
//     .run(name, description, weight, color, text_color, sort_order, is_active??1, req.params.id);
//   res.json({ success: true });
// });

// [PROMPT_36-6] Repository Pattern 적용
app.put('/api/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    await goalCategoryRepo.update(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    console.error('[PUT /api/categories/:id]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// [PROMPT_36-6] Repository Pattern 전환 — 기존 코드 주석 처리
// app.delete('/api/categories/:id', auth, masterOnly, (req, res) => {
//   db.prepare('UPDATE goal_categories SET is_active=0 WHERE id=?').run(req.params.id);
//   res.json({ success: true });
// });

// [PROMPT_36-6] Repository Pattern 적용
app.delete('/api/categories/:id', auth, masterOnly, async (req, res) => {
  try {
    await goalCategoryRepo.deactivate(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/categories/:id]', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════
//  EVAL CYCLES & GOALS
// ════════════════════════════════════════════════════════════
// [PROMPT_40-A] Repository Pattern 적용
app.get('/api/evals', auth, async (req, res) => {
  try {
    const isAdmin = ['master','admin'].includes(req.user.role);
    const scope = isAdmin ? 'all' : 'mine';
    const rows = await evalCycleRepo.findList({ userId: req.user.sub, scope });

    // 권한별 마스킹: 관리자/본인/승인자 체인이 아닌 경우 암호화 필드 null 처리
    for (const r of rows) {
      const isOwner    = String(r.user_id) === String(req.user.sub);
      const isApprover = isOwner ? false : await userRepo.isInApproverChain(req.user.sub, r.user_id);
      if (!isAdmin && !isOwner && !isApprover) {
        r.self_reason   = null;
        r.reject_reason = null;
      }
    }
    res.json(rows);
  } catch(err) {
    console.error('[GET /api/evals]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT_40-A] Repository Pattern 적용
app.post('/api/evals', auth, async (req, res) => {
  try {
    const { period_type, period_label, eval_year } = req.body;
    const safePeriodType  = period_type  || 'q';
    const safePeriodLabel = period_label || (eval_year || '2025년') + ' 1분기';
    const safeYear        = eval_year    || '2025년';

    const existing = await evalCycleRepo.findDraftByUserId(req.user.sub);
    if (existing) return res.json({ id: existing.id });

    const newId = await evalCycleRepo.create({
      user_id: req.user.sub, period_type: safePeriodType,
      period_label: safePeriodLabel, eval_year: safeYear,
    });
    res.json({ id: newId });
  } catch(err) {
    console.error('[POST /api/evals]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT 41] Repository Pattern 적용
app.get('/api/evals/:id/goals', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: '없음' });

    const isAdmin = ['master','admin'].includes(req.user.role);
    const isOwner = String(ev.user_id) === String(req.user.sub);
    const isApprover = isOwner ? false : await userRepo.isInApproverChain(req.user.sub, ev.user_id);
    const canSee = isAdmin || isOwner || isApprover;
    if (!canSee) return res.status(403).json({ error: '권한 없음' });

    const goals = await goalRepo.findByEvalId(req.params.id);
    const canDecrypt = isAdmin || isOwner || isApprover;

    if (!canDecrypt) {
      goals.forEach(g => { g.name = '***'; g.kpi = '***'; });
    }

    res.json(goals);
  } catch(err) {
    console.error('[GET /api/evals/:id/goals]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT 41] Repository Pattern 적용
app.post('/api/evals/:id/goals', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(409).json({ error: '승인된 평가는 수정할 수 없습니다.' });

    const { goals, self_reason } = req.body;

    await goalRepo.replaceByEvalId(req.params.id, goals || []);

    if (self_reason !== undefined) {
      await evalCycleRepo.updatePhaseAndReason(req.params.id, {
        phase: ev.phase,
        self_reason: self_reason
      });
    }

    res.json({ success: true });
  } catch(err) {
    console.error('[POST /api/evals/:id/goals]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT_40-A] Repository Pattern 적용
app.patch('/api/evals/:id/reopen', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (ev.phase !== 'rejected')
      return res.json({ success: true });

    await evalCycleRepo.reopen(ev.id);
    await goalRepo.updateStatusByEvalId(ev.id, 'draft');
    res.json({ success: true });
  } catch(err) {
    console.error('[reopen]', err);
    res.status(500).json({ error: err.message });
  }
});

async function validateEvalGoals(evalId) {
  const goals = await goalRepo.findByEvalId(evalId);
  if (!goals || goals.length === 0)
    return { valid: false, error: '최소 1개 이상의 목표를 입력해주세요.' };

  // 활성 카테고리 조회
  const activeCats = db.prepare(
    'SELECT id, name, weight FROM goal_categories WHERE is_active=1 ORDER BY id'
  ).all();
  if (activeCats.length === 0)
    return { valid: false, error: '활성 카테고리가 없습니다.' };

  // 카테고리별 그룹화
  const goalsByCat = new Map();
  for (const g of goals) {
    if (!g.category_id)
      return { valid: false, error: `목표 "${g.name || '(이름 없음)'}"에 카테고리가 지정되지 않았습니다.` };
    if (!goalsByCat.has(g.category_id)) goalsByCat.set(g.category_id, []);
    goalsByCat.get(g.category_id).push(g);
  }

  // 활성 카테고리별 검증: 최소 1개 + 카테고리 내 가중치 합 = 100
  for (const cat of activeCats) {
    const catGoals = goalsByCat.get(cat.id) || [];
    if (catGoals.length === 0)
      return { valid: false, error: `"${cat.name}" 카테고리에 최소 1개의 목표를 입력해야 합니다.` };
    const catSum = catGoals.reduce((a, g) => a + (Number(g.weight) || 0), 0);
    if (Math.abs(catSum - 100) > 0.01)
      return { valid: false, error: `"${cat.name}" 카테고리의 가중치 합이 100이 되어야 합니다. (현재: ${catSum.toFixed(2)})` };
  }

  // name 필수, weight > 0
  for (const g of goals) {
    const name = decrypt(g.name || '');
    if (!name || name.trim().length === 0)
      return { valid: false, error: '목표 이름이 비어 있는 항목이 있습니다.' };
    if (!(Number(g.weight) > 0))
      return { valid: false, error: `목표 "${g.name}"의 가중치가 0 또는 음수입니다.` };
  }
  return { valid: true };
}

// 공식: Σ(카테고리 가중치/100 × Σ(목표 점수/5×100 × 카테고리 내 weight/100))
function calcFinalScore(evalId, scoreField = 'mgr_score') {
  const valid = ['mgr_score', 'self_score', 'second_mgr_score'];
  if (!valid.includes(scoreField)) throw new Error(`Invalid scoreField: ${scoreField}`);
  const rows = db.prepare(
    `SELECT g.weight, g.category_id, fes.${scoreField} AS score
     FROM goals g
     JOIN final_eval_scores fes ON fes.goal_id = g.id
     WHERE g.eval_id = ? AND fes.${scoreField} IS NOT NULL`
  ).all(evalId);
  if (rows.length === 0) return null;

  const catWeightMap = new Map(
    db.prepare('SELECT id, weight FROM goal_categories WHERE is_active=1').all()
      .map(c => [c.id, Number(c.weight) || 0])
  );

  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category_id)) byCat.set(r.category_id, []);
    byCat.get(r.category_id).push(r);
  }

  let finalScore = 0, usedCatW = 0;
  for (const [catId, catGoals] of byCat) {
    const catW = catWeightMap.get(catId);
    if (!catW) continue;
    const totalInnerW = catGoals.reduce((a, g) => a + (Number(g.weight) || 0), 0) || 1;
    const catScore = catGoals.reduce(
      (a, g) => a + (Number(g.score) / 5 * 100) * (Number(g.weight) / totalInnerW), 0
    );
    finalScore += catScore * (catW / 100);
    usedCatW += catW;
  }
  if (usedCatW > 0 && usedCatW < 100) finalScore = finalScore * (100 / usedCatW);
  return Math.round(finalScore * 100) / 100;
}

// [PROMPT_40-A] Repository Pattern 적용
app.post('/api/evals/:id/submit', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.id);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (!['draft'].includes(ev.phase))
      return res.status(409).json({ error: '제출 불가 상태: ' + ev.phase });

    const validation = await validateEvalGoals(req.params.id);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const { self_reason } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await evalCycleRepo.updatePhaseAndReason(req.params.id, {
      phase: 'pending', self_reason: self_reason || '', submitted_at: now,
    });
    await goalRepo.updateStatusByEvalId(req.params.id, 'pending');

    const targetUser = await userRepo.findById(req.user.sub); // [INFRA-A3]
    auditLog(req.user.sub, 'GOAL_SUBMITTED', ev.id, targetUser?.name,
      `목표 승인 요청 제출 (${ev.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[submit]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  APPROVALS (목표 승인) [INFRA-A4: approvalRepo async 전환]
// 내 목표 승인 이력 전체 (반려 포함)
app.get('/api/evals/my-history', auth, async (req, res) => {
  try {
    const evs = await evalCycleRepo.findAllByUser(req.user.sub);

    const result = await Promise.all(evs.map(async ev => {
      const goals     = await goalRepo.findByEvalId(ev.id);
      const approvals = await approvalRepo.findByEvalId(ev.id);
      return {
        ...ev,
        goals:    goals.map(g => ({ ...g, name: g.name || '', kpi: g.kpi || '' })),
        approvals,
      };
    }));
    res.json(result);
  } catch(err) {
    console.error('[evals/my-history]', err);
    res.status(500).json({ error: err.message });
  }
});

// 내가 승인한 이력 목록 [INFRA-A4: approvalRepo async 전환]
app.get('/api/approvals/my-history', auth, async (req, res) => {
  try {
    const { period_label, eval_year } = req.query;
    const rows = await approvalRepo.findHistoryByApprover(req.user.sub, { periodLabel: period_label, evalYear: eval_year });

    const enriched = await Promise.all(rows.map(async r => {
      const fe    = await finalEvalRepo.findByEvalId(r.eval_id);
      const goals = await goalRepo.findByEvalId(r.eval_id);
      let finalData = null;
      if (fe) {
        const [secondMgr, mgrUser] = await Promise.all([
          fe.second_mgr_id    ? userRepo.findById(fe.second_mgr_id)    : null,
          fe.mgr_approver_id  ? userRepo.findById(fe.mgr_approver_id)  : null,
        ]);
        finalData = {
          self_done:         fe.self_done,
          mgr_done:          fe.mgr_done,
          mgr_approver_name: mgrUser?.name || '',
          second_mgr_done:   fe.second_mgr_done,
          second_mgr_name:   secondMgr?.name || '',
          second_mgr_note:   fe.second_mgr_note,
          final_score:       fe.final_score,
          final_grade:       fe.final_grade,
          selected_grade:    fe.selected_grade,
          mgr_note:          fe.mgr_note,
          scores:            fe.scores || [],
        };
      }
      return { ...r, goals, final_eval: finalData };
    }));
    res.json(enriched);
  } catch(err) {
    console.error('[my-history]', err);
    res.status(500).json({ error: err.message });
  }
});

// 승인 의견 수정 [INFRA-A4]
app.patch('/api/approvals/:approvalId', auth, async (req, res) => {
  try {
    const editAllowed = getSetting('approval_edit', '0') === '1';
    if (!editAllowed) return res.status(403).json({ error: '승인 수정이 허용되지 않은 상태입니다.' });
    const appr = await approvalRepo.findById(req.params.approvalId);
    if (!appr) return res.status(404).json({ error: '없음' });
    if (String(appr.approver_id) !== String(req.user.sub) && !['master','admin'].includes(req.user.role))
      return res.status(403).json({ error: '본인 승인만 수정 가능합니다.' });
    const { note } = req.body;
    await approvalRepo.updateNote(req.params.approvalId, note || '');
    const ev = await evalCycleRepo.findById(appr.eval_id);
    auditLog(req.user.sub, 'APPROVAL_EDITED', ev?.user_id, null,
      `${appr.level}차 승인 의견 수정 (${ev?.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 승인 취소 [INFRA-A4]
app.delete('/api/approvals/:approvalId', auth, async (req, res) => {
  try {
    const editAllowed = getSetting('approval_edit', '0') === '1';
    if (!editAllowed)
      return res.status(403).json({ error: '승인 취소가 허용되지 않은 상태입니다.' });
    // [INFRA-A4] DELETE approval → approvalRepo
    const appr = await approvalRepo.findById(req.params.approvalId);
    if (!appr) return res.status(404).json({ error: '없음' });
    if (String(appr.approver_id) !== String(req.user.sub) && !['master','admin'].includes(req.user.role))
      return res.status(403).json({ error: '본인 승인만 취소 가능합니다.' });
    const ev = await evalCycleRepo.findById(appr.eval_id);
    await approvalRepo.deleteById(req.params.approvalId);
    await evalCycleRepo.setToPending(appr.eval_id);
    await goalRepo.updateStatusByEvalId(appr.eval_id, 'pending');
    const targetUser = await userRepo.findById(ev?.user_id);
    auditLog(req.user.sub, 'APPROVAL_CANCELLED', ev?.user_id, targetUser?.name,
      `${appr.level}차 승인 취소 (${ev?.period_label||''})`, req.ip);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/approvals/pending', auth, async (req, res) => {
  try {
    // 내가 다음 승인자인 평가 목록 [INFRA-A4]
    const allPending = await evalCycleRepo.findPendingWithUser();
    const myPending = [];
    for (const ev of allPending) {
      if (await isNextApproverAsync(req.user.sub, ev.user_id, ev.id)) {
        // 복호화는 EvalCycleRepo _flatten이 처리
        myPending.push(ev);
      }
    }
    res.json(myPending);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// [INFRA-A4] isNextApprover → async, userRepo.findById 경유
async function isNextApproverAsync(approverId, targetUserId, evalId) {
  const chain = await getApproverChainAsync(targetUserId);
  const myLevel = chain.indexOf(String(approverId)) + 1;
  if (!myLevel) return false;
  const done = await approvalRepo.findByEvalIdAndLevel(evalId, myLevel);
  return !done;
}

async function getApproverChainAsync(userId) {
  const chain = [];
  let cur = await userRepo.findById(String(userId));
  while (cur?.manager_id && chain.length < 5) {
    chain.push(String(cur.manager_id));
    cur = await userRepo.findById(String(cur.manager_id));
  }
  return chain;
}

app.post('/api/approvals/:evalId/approve', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || ev.phase !== 'pending') return res.status(400).json({ error: '승인 불가 상태' });
    if (!await isNextApproverAsync(req.user.sub, ev.user_id, ev.id)) return res.status(403).json({ error: '승인 권한 없음' });

    const validation = await validateEvalGoals(req.params.evalId);
    if (!validation.valid)
      return res.status(400).json({ error: `목표 검증 실패: ${validation.error} 평가자에게 목표 수정을 요청하세요.` });

    const { note } = req.body;
    const chain    = await getApproverChainAsync(ev.user_id);
    const myLevel  = chain.indexOf(String(req.user.sub)) + 1;
    if (!myLevel) return res.status(403).json({ error: '승인 권한 없음' });

    await approvalRepo.create({ eval_id: ev.id, approver_id: req.user.sub, level: myLevel, action: 'approved', note: note || '' });

    const doneCount    = await approvalRepo.countApprovedByEval(ev.id);
    const finalApproved = doneCount >= chain.length;

    if (finalApproved) {
      await evalCycleRepo.setApproved(ev.id);
      await goalRepo.updateStatusByEvalId(ev.id, 'approved');
    }
    const [targetUser2, approverUser] = await Promise.all([
      userRepo.findById(ev.user_id),
      userRepo.findById(req.user.sub),
    ]);
    const actionLabel = finalApproved ? 'GOAL_FINAL_APPROVED' : 'GOAL_APPROVED';
    const detail      = finalApproved
      ? `${myLevel}차 최종 승인 완료 — 목표 확정 (${ev.period_label||''})`
      : `${myLevel}차 승인 완료 (${ev.period_label||''})`;
    auditLog(req.user.sub, actionLabel, ev.user_id, targetUser2?.name, detail, req.ip);
    res.json({ success: true, finalApproved });
  } catch(err) {
    console.error('[approve]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/approvals/:evalId/reject', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || ev.phase !== 'pending') return res.status(400).json({ error: '반려 불가 상태' });
    if (!await isNextApproverAsync(req.user.sub, ev.user_id, ev.id)) return res.status(403).json({ error: '권한 없음' });
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: '반려 사유 필수' });
    const chain   = await getApproverChainAsync(ev.user_id);
    const myLevel = chain.indexOf(String(req.user.sub)) + 1;

    await approvalRepo.create({ eval_id: ev.id, approver_id: req.user.sub, level: myLevel, action: 'rejected', note });
    await evalCycleRepo.setRejected(ev.id, note);
    await approvalRepo.deleteByEvalId(ev.id);
    await goalRepo.updateStatusByEvalId(ev.id, 'draft');
    const targetUser3 = await userRepo.findById(ev.user_id);
    auditLog(req.user.sub, 'GOAL_REJECTED', ev.user_id, targetUser3?.name,
      `목표 반려 (${ev.period_label||''}) — 사유: ${note}`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[reject]', err);
    res.status(500).json({ error: err.message });
  }
});

// [INFRA-A4] getApproverChain legacy sync 제거 — getApproverChainAsync 사용

app.get('/api/approvals/:evalId/history', auth, async (req, res) => {
  try {
    const rows = await approvalRepo.findByEvalIdOrdered(req.params.evalId);
    const isAdmin = ['master','admin'].includes(req.user.role);
    if (!isAdmin) rows.forEach(r => { r.note = null; });
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
//  FEEDBACK (중간 피드백)
// ════════════════════════════════════════════════════════════
// [PROMPT 43] Repository Pattern 적용
app.get('/api/feedback/:evalId', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '없음' });

    const isAdmin = ['master','admin'].includes(req.user.role);
    const isOwner = String(ev.user_id) === String(req.user.sub);

    const fbs = await feedbackRepo.findByEvalId(req.params.evalId);

    fbs.forEach(fb => {
      const isAuthor = String(fb.author_id) === String(req.user.sub);
      if (!isAdmin && !isOwner && !isAuthor) {
        fb.overall_note = null;
      }
      fb.items.forEach(it => {
        if (!isAdmin && !isOwner) {
          it.note = null;
          it.goal_name = '***';
        }
      });
    });

    res.json(fbs);
  } catch(err) {
    console.error('[GET /api/feedback/:evalId]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT 43] Repository Pattern 적용
app.post('/api/feedback/:evalId', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || !['approved','final_self','final_mgr_pending'].includes(ev.phase))
      return res.status(400).json({ error: '승인된 평가에만 피드백 가능' });

    // 64A: 피드백 회차 제한 강제 [INFRA-A3: feedbackRepo.countByAuthor]
    const feedbackLimit = parseInt(getSetting('feedback_limit', '0'));
    if (feedbackLimit > 0) {
      const currentCount = await feedbackRepo.countByAuthor(req.params.evalId, req.user.sub);
      if (currentCount >= feedbackLimit) {
        return res.status(400).json({
          error: `피드백 가능 횟수를 초과했습니다. (제한: ${feedbackLimit}회, 현재: ${currentCount}회)`
        });
      }
    }

    const { overall_note, items } = req.body;
    const newId = await feedbackRepo.create({
      eval_id: req.params.evalId,
      author_id: req.user.sub,
      overall_note: overall_note || '',
      items: items || []
    });

    auditLog(req.user.sub, 'FEEDBACK_SUBMITTED', ev.user_id, ev.user_name,
      `중간 피드백 제출 (평가ID: ${req.params.evalId})`, req.ip);

    res.json({ id: newId });
  } catch(err) {
    console.error('[POST /api/feedback/:evalId]', err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  FINAL EVALUATION (최종 평가)
// ════════════════════════════════════════════════════════════
// [PROMPT 44] Repository Pattern 적용
app.get('/api/final/:evalId', auth, async (req, res) => {
  try {
    const fe = await finalEvalRepo.findByEvalId(req.params.evalId);
    if (!fe) return res.json(null);

    const isAdmin = ['master','admin'].includes(req.user.role);
    const ev2 = await evalCycleRepo.findById(req.params.evalId);
    const isOwner = ev2 && String(ev2.user_id) === String(req.user.sub);
    const isChainApprover = ev2 ? await userRepo.isInApproverChain(req.user.sub, ev2.user_id) : false;
    const canRead = isAdmin || isOwner || isChainApprover;

    if (!canRead) {
      fe.self_note = null;
      fe.mgr_note = null;
      fe.second_mgr_note = null;
    }

    res.json(fe);
  } catch(err) {
    console.error('[GET /api/final/:evalId]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT 44] Repository Pattern 적용
app.post('/api/final/:evalId/self', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '권한 없음' });
    if (!['approved','final_self'].includes(ev.phase))
      return res.status(400).json({ error: '자기평가 불가 상태' });

    const existFe = await finalEvalRepo.findByEvalId(ev.id);
    if (existFe?.self_done === 1)
      return res.status(400).json({ error: '이미 제출된 자기평가는 수정할 수 없습니다.' });

    const { self_note, scores } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const feId = await finalEvalRepo.upsert(ev.id, {
      self_note: self_note || '',
      self_done: 1,
      self_done_at: now
    });

    if (scores && scores.length) {
      await finalEvalRepo.upsertScores(feId, scores, 'selfScore');
    }

    await evalCycleRepo.updatePhaseAndLocked(ev.id, 'final_mgr_pending', 0); // [INFRA-A3]

    res.json({ success: true });
  } catch(err) {
    console.error('[final self]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT 44] Repository Pattern 적용
app.post('/api/final/:evalId/mgr', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev || !['final_mgr_pending','final_mgr2_pending'].includes(ev.phase))
      return res.status(400).json({ error: '상사 평가 불가 상태' });

    const targetUser = await userRepo.findById(ev.user_id); // [INFRA-A3]
    const isAdmin    = ['master','admin'].includes(req.user.role);
    const isDirect   = String(targetUser?.manager_id) === String(req.user.sub);

    const secondEnabled = getSetting('second_final', '0') === '1';
    let isSecond = false;
    if (secondEnabled) {
      const directMgr = targetUser?.manager_id
        ? await userRepo.findById(String(targetUser.manager_id))
        : null;
      isSecond = String(directMgr?.manager_id) === String(req.user.sub);
    }

    if (!isDirect && !isSecond && !isAdmin) {
      return res.status(403).json({ error: '평가 권한 없음' });
    }

    console.log('[최종평가제출]', {
      evalId: req.params.evalId, userId: req.user.sub,
      isDirect, isSecond, isAdmin, phase: ev.phase
    });

    let fe = await finalEvalRepo.findByEvalId(ev.id);
    if (!fe) {
      const newId = await finalEvalRepo.upsert(ev.id, {});
      fe = { id: newId, mgr_done: 0 };
    }

    const { mgr_note, scores, selected_grade: _clientGrade } = req.body;
    if (_clientGrade) {
      console.warn(`[63D-FIX] Client sent selected_grade=${_clientGrade} for evalId=${req.params.evalId} — ignored (무결성 원칙)`);
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (isSecond) {
      // ── 2차 평가자 제출 ──────────────────────────────────
      if (!fe.mgr_done) return res.status(400).json({ error: '1차 평가자가 먼저 평가를 완료해야 합니다.' });

      await finalEvalRepo.upsertScores(fe.id, scores, 'secondMgrScore');

      await finalEvalRepo.upsert(ev.id, {
        second_mgr_note: mgr_note || '',
        second_mgr_done: 1,
        second_mgr_done_at: now,
        second_mgr_id: req.user.sub,
        selected_grade: fe.final_grade,
        second_selected_grade: '',
        locked: 1,
        locked_at: now
      });

      await evalCycleRepo.updatePhaseAndLocked(ev.id, 'final_done', 1); // [INFRA-A3]

      const t2 = await userRepo.findById(ev.user_id);
      auditLog(req.user.sub, 'FINAL_EVAL_2ND', ev.user_id, t2?.name,
        `2차 최종평가 완료 (${ev.period_label||''})`, req.ip);
      res.json({ success: true, is_second: true });

    } else {
      // ── 1차 평가자 제출 ──────────────────────────────────
      await finalEvalRepo.upsertScores(fe.id, scores, 'mgrScore');

      // 최종 점수 계산 (카테고리 가중치 기반 — PROMPT 61A)
      const rawScore = calcFinalScore(ev.id, 'mgr_score');
      if (rawScore === null) {
        return res.status(400).json({ error: '관리자 점수가 입력되지 않았습니다.' });
      }
      const finalScore = Math.round(rawScore * 10) / 10;
      const evalPolicy = await getPolicyForEval(ev.id);
      const grade = scoreToGrade(finalScore, evalPolicy?.criteria || []);
      if (!grade) {
        return res.status(400).json({ error: '등급 산출 실패: 평가 기간에 등급 정책이 바인딩되지 않았거나 점수가 정책 범위 밖입니다.' });
      }
      const finalGradeCode = grade; // 자동 산출 강제 (63D-FIX — 클라이언트 override 차단)

      await finalEvalRepo.upsert(ev.id, {
        mgr_note: mgr_note || '',
        mgr_done: 1,
        mgr_done_at: now,
        mgr_approver_id: req.user.sub,
        final_score: finalScore,
        final_grade: finalGradeCode,
        selected_grade: grade
      });

      if (secondEnabled) { // [INFRA-A3]
        const directMgrUser = targetUser?.manager_id
          ? await userRepo.findById(String(targetUser.manager_id))
          : null;
        if (directMgrUser?.manager_id) {
          await evalCycleRepo.updatePhaseAndLocked(ev.id, 'final_mgr2_pending', 0);
        } else {
          await evalCycleRepo.updatePhaseAndLocked(ev.id, 'final_done', 1);
          await finalEvalRepo.upsert(ev.id, { locked: 1, locked_at: now });
        }
      } else {
        await evalCycleRepo.updatePhaseAndLocked(ev.id, 'final_done', 1);
        await finalEvalRepo.upsert(ev.id, { locked: 1, locked_at: now });
      }

      const t1 = await userRepo.findById(ev.user_id);
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
// [INFRA-A6] eval-periods 도메인 전체 → evalPeriodRepo async 전환
app.get('/api/eval-periods', auth, async (req, res) => {
  try {
    const yearFrom = req.query.year_from ? parseInt(req.query.year_from) : null;
    const yearTo   = req.query.year_to   ? parseInt(req.query.year_to)   : null;
    if (yearFrom !== null && yearTo !== null) {
      if (yearTo - yearFrom > 9) return res.status(400).json({ error: '최대 10년 범위까지 조회 가능합니다.' });
      if (yearTo < yearFrom)     return res.status(400).json({ error: '종료 연도는 시작 연도보다 같거나 커야 합니다.' });
    }
    const includeInactive = String(req.query.include_inactive) === 'true';
    const periods = await evalPeriodRepo.findAll({ yearFrom, yearTo, includeInactive });
    res.set('X-Periods-Year-From', yearFrom ?? '');
    res.set('X-Periods-Year-To',   yearTo   ?? '');
    res.set('X-Periods-Total',     periods.length);
    res.json(periods);
  } catch(err) { res.json([]); }
});

app.get('/api/eval-periods/active', auth, async (req, res) => {
  try {
    res.json(await evalPeriodRepo.findActive());
  } catch(err) { res.json([]); }
});

app.get('/api/eval-periods/available-years', auth, async (req, res) => {
  try {
    const includeInactive = String(req.query.include_inactive) === 'true';
    const isAdmin = ['master', 'admin'].includes(req.user?.role);
    const effective = isAdmin && includeInactive;
    const evalYears = await evalPeriodRepo.findAvailableYears({ includeInactive: effective });
    const years = evalYears.map(y => { const m = String(y).match(/(\d{4})/); return m ? parseInt(m[1]) : null; }).filter(Boolean);
    res.json({ years });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/eval-periods/missing-policy', auth, adminOnly, async (req, res) => {
  try {
    const periods = await evalPeriodRepo.findMissingPolicy();
    res.json({ count: periods.length, periods });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/eval-periods', auth, adminOnly, async (req, res) => {
  try {
    const { period_type, period_label, eval_year, is_active, grade_policy_id } = req.body;
    if (!period_type || !period_label || !eval_year)
      return res.status(400).json({ error: '필수 항목 누락' });
    if (!grade_policy_id)
      return res.status(400).json({ error: '등급의 100점환산 기준이 저장되지 않았습니다. 적용해 주세요.' });
    if (!await evalPeriodRepo.validateGradePolicy(grade_policy_id))
      return res.status(400).json({ error: '유효하지 않은 등급 정책입니다.' });
    if (await evalPeriodRepo.findByLabelAndYear(period_label, eval_year))
      return res.status(409).json({ error: '이미 존재하는 기간입니다.' });
    const id = await evalPeriodRepo.create({ period_type, period_label, eval_year, is_active, created_by: req.user.sub, grade_policy_id });
    res.json({ id });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/eval-periods/:id', auth, adminOnly, async (req, res) => {
  try {
    const target = await evalPeriodRepo.findById(req.params.id);
    if (!target) return res.status(404).json({ error: '없음' });
    const { grade_policy_id } = req.body;
    if (grade_policy_id === undefined) return res.status(400).json({ error: '수정할 필드가 없습니다.' });
    if (grade_policy_id !== null && grade_policy_id !== '') {
      if (!await evalPeriodRepo.validateGradePolicy(grade_policy_id))
        return res.status(400).json({ error: '유효하지 않은 grade_policy_id' });
    }
    await evalPeriodRepo.update(req.params.id, { grade_policy_id });
    auditLog(req.user.sub, 'EVAL_PERIOD_UPDATED', req.params.id, target.period_label, JSON.stringify(req.body), req.ip);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/eval-periods/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const result = await evalPeriodRepo.toggle(req.params.id);
    if (!result) return res.status(404).json({ error: '없음' });
    if (result.blocked) {
      auditLog(req.user.sub, 'EVAL_PERIOD_ACTIVATION_BLOCKED', req.params.id, null, 'grade_policy_id is NULL', req.ip);
      return res.status(400).json({ error: '등급의 100점환산 기준이 저장되지 않았습니다. 적용해 주세요.' });
    }
    res.json({ success: true, is_active: result.is_active });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/eval-periods/:id', auth, masterOnly, async (req, res) => {
  try {
    const p = await evalPeriodRepo.findById(req.params.id);
    if (!p) return res.status(404).json({ error: '없음' });
    if (await evalPeriodRepo.checkInUse(p.period_label, p.eval_year))
      return res.status(409).json({ error: '이미 사용 중인 기간은 삭제할 수 없습니다.' });
    await evalPeriodRepo.deleteModes(req.params.id);
    await evalPeriodRepo.delete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/eval-periods/:id/eval-mode', auth, adminOnly, async (req, res) => {
  try {
    const period = await evalPeriodRepo.findById(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    res.json({ eval_mode: period.eval_mode || 'MBO', locked: period.locked });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/eval-periods/:id/eval-mode', auth, adminOnly, async (req, res) => {
  try {
    const { eval_mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(eval_mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const period = await evalPeriodRepo.findById(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    if (period.locked && req.user.role !== 'master')
      return res.status(400).json({ error: '잠긴 평가 기간의 방식은 변경할 수 없습니다.' });
    await evalPeriodRepo.setEvalMode(req.params.id, eval_mode);
    auditLog(req.user.sub, 'PERIOD_EVAL_MODE_CHANGED', req.params.id, period.period_label, `평가기간 방식 변경: ${eval_mode}`, req.ip);
    const warning = period.locked ? '⚠ 잠긴 기간을 강제 변경했습니다.' : null;
    res.json({ success: true, warning });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/eval-periods/:id/org-modes', auth, adminOnly, async (req, res) => {
  try {
    res.json(await evalPeriodRepo.findOrgModes(req.params.id));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/eval-periods/:id/org-modes', auth, adminOnly, async (req, res) => {
  try {
    const { manager_id, eval_mode } = req.body;
    if (!['MBO','OKR','KPI'].includes(eval_mode))
      return res.status(400).json({ error: '지원하지 않는 평가 방식입니다.' });
    const period = await evalPeriodRepo.findById(req.params.id);
    if (!period) return res.status(404).json({ error: '기간을 찾을 수 없습니다.' });
    const existing = await evalPeriodRepo.getOrgModeForManager(req.params.id, manager_id);
    if (existing?.locked && req.user.role !== 'master')
      return res.status(400).json({ error: '잠긴 조직의 방식은 변경할 수 없습니다.' });
    await evalPeriodRepo.setOrgMode(req.params.id, manager_id, eval_mode);
    const mgr = await userRepo.findById(manager_id);
    auditLog(req.user.sub, 'ORG_EVAL_MODE_CHANGED', manager_id, mgr?.name, `조직 평가방식 변경 (${period.period_label}): ${eval_mode}`, req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/eval-periods/:id/lock', auth, adminOnly, async (req, res) => {
  try {
    await evalPeriodRepo.lockOrgMode(req.params.id);
    const period = await evalPeriodRepo.findById(req.params.id);
    auditLog(req.user.sub, 'PERIOD_LOCKED', req.params.id, period?.period_label, '평가기간 방식 잠금', req.ip);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 중간 보고 API ────────────────────────────────────────

// [PROMPT_45] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/reports/:evalId', auth, (req, res) => {
//   try {
//     const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
//     if (!ev) return res.status(404).json({ error: '없음' });
//     const isAdmin   = ['master','admin'].includes(req.user.role);
//     const isOwner   = String(ev.user_id) === String(req.user.sub);
//     const chain = [];
//     let cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev.user_id));
//     while (cur?.manager_id && chain.length < 5) {
//       chain.push(String(cur.manager_id));
//       cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(cur.manager_id));
//     }
//     const isApprover = chain.includes(String(req.user.sub));
//     if (!isAdmin && !isOwner && !isApprover)
//       return res.status(403).json({ error: '권한 없음' });
//     const reports = db.prepare(
//       'SELECT r.*, u.name as author_name FROM progress_reports r JOIN users u ON r.author_id=u.id WHERE r.eval_id=? ORDER BY r.created_at DESC'
//     ).all(req.params.evalId).map(r => ({
//       ...r,
//       content: r.content ? decrypt(r.content) : '',
//       files: db.prepare('SELECT id,file_name,file_type,file_size,created_at FROM report_files WHERE report_id=?').all(r.id),
//     }));
//     res.json(reports);
//   } catch(err) {
//     console.error('[reports GET]', err);
//     res.status(500).json({ error: err.message });
//   }
// });

// [INFRA-A6] GET /api/reports/:evalId → evalCycleRepo + userRepo + $queryRawUnsafe (enc _flatten)
app.get('/api/reports/:evalId', auth, async (req, res) => {
  try {
    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '없음' });
    const isAdmin = ['master','admin'].includes(req.user.role);
    const isOwner = String(ev.user_id) === String(req.user.sub);
    const isApprover = isOwner ? false : await userRepo.isInApproverChain(req.user.sub, ev.user_id);
    if (!isAdmin && !isOwner && !isApprover)
      return res.status(403).json({ error: '권한 없음' });

    const rows = await progressReportRepo.findByEvalIdFull(req.params.evalId);
    res.json(rows);
  } catch(err) {
    console.error('[reports GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT_45] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.post('/api/reports/:evalId', auth, (req, res) => {
//   try {
//     const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
//     if (!ev || String(ev.user_id) !== String(req.user.sub))
//       return res.status(403).json({ error: '본인만 작성 가능' });
//     if (!['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
//       return res.status(400).json({ error: '목표 확정 후 작성 가능합니다.' });
//     const { content, files } = req.body;
//     const r = db.prepare(
//       "INSERT INTO progress_reports(eval_id,author_id,content,created_at) VALUES(?,?,?,datetime('now'))"
//     ).run(req.params.evalId, req.user.sub, encrypt(content || ''));
//     (files || []).forEach(f => {
//       db.prepare(
//         'INSERT INTO report_files(report_id,file_name,file_data,file_type,file_size) VALUES(?,?,?,?,?)'
//       ).run(r.lastInsertRowid, f.name, f.data, f.type, f.size);
//     });
//     auditLog(req.user.sub, 'REPORT_SUBMITTED', ev.user_id, null,
//       `중간 보고 작성 (${ev.period_label||''})`, req.ip);
//     res.json({ id: r.lastInsertRowid });
//   } catch(err) {
//     console.error('[reports POST]', err);
//     res.status(500).json({ error: err.message });
//   }
// });

// [INFRA-A5] 목표별 보고 + 회차 제한 — progressReportRepo.createMulti (tx 캡슐화, enc _flatten)
app.post('/api/reports/:evalId', auth, async (req, res) => {
  try {
    const evalId = req.params.evalId;
    const ev = await evalCycleRepo.findById(evalId);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '본인만 작성 가능' });
    if (!['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(400).json({ error: '목표 확정 후 작성 가능합니다.' });

    // 회차 제한 확인
    const feedbackLimit = parseInt(getSetting('feedback_limit', '0'));
    const currentRound = await progressReportRepo.getMaxRound(evalId, req.user.sub);
    if (feedbackLimit > 0 && currentRound >= feedbackLimit) {
      return res.status(400).json({
        error: `보고 가능 횟수를 초과했습니다. (제한: ${feedbackLimit}회, 현재: ${currentRound}회)`
      });
    }
    const newRound = currentRound + 1;

    const { content, items, overall, files } = req.body;
    const result = await progressReportRepo.createMulti({
      eval_id:   evalId,
      author_id: req.user.sub,
      items,
      overall:   overall || ((!Array.isArray(items) && content) ? content : ''),
      round:     newRound,
      files:     Array.isArray(files) ? files : [],
    });
    auditLog(req.user.sub, 'REPORT_SUBMITTED', ev.user_id, null,
      `중간 보고 작성 (${ev.period_label||''}) round=${newRound}`, req.ip);
    res.json({ ok: true, round: result.round, count: result.insertedIds.length });
  } catch(err) {
    console.error('[reports POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT_45] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/files/:fileId', auth, (req, res) => {
//   try {
//     const f = db.prepare('SELECT * FROM report_files WHERE id=?').get(req.params.fileId);
//     if (!f) return res.status(404).json({ error: '파일 없음' });
//     res.json({ file_name: f.file_name, file_data: f.file_data, file_type: f.file_type });
//   } catch(err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// [PROMPT_45] Repository Pattern 적용
app.get('/api/files/:fileId', auth, async (req, res) => {
  try {
    const f = await progressReportRepo.findFileById(req.params.fileId);
    if (!f) return res.status(404).json({ error: '파일 없음' });
    res.json(f);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT_44-B] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, (req, res) => {
//   try {
//     const { phase } = req.body;
//     const validPhases = ['draft','pending','approved','rejected',
//                          'final_self','final_mgr_pending','final_mgr2_pending','final_done'];
//     if (!validPhases.includes(phase))
//       return res.status(400).json({ error: '유효하지 않은 phase입니다.' });
//     const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
//     if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });
//     const locked = phase === 'final_done' ? 1 : 0;
//     db.prepare("UPDATE eval_cycles SET phase=?, locked=?, updated_at=datetime('now') WHERE id=?")
//       .run(phase, locked, req.params.evalId);
//     if (phase === 'final_done') {
//       db.prepare("UPDATE final_evaluations SET locked=1, locked_at=datetime('now') WHERE eval_id=?")
//         .run(req.params.evalId);
//     }
//     const target = db.prepare('SELECT u.name FROM eval_cycles e JOIN users u ON e.user_id=u.id WHERE e.id=?').get(req.params.evalId);
//     auditLog(req.user.sub, 'FORCE_PHASE_CHANGE', req.params.evalId, target?.name,
//       `평가 단계 강제 변경: ${ev.phase} → ${phase}`, req.ip);
//     res.json({ success: true });
//   } catch(err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// [PROMPT_44-B] Repository Pattern 적용
app.post('/api/admin/eval/:evalId/force-phase', auth, adminOnly, async (req, res) => {
  try {
    const { phase } = req.body;
    const validPhases = ['draft','pending','approved','rejected',
                         'final_self','final_mgr_pending','final_mgr2_pending','final_done'];
    if (!validPhases.includes(phase))
      return res.status(400).json({ error: '유효하지 않은 phase입니다.' });

    const ev = await evalCycleRepo.findById(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '평가를 찾을 수 없습니다.' });

    const locked = phase === 'final_done' ? 1 : 0;
    await evalCycleRepo.updatePhaseAndLocked(req.params.evalId, phase, locked);

    if (phase === 'final_done') {
      await finalEvalRepo.upsert(req.params.evalId, {
        locked: 1,
        locked_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
    }

    auditLog(req.user.sub, 'FORCE_PHASE_CHANGE', req.params.evalId, ev?.user_name,
      `평가 단계 강제 변경: ${ev.phase} → ${phase}`, req.ip);

    res.json({ success: true });
  } catch(err) {
    console.error('[force-phase]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 평가 방식 API ─────────────────────────────────────────

// 내 평가 방식 조회 (조직장 설정 상속)
// 활성 기간별 내 평가방식 목록
// 내 소속 조직의 리더 체인 (org_id 기반)
// [INFRA-A6] getMyOrgLeaderChain → async, userRepo + $queryRawUnsafe
async function getMyOrgLeaderChainAsync(userId) {
  try {
    const me = await userRepo.findById(userId);
    if (!me?.org_id) return [];
    const chain = [];
    let currentOrgId = me.org_id;
    const prisma = evalPeriodRepo.prisma;
    for (let depth = 0; depth < 10; depth++) {
      const rows = await prisma.$queryRawUnsafe('SELECT * FROM organizations WHERE id=? LIMIT 1', Number(currentOrgId));
      const org = rows[0];
      if (!org) break;
      if (org.leader_id) chain.push(org.leader_id);
      if (!org.parent_id) break;
      currentOrgId = org.parent_id;
    }
    return chain;
  } catch(e) { return []; }
}

app.get('/api/eval-periods/my-modes', auth, async (req, res) => {
  try {
    const activePeriods = await evalPeriodRepo.findActive();
    const leaderChain = await getMyOrgLeaderChainAsync(req.user.sub);

    const result = await Promise.all(activePeriods.map(async period => {
      for (const leaderId of leaderChain) {
        const orgMode = await evalPeriodRepo.getOrgModeForManager(period.id, leaderId);
        if (orgMode && orgMode.eval_mode !== 'MBO') return {
          period_id: period.id, period_label: period.period_label,
          eval_year: period.eval_year, mode: orgMode.eval_mode, source: 'org_period'
        };
      }
      return {
        period_id: period.id, period_label: period.period_label,
        eval_year: period.eval_year, mode: period.eval_mode || 'MBO', source: 'period'
      };
    }));

    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings/my-eval-mode', auth, async (req, res) => {
  try {
    const activePeriods = await evalPeriodRepo.findActive();

    if (!activePeriods.length) {
      return res.json({ mode: getSetting('eval_mode', 'MBO'), source: 'global' });
    }

    const leaderChain = await getMyOrgLeaderChainAsync(req.user.sub);

    for (const period of activePeriods) {
      for (const leaderId of leaderChain) {
        const orgMode = await evalPeriodRepo.getOrgModeForManager(period.id, leaderId);
        if (orgMode && orgMode.eval_mode !== 'MBO')
          return res.json({ mode: orgMode.eval_mode, source: 'org_period', period: period.period_label });
      }
      if (period.eval_mode && period.eval_mode !== 'MBO')
        return res.json({ mode: period.eval_mode, source: 'period', period: period.period_label });
    }

    res.json({ mode: getSetting('eval_mode', 'MBO'), source: 'global' });
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

// [INFRA-A6] OKR progress → adminRepo.updateKrProgress
app.post('/api/okr/:id/progress', auth, async (req, res) => {
  try {
    const { kr_updates } = req.body;
    for (const u of (kr_updates || [])) {
      await adminRepo.updateKrProgress(u.kr_id, u.current_value);
    }
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 전직원 평가 현황 요약 [INFRA-A6: adminRepo async 전환]
app.get('/api/admin/eval-status', auth, adminOnly, async (req, res) => {
  try {
    const isAdmin = ['master','admin'].includes(req.user.role);
    const includeInactive = String(req.query.include_inactive) === 'true';
    const effectiveInclInactive = isAdmin && includeInactive;
    if (!isAdmin && includeInactive) {
      auditLog(req.user.sub, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null,
        '비관리자의 비활성 기간 포함 시도 (eval-status)', req.ip);
    }

    // [INFRA-A6] admin eval-status → adminRepo async 전환
    const periodIdsParam = req.query.period_ids || '';
    let targetPeriodIds = [];
    if (periodIdsParam) {
      targetPeriodIds = periodIdsParam.split(',').map(s => Number(s.trim())).filter(Boolean);
    } else {
      const periods = await evalPeriodRepo.findAll({ includeInactive: effectiveInclInactive });
      targetPeriodIds = periods.map(p => p.id);
    }
    if (targetPeriodIds.length === 0)
      return res.json({ users: [], stats: { total_users: 0, started: 0, goal_approved: 0, final_done: 0 } });

    const users = await adminRepo.findActiveUsers();

    const result = await Promise.all(users.map(async u => {
      const cycles = await adminRepo.findUserEvalCycles(u.id, targetPeriodIds);
      return { ...u, cycles };
    }));

    // 통계 (사용자 기준 — 선택 기간 중 가장 진행된 phase)
    const goalApprovedSet = new Set(['approved','final_self','final_mgr_pending','final_mgr2_pending','final_done']);
    let started = 0, goalApproved = 0, finalDone = 0;
    result.forEach(u => {
      if (!u.cycles.length) return;
      started++;
      if (u.cycles.some(c => goalApprovedSet.has(c.phase))) goalApproved++;
      if (u.cycles.some(c => c.phase === 'final_done')) finalDone++;
    });

    res.json({ users: result, stats: { total_users: users.length, started, goal_approved: goalApproved, final_done: finalDone } });
  } catch(err) {
    console.error('[eval-status]', err);
    res.status(500).json({ error: err.message });
  }
});

// 특정 직원 평가 상세 조회 [INFRA-A5: 어댑터 async 전환, enc _flatten 경유]
app.get('/api/admin/eval-detail/:userId', auth, adminOnly, async (req, res) => {
  try {
    const u = await userRepo.findById(req.params.userId);
    if (!u) return res.status(404).json({ error: '사용자 없음' });

    const ev = await evalCycleRepo.findLatestByUser(req.params.userId);
    if (!ev) return res.json({ user: u, eval: null, goals: [], feedbacks: [], finalEval: null, approvals: [] });

    const [goals, fbs, fe, approvals] = await Promise.all([
      goalRepo.findByEvalId(ev.id),
      feedbackRepo.findByEvalId(ev.id),
      finalEvalRepo.findByEvalId(ev.id),
      approvalRepo.findByEvalIdOrdered(ev.id),
    ]);

    res.json({ user: u, eval: ev, goals, feedbacks: fbs, finalEval: fe || null, approvals });
  } catch(err) {
    console.error('[eval-detail]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 성과관리 API ──────────────────────────────────────────

// 대시보드 계층 설정 [INFRA-A5: getSetting 헬퍼 경유]
app.get('/api/settings/dashboard-depth', auth, (req, res) => {
  res.json({ depth: parseInt(getSetting('dashboard_depth', '2')) });
});

app.post('/api/settings/dashboard-depth', auth, adminOnly, (req, res) => {
  try {
    const depth = parseInt(req.body.depth);
    if (![1,2,3].includes(depth))
      return res.status(400).json({ error: '1~3단계만 설정 가능합니다. (4단계 미지원)' });
    upsertSettingMeta('dashboard_depth', depth.toString(), req.user.sub); // [INFRA-A5]
    auditLog(req.user.sub, 'DASHBOARD_DEPTH_CHANGED', null, null,
      `대시보드 계층 변경: ${depth}단계`, req.ip);
    res.json({ success: true, depth });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 내 성과 요약 [INFRA-A6: adminRepo async 전환]
app.get('/api/perf/my-summary', auth, async (req, res) => {
  try {
    const { period_id } = req.query;
    const userId = req.user.sub;
    const periods = period_id
      ? [await evalPeriodRepo.findById(period_id)]
      : await evalPeriodRepo.findActive();

    const result = await Promise.all(periods.filter(Boolean).map(async period => {
      const [evals, counts, okrData] = await Promise.all([
        adminRepo.findEvalForUserAndPeriod(userId, period.period_label, period.eval_year),
        adminRepo.getReportFeedbackCount(userId, period.period_label),
        adminRepo.findOkrCycleWithDetails(userId, period.period_label, period.eval_year),
      ]);

      let okrAvg = null;
      if (okrData.length) {
        let totalKRs = 0, totalPct = 0;
        okrData.forEach(cycle => {
          (cycle.objectives || []).forEach(obj => {
            (obj.key_results || []).forEach(kr => {
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
        report_count: counts.report_count,
        feedback_count: counts.feedback_count,
        phase: evals[0]?.phase || null,
        self_done: evals[0]?.self_done || 0,
        mgr_done: evals[0]?.mgr_done || 0,
      };
    }));

    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// 팀 성과 요약 [INFRA-A6: adminRepo async 전환]
app.get('/api/perf/team-summary', auth, async (req, res) => {
  try {
    const { period_id } = req.query;
    const userId = req.user.sub;
    const maxDepth = parseInt(getSetting('dashboard_depth', '2'));

    const myOrg = await adminRepo.findOrgByLeader(userId);
    if (!myOrg) return res.json({ is_leader: false, teams: [] });

    const members = await adminRepo.findOrgMembers(myOrg.id, maxDepth);

    const periods = period_id
      ? [await evalPeriodRepo.findById(period_id)]
      : (await evalPeriodRepo.findAll({ includeInactive: false })).slice(0, 3);

    const teamData = await Promise.all(periods.filter(Boolean).map(async period => {
      const memberStats = await Promise.all(members.map(async m => {
        const [evRows, okrData] = await Promise.all([
          adminRepo.findEvalForUserAndPeriod(m.id, period.period_label, period.eval_year),
          adminRepo.findOkrCycleWithDetails(m.id, period.period_label, period.eval_year),
        ]);
        const ev = evRows[0] || null;
        let okrAvg = null;
        if (okrData.length) {
          let t = 0, p = 0;
          okrData.forEach(c => {
            (c.objectives||[]).forEach(obj => {
              (obj.key_results||[]).forEach(kr => {
                t++;
                p += kr.target_value > 0 ? (kr.current_value/kr.target_value)*100 : 0;
              });
            });
          });
          okrAvg = t > 0 ? Math.round(p/t) : 0;
        }
        return { user_id: Number(m.id), name: m.name, title: m.title,
          phase: ev?.phase||null, final_score: ev?.final_score||null, okr_avg: okrAvg, mgr_done: ev?.mgr_done||0 };
      }));

      const scored    = memberStats.filter(m => m.final_score !== null);
      const okrScored = memberStats.filter(m => m.okr_avg !== null);
      return {
        period_label: period.period_label, eval_year: period.eval_year,
        eval_mode: period.eval_mode || 'MBO',
        member_count: members.length,
        team_avg_score: scored.length ? Math.round(scored.reduce((a,m)=>a+m.final_score,0)/scored.length*10)/10 : null,
        team_okr_avg: okrScored.length ? Math.round(okrScored.reduce((a,m)=>a+m.okr_avg,0)/okrScored.length) : null,
        members: memberStats,
      };
    }));

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
    } else if (type === 'org') {
      // 전체 조직 뷰는 아직 미구현 (ClaudeHRM.md 미완성 기능 참조)
      return res.json({ summary: '🚧 전체 조직 AI 요약은 준비 중입니다.\n관리자 페이지에서 전직원 평가 현황 탭을 이용해주세요.' });
    }
    const response = await fetch(
      process.env.LLM_API_BASE || 'https://chat.synap.co.kr/api/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LLM_API_KEY || ''}`,
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'SynapAssistant-MoE-30B',
          stream: false,                 // 사내 LLM은 stream 명시 필수
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        })
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai-summary] LLM 응답 오류:', response.status, errText);
      return res.status(500).json({ error: `LLM 호출 실패 (${response.status})` });
    }
    const llmData = await response.json();
    const summary = llmData.choices?.[0]?.message?.content || 'AI 요약 생성 실패 (응답 구조 확인 필요)';
    res.json({ summary });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── 전체 조직 분석 API (PROMPT 58) ─────────────────────────

// 점수→등급 변환 단일 진실 함수 (정책 기반, PROMPT 63A)
function scoreToGrade(score, criteria) {
  if (score == null || isNaN(score)) return null;
  if (!criteria || !criteria.length) return null;
  for (const c of criteria) {  // min_score DESC 정렬 전제
    if (score >= c.min_score) return c.grade_code;
  }
  return null;
}

// 평가 ID → 적용 등급 정책 조회
async function getPolicyForEval(evalId) {
  return await gradePolicyRepo.getPolicyForEvalCycle(evalId);
}

// 디폴트 정책 ID (fallback용)
async function getDefaultPolicyId() {
  return await gradePolicyRepo.getFirstPolicyId();
}

async function buildGradeMap(policyId) {
  const pid = policyId || await gradePolicyRepo.getFirstPolicyId();
  if (!pid) return { gradeCodes: [], maxScore: 100, scoreToGrade: () => null };
  const criteria = await gradePolicyRepo.getCriteriaForGradeMap(pid);
  if (!criteria.length) return { gradeCodes: [], maxScore: 100, scoreToGrade: () => null };
  const gradeCodes = criteria.map(c => c.grade_code);
  return { gradeCodes, maxScore: 100, scoreToGrade: (score) => scoreToGrade(score, criteria) };
}

// 점수를 임의 정책 cutoff로 가상 산출 (표시용, DB 저장 없음)
async function convertGradeWithPolicy(score, policyId) {
  if (score == null || isNaN(score) || !policyId) return null;
  const policy = await gradePolicyRepo.getPolicyWithCriteria(policyId);
  if (!policy) return null;
  for (const c of policy.criteria) {
    if (score >= c.min_score) return { grade_code: c.grade_code, grade_name: c.grade_name, policy_name: policy.name };
  }
  return null;
}

function validateGradePolicyCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { ok: false, error: '최소 1개 이상의 등급이 필요합니다.' };
  }
  for (const c of criteria) {
    if (!c.grade_code || typeof c.grade_code !== 'string' || !c.grade_code.trim()) {
      return { ok: false, error: 'grade_code는 필수입니다.' };
    }
    if (!c.grade_name || typeof c.grade_name !== 'string' || !c.grade_name.trim()) {
      return { ok: false, error: 'grade_name은 필수입니다.' };
    }
    if (typeof c.min_score !== 'number' || isNaN(c.min_score)) {
      return { ok: false, error: `min_score는 숫자여야 합니다. (${c.grade_code})` };
    }
    if (c.min_score < 0 || c.min_score > 100) {
      return { ok: false, error: `min_score는 0~100 범위여야 합니다. (${c.grade_code}=${c.min_score})` };
    }
    if (!Number.isInteger(c.sort_order) || c.sort_order < 1) {
      return { ok: false, error: `sort_order는 1 이상 정수여야 합니다. (${c.grade_code})` };
    }
  }
  const codes = criteria.map(c => c.grade_code);
  if (new Set(codes).size !== codes.length) {
    return { ok: false, error: 'grade_code는 중복될 수 없습니다.' };
  }
  const orders = criteria.map(c => c.sort_order);
  if (new Set(orders).size !== orders.length) {
    return { ok: false, error: 'sort_order는 중복될 수 없습니다.' };
  }
  const scores = criteria.map(c => c.min_score);
  if (new Set(scores).size !== scores.length) {
    return { ok: false, error: 'min_score는 중복될 수 없습니다. (동일 점수가 두 등급으로 매핑 불가)' };
  }
  const sorted = [...criteria].sort((a, b) => a.sort_order - b.sort_order);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].min_score <= sorted[i + 1].min_score) {
      return {
        ok: false,
        error: `sort_order 순서로 min_score가 단조감소해야 합니다. (${sorted[i].grade_code}=${sorted[i].min_score} <= ${sorted[i + 1].grade_code}=${sorted[i + 1].min_score})`
      };
    }
  }
  return { ok: true };
}


// [INFRA-A6] perf/org-tree → adminRepo async 전환
app.get('/api/perf/org-tree', auth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const isAdmin = ['master','admin'].includes(req.user.role);
    let allowedIds = null;
    if (!isAdmin) {
      const lIds = await adminRepo.getLeaderOrgIds(userId);
      if (!lIds.length) return res.status(403).json({ error: '조직 분석 접근 권한이 없습니다.' });
      allowedIds = lIds;
    }
    const { period_ids, max_depth = '999', include_inactive: inclInact } = req.query;
    const maxDepth = Math.min(parseInt(max_depth) || 999, 999);
    const includeInactive = String(inclInact) === 'true';
    const effectiveInclInactive = isAdmin && includeInactive;
    if (!isAdmin && includeInactive) {
      auditLog(userId, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null, '비관리자의 비활성 기간 포함 시도 (org-tree)', req.ip);
    }
    let periodRows;
    if (period_ids) {
      const ids = period_ids.split(',').map(Number).filter(Boolean);
      if (ids.length > 8) return res.status(400).json({ error: '최대 8개 기간까지 선택 가능합니다.' });
      if (!ids.length) return res.status(400).json({ error: 'period_ids가 올바르지 않습니다.' });
      periodRows = await adminRepo.findPeriodsByIds(ids, !effectiveInclInactive);
    } else {
      periodRows = await evalPeriodRepo.findActive();
    }
    const periodLabels = periodRows.map(p => p.period_label);
    const periodIds = periodRows.map(p => p.id);
    const gm = await buildGradeMap(periodRows[0]?.grade_policy_id || null);
    let orgs = await adminRepo.findOrgsWithLeader();
    if (allowedIds) orgs = orgs.filter(o => allowedIds.includes(o.id));
    const orgMap = new Map(orgs.map(o => [o.id, o]));
    const result = [];
    async function traverse(orgId, depth) {
      if (depth > maxDepth) return;
      const org = orgMap.get(orgId);
      if (!org) return;
      const [uIds, directIds, s_raw] = await Promise.all([
        adminRepo.getSubtreeUserIds(orgId),
        adminRepo.getSubtreeUserIds(orgId).then(() => // get direct members
          adminRepo.prisma.$queryRawUnsafe('SELECT id FROM users WHERE org_id=? AND is_active=1', Number(orgId)).then(r => r.map(x => Number(x.id)))
        ),
        adminRepo.calcGradeStats(await adminRepo.getSubtreeUserIds(orgId), periodLabels, gm),
      ]);
      // direct members (simpler approach)
      const directRows = await adminRepo.prisma.$queryRawUnsafe('SELECT id FROM users WHERE org_id=? AND is_active=1', Number(orgId));
      const dIds = directRows.map(r => Number(r.id));
      const [s, c] = await Promise.all([
        adminRepo.calcGradeStats(uIds, periodLabels, gm),
        adminRepo.calcCompletionStats(dIds, periodIds),
      ]);
      result.push({ id: org.id, name: org.name, depth, parent_id: org.parent_id, leader_name: org.leader_name || null,
        direct_members: dIds.length, total_members: s.total, evaluated_members: c.completed,
        expected_total: c.total, completion_rate: c.rate,
        avg_score: s.avg_score, avg_score_max: gm.maxScore, avg_grade: s.avg_grade, grade_distribution: s.dist });
      await Promise.all(orgs.filter(o => o.parent_id === orgId).map(ch => traverse(ch.id, depth + 1)));
    }
    const roots = orgs.filter(o => !o.parent_id || !orgMap.has(o.parent_id));
    await Promise.all(roots.map(r => traverse(r.id, 0)));
    let company = null;
    if (isAdmin) {
      const [allIds] = await Promise.all([adminRepo.findAllActiveUserIds()]);
      const [s, c] = await Promise.all([
        adminRepo.calcGradeStats(allIds, periodLabels, gm),
        adminRepo.calcCompletionStats(allIds, periodIds),
      ]);
      company = { name: '㈜사이냅소프트 (전체)', total_members: s.total, evaluated_members: c.completed,
        expected_total: c.total, completion_rate: c.rate,
        avg_score: s.avg_score, avg_score_max: gm.maxScore, avg_grade: s.avg_grade, grade_distribution: s.dist };
    }
    res.json({ periods: periodRows.map(p => ({ id: p.id, label: p.period_label })),
      grade_codes: gm.gradeCodes, company, orgs: result });
  } catch(err) {
    console.error('[GET /api/perf/org-tree]', err);
    res.status(500).json({ error: err.message });
  }
});

// 직원별 등급 환산 데이터 [INFRA-A6: adminRepo async 전환]
app.get('/api/perf/employee-grades', auth, async (req, res) => {
  try {
    const isAdmin = ['master','admin'].includes(req.user.role);
    const isLeader = !isAdmin ? (await adminRepo.getLeaderOrgIds(req.user.sub)).length > 0 : true;
    if (!isAdmin && !isLeader) return res.status(403).json({ error: '권한 없음' });

    const { period_ids, include_inactive: inclInact } = req.query;
    if (!period_ids) return res.status(400).json({ error: 'period_ids는 필수입니다.' });

    const ids = period_ids.split(',').map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'period_ids가 올바르지 않습니다.' });

    const includeInactive = isAdmin && String(inclInact) === 'true';
    const activeFilter = includeInactive ? '' : 'AND ep.is_active = 1';

    const ph = ids.map(() => '?').join(',');
    const activeWhere = includeInactive ? '' : 'AND ep.is_active = 1';
    const rows = await adminRepo.prisma.$queryRawUnsafe(`
      SELECT u.id AS user_id, u.name AS employee_name, u.dept,
             ec.period_label, ec.eval_year,
             fe.id AS final_eval_id, fe.final_score, fe.final_grade,
             ep.grade_policy_id AS stored_policy_id, gp.name AS stored_policy_name
      FROM final_evaluations fe
      JOIN eval_cycles ec ON fe.eval_id = ec.id
      JOIN users u ON ec.user_id = u.id
      JOIN eval_periods ep ON ep.period_label = ec.period_label AND ep.eval_year = ec.eval_year
        AND ep.id IN (${ph}) ${activeWhere}
      LEFT JOIN grade_policies gp ON gp.id = ep.grade_policy_id
      WHERE fe.final_grade IS NOT NULL
      ORDER BY ec.eval_year DESC, ec.period_label DESC, u.name
    `, ...ids);

    const policies = await adminRepo.prisma.$queryRawUnsafe('SELECT id, name FROM grade_policies ORDER BY id');
    const policiesWithCriteria = await Promise.all(policies.map(async p => ({
      ...p, id: Number(p.id),
      criteria: await adminRepo.findGradePolicyCriteria(p.id),
    })));

    const activePeriods = await evalPeriodRepo.findActive();
    const activePolicyId = activePeriods[0]?.grade_policy_id || (policies[0]?.id ? Number(policies[0].id) : null);

    res.json({ rows, available_policies: policiesWithCriteria, active_policy_id: activePolicyId });
  } catch(err) {
    console.error('[GET /api/perf/employee-grades]', err);
    res.status(500).json({ error: err.message });
  }
});

// [INFRA-A6] perf/quarterly-trend → adminRepo async
app.get('/api/perf/quarterly-trend', auth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const isAdmin = ['master','admin'].includes(req.user.role);
    let allowedIds = null;
    if (!isAdmin) {
      const lIds = await adminRepo.getLeaderOrgIds(userId);
      if (!lIds.length) return res.status(403).json({ error: '조직 분석 접근 권한이 없습니다.' });
      allowedIds = lIds;
    }
    const { org_id, period_ids, include_inactive: inclInact } = req.query;
    const includeInactive = String(inclInact) === 'true';
    const effectiveInclInactive = isAdmin && includeInactive;
    if (!isAdmin && includeInactive) {
      auditLog(userId, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null, '비관리자의 비활성 기간 포함 시도 (quarterly-trend)', req.ip);
    }
    if (!period_ids) return res.status(400).json({ error: 'period_ids는 필수입니다.' });
    const pIdList = String(period_ids).split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    if (!pIdList.length) return res.status(400).json({ error: 'period_ids가 유효하지 않습니다.' });
    if (pIdList.length > 8) return res.status(400).json({ error: '최대 8개 기간까지 조회 가능합니다.' });
    const periods = await adminRepo.findPeriodsByIds(pIdList, !effectiveInclInactive);
    const gm = await buildGradeMap(periods[0]?.grade_policy_id || null);
    let userIds, orgName = '회사 전체';
    if (org_id) {
      const orgIdNum = parseInt(org_id);
      if (allowedIds && !allowedIds.includes(orgIdNum)) return res.status(403).json({ error: '해당 조직 접근 권한이 없습니다.' });
      [orgName, userIds] = await Promise.all([
        adminRepo.findOrgNameById(orgIdNum).then(n => n || '알 수 없음'),
        adminRepo.getSubtreeUserIds(orgIdNum),
      ]);
    } else if (isAdmin) {
      userIds = await adminRepo.findAllActiveUserIds();
    } else {
      const rootOrgId = allowedIds[0];
      [orgName, userIds] = await Promise.all([
        adminRepo.findOrgNameById(rootOrgId).then(n => n || '알 수 없음'),
        adminRepo.getSubtreeUserIds(rootOrgId),
      ]);
    }
    const result = await Promise.all(periods.map(async p => {
      const s = await adminRepo.calcGradeStats(userIds, [p.period_label], gm);
      return { period_id: p.id, label: p.period_label, total: s.total, evaluated: s.evaluated,
        avg_score: s.avg_score, avg_grade: s.avg_grade, dist: s.dist };
    }));
    res.json({ org_name: orgName, periods: result, grade_codes: gm.gradeCodes, max_score: gm.maxScore });
  } catch(err) {
    console.error('[GET /api/perf/quarterly-trend]', err);
    res.status(500).json({ error: err.message });
  }
});

// [INFRA-A6] perf/grade-distribution → adminRepo async
app.get('/api/perf/grade-distribution', auth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const isAdmin = ['master','admin'].includes(req.user.role);
    let allowedIds = null;
    if (!isAdmin) {
      const lIds = await adminRepo.getLeaderOrgIds(userId);
      if (!lIds.length) return res.status(403).json({ error: '조직 분석 접근 권한이 없습니다.' });
      allowedIds = lIds;
    }
    const { org_id, period_ids, include_inactive: inclInact } = req.query;
    const includeInactive = String(inclInact) === 'true';
    const effectiveInclInactive = isAdmin && includeInactive;
    if (!isAdmin && includeInactive) {
      auditLog(userId, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null, '비관리자의 비활성 기간 포함 시도 (grade-distribution)', req.ip);
    }
    if (!period_ids) return res.status(400).json({ error: 'period_ids는 필수입니다.' });
    const pIdList = String(period_ids).split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    if (!pIdList.length) return res.status(400).json({ error: 'period_ids가 유효하지 않습니다.' });
    if (pIdList.length > 8) return res.status(400).json({ error: '최대 8개 기간까지 조회 가능합니다.' });
    const periods = await adminRepo.findPeriodsByIds(pIdList, !effectiveInclInactive);
    const gm = await buildGradeMap(periods[0]?.grade_policy_id || null);
    let userIds;
    if (org_id) {
      const orgIdNum = parseInt(org_id);
      if (allowedIds && !allowedIds.includes(orgIdNum)) return res.status(403).json({ error: '해당 조직 접근 권한이 없습니다.' });
      userIds = await adminRepo.getSubtreeUserIds(orgIdNum);
    } else if (isAdmin) {
      userIds = await adminRepo.findAllActiveUserIds();
    } else {
      userIds = await adminRepo.getSubtreeUserIds(allowedIds[0]);
    }
    if (!userIds.length) {
      return res.json({ periods: periods.map(p => p.period_label), grades: gm.gradeCodes,
        matrix: gm.gradeCodes.map(() => periods.map(() => 0)) });
    }
    const matrix = await Promise.all(gm.gradeCodes.map(async grade =>
      Promise.all(periods.map(p => adminRepo.countByGrade(userIds, p.period_label, grade)))
    ));
    res.json({ periods: periods.map(p => p.period_label), grades: gm.gradeCodes, matrix });
  } catch(err) {
    console.error('[GET /api/perf/grade-distribution]', err);
    res.status(500).json({ error: err.message });
  }
});

function buildOrgAIPrompt(level, { periodStr, gm, compStats, evalRate, distStr, orgSArr, trendArr }) {
  const n = level === 'comprehensive' ? 5 : 3;
  const sorted = [...orgSArr].filter(o => o.avg_score !== null).sort((a,b) => (b.avg_score||0)-(a.avg_score||0));
  const fmt = o => `- ${o.name}: ${o.total}명, 평균 ${o.avg_score||'-'}/${gm.maxScore} (${o.avg_grade||'-'})`;
  const topStr  = sorted.slice(0, n).map(fmt).join('\n') || '- 데이터 없음';
  const botStr  = sorted.slice(-n).reverse().map(fmt).join('\n') || '- 데이터 없음';
  const trendStr = trendArr.map(t => `- ${t.label}: ${t.avg_score !== null ? t.avg_score+'/'+gm.maxScore : '없음'} (${t.avg_grade||'-'})`).join('\n') || '- 데이터 없음';
  const orgDetailStr = orgSArr.map(o => `- ${o.name}: ${o.total}명, 평균 ${o.avg_score !== null ? o.avg_score+'/'+gm.maxScore : '-'} (${o.avg_grade||'-'})`).join('\n') || '- 없음';
  const base = `- 회사: ㈜사이냅소프트\n- 기간: ${periodStr}\n- 점수 체계: ${gm.maxScore}점 만점 (${gm.gradeCodes.join('>')})\n\n## 회사 전체 통계\n- 직원: ${compStats.total}명, 평가 완료: ${compStats.evaluated}명 (${evalRate}%)\n- 평균: ${compStats.avg_score !== null ? compStats.avg_score+'/'+gm.maxScore : '없음'} (${compStats.avg_grade||'-'})\n- 등급 분포: ${distStr}`;

  if (level === 'summary') {
    return `당신은 회사의 인사 데이터 분석 전문가입니다.\n아래 평가 통계를 분석하여 경영진·인사팀용 요약 보고서를 작성해주세요.\n\n## 분석 대상\n${base}\n\n## 우수 조직\n${topStr}\n\n## 하위 조직\n${botStr}\n\n## 분기별 추이\n${trendStr}\n\n## 요청\n다음 5개 항목을 각 1~2줄, 총 10줄 이내. 반드시 아래 JSON만 출력 (마크다운 코드블록 없이):\n{"overall":"...","strengths":["...","..."],"weaknesses":["...","..."],"trend":"...","actions":["...","..."]}`;
  }
  if (level === 'detailed') {
    return `당신은 회사의 인사 데이터 분석 전문가입니다. 임원과 인사팀이 의사결정 회의 자료로 활용할 수 있도록 평가 통계를 분석해주세요.\n\n## 분석 대상\n${base}\n\n## 조직별 현황\n${orgDetailStr}\n\n## 우수 조직\n${topStr}\n\n## 하위 조직\n${botStr}\n\n## 분기별 추이\n${trendStr}\n\n## 요청\n다음 6개 항목으로 총 20~30줄 작성. 반드시 아래 JSON만 출력 (마크다운 코드블록 없이):\n{"overall":"...","strengths":[{"dept":"...","detail":"..."}],"weaknesses":[{"dept":"...","detail":"..."}],"department_details":[{"name":"...","avg_score":0,"grade":"...","completion_rate":0,"strength":"...","improvement":"..."}],"trend":"...","actions":[{"action":"...","difficulty":"중","duration":"1개월"}]}`;
  }
  // comprehensive
  return `당신은 회사의 인사 데이터 분석 전문가입니다. 이사회 보고·연말 평가·전략 수립 자료로 활용할 수 있도록 평가 통계를 심층 분석해주세요.\n\n## 분석 대상\n${base}\n\n## 조직별 현황\n${orgDetailStr}\n\n## 우수 조직\n${topStr}\n\n## 하위 조직\n${botStr}\n\n## 분기별 추이\n${trendStr}\n\n## 요청\n다음 10개 항목으로 총 50줄 이상 작성. 반드시 아래 JSON만 출력 (마크다운 코드블록 없이):\n{"overall":"...","strengths":[{"dept":"...","detail":"...","quantitative":"...","qualitative":"..."}],"weaknesses":[{"dept":"...","detail":"...","concern_scope":"..."}],"department_details":[{"name":"...","avg_score":0,"grade":"...","completion_rate":0,"strength":"...","improvement":"...","trend":"..."}],"trend":"...","risks":["..."],"forecast":"...","comparison":"...","long_term_recommendations":["..."],"actions":[{"action":"...","priority":"상","expected_effect":"...","difficulty":"중","duration":"3개월"}]}`;
}

app.post('/api/perf/org-ai-summary', auth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const isAdmin = ['master','admin'].includes(req.user.role);
    let allowedIds = null;
    if (!isAdmin) {
      const lIds = await adminRepo.getLeaderOrgIds(userId);
      if (!lIds.length) return res.status(403).json({ error: '조직 분석 접근 권한이 없습니다.' });
      allowedIds = lIds;
    }
    const { period_ids, include_inactive: inclInact, level: rawLevel } = req.body;
    const level = ['summary','detailed','comprehensive'].includes(rawLevel) ? rawLevel : 'summary';
    const includeInactive = String(inclInact) === 'true';
    const effectiveInclInactive = isAdmin && includeInactive;
    if (!isAdmin && includeInactive) {
      auditLog(userId, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null, '비관리자의 비활성 기간 포함 시도 (org-ai-summary)', req.ip);
    }
    if (!period_ids) return res.status(400).json({ error: 'period_ids는 필수입니다.' });
    const pIdList = String(period_ids).split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    if (!pIdList.length) return res.status(400).json({ error: 'period_ids가 유효하지 않습니다.' });
    if (pIdList.length > 8) return res.status(400).json({ error: '최대 8개 기간까지 조회 가능합니다.' });
    const periods = await adminRepo.findPeriodsByIds(pIdList, !effectiveInclInactive);
    const periodLabels = periods.map(p => p.period_label);
    const periodStr = periods.length
      ? `${periods[0].period_label} ~ ${periods[periods.length-1].period_label}` : '(없음)';
    const gm = await buildGradeMap(periods[0]?.grade_policy_id || null);
    const baseIds = isAdmin
      ? await adminRepo.findAllActiveUserIds()
      : await adminRepo.getSubtreeUserIds(allowedIds[0]);
    const compStats = await adminRepo.calcGradeStats(baseIds, periodLabels, gm);
    const subOrgs = (await adminRepo.findOrgsWithLeader())
      .filter(o => o.parent_id !== null)
      .filter(o => !allowedIds || allowedIds.includes(o.id));
    const orgSArr = await Promise.all(subOrgs.map(async o => {
      const ids = await adminRepo.getSubtreeUserIds(o.id);
      const s = await adminRepo.calcGradeStats(ids, periodLabels, gm);
      return { name: o.name, total: s.total, avg_score: s.avg_score, avg_grade: s.avg_grade };
    }));
    const trendArr = await Promise.all(periods.map(async p => {
      const s = await adminRepo.calcGradeStats(baseIds, [p.period_label], gm);
      return { label: p.period_label, avg_score: s.avg_score, avg_grade: s.avg_grade };
    }));
    const evalRate = compStats.total > 0 ? Math.round(compStats.evaluated/compStats.total*100) : 0;
    const distStr = Object.entries(compStats.dist).map(([g,c]) => `${g}: ${c}명`).join(', ') || '없음';
    const prompt = buildOrgAIPrompt(level, { periodStr, gm, compStats, evalRate, distStr, orgSArr, trendArr });
    const tokenLimits = { summary: 800, detailed: 2500, comprehensive: 5000 };
    const llmRes = await fetch(
      process.env.LLM_API_BASE || 'https://chat.synap.co.kr/api/chat/completions',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.LLM_API_KEY||''}` },
        body: JSON.stringify({ model: process.env.LLM_MODEL||'SynapAssistant-MoE-30B', stream: false,
          max_tokens: tokenLimits[level] || 800,
          messages: [{ role: 'user', content: prompt }] }) }
    );
    if (!llmRes.ok) {
      const t = await llmRes.text();
      console.error('[org-ai-summary] LLM 오류:', llmRes.status, t);
      return res.status(500).json({ error: `LLM 호출 실패 (${llmRes.status})` });
    }
    const llmData = await llmRes.json();
    const raw = llmData.choices?.[0]?.message?.content || '';
    let structured = null;
    try {
      const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      const m = stripped.match(/\{[\s\S]*\}/);
      if (m) structured = JSON.parse(m[0]);
    } catch(e) {}
    auditLog(userId, 'ORG_AI_SUMMARY_GENERATED', null, '전체 조직', `level=${level}, 기간: ${periodStr}`, req.ip);
    res.json({ summary: raw, structured, level, generated_at: new Date().toISOString() });
  } catch(err) {
    console.error('[POST /api/perf/org-ai-summary]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 조직 관리 API ─────────────────────────────────────────

// [PROMPT_38] Repository Pattern 적용
app.get('/api/organizations', auth, async (req, res) => {
  try {
    const orgs = await organizationRepo.findAllActiveWithRelations();
    res.json(orgs);
  } catch(err) {
    console.error('[GET /api/organizations]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/organizations', auth, adminOnly, async (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '조직명은 필수입니다.' });
    const newId = await organizationRepo.create({ name, leader_id, parent_id, description, sort_order });
    auditLog(req.user.sub, 'ORG_CREATED', newId, name, `조직 생성: ${name}`, req.ip);
    res.json({ id: newId });
  } catch(err) {
    console.error('[POST /api/organizations]', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/organizations/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, leader_id, parent_id, description, sort_order } = req.body;
    await organizationRepo.update(req.params.id, { name, leader_id, parent_id, description, sort_order });
    auditLog(req.user.sub, 'ORG_UPDATED', req.params.id, name, `조직 수정: ${name}`, req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[PUT /api/organizations/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/organizations/:id', auth, masterOnly, async (req, res) => {
  try {
    const org = await organizationRepo.deactivate(req.params.id);
    auditLog(req.user.sub, 'ORG_DELETED', req.params.id, org?.name, '조직 비활성화', req.ip);
    res.json({ success: true });
  } catch(err) {
    console.error('[DELETE /api/organizations/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/organizations/:id/members', auth, async (req, res) => {
  try {
    const members = await userRepo.findByOrgId(req.params.id);
    res.json(members);
  } catch(err) {
    console.error('[GET /api/organizations/:id/members]', err);
    res.status(500).json({ error: err.message });
  }
});

// [INFRA-A3] organizations 3건 → userRepo/orgRepo async 전환
app.patch('/api/users/:id/org', auth, adminOnly, async (req, res) => {
  try {
    const { org_id } = req.body;
    await userRepo.updateOrgId(req.params.id, org_id || null);
    const target = await userRepo.findById(req.params.id);
    const orgName = org_id ? (await orgRepo.findNameById(org_id)) : null;
    auditLog(req.user.sub, 'USER_ORG_CHANGED', req.params.id, target?.name,
      `조직 변경: ${orgName||'미지정'}`, req.ip);
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
// app_settings 전체 행 반환 (value + updated_by + updated_at 포함)
function getSettingRow(key) {
  try {
    return db.prepare("SELECT value, updated_by, updated_at FROM app_settings WHERE key=?").get(key);
  } catch(e) { return null; }
}
// app_settings upsert (updated_by·updated_at 포함) — notice/session-policy 등
function upsertSettingMeta(key, value, userId) {
  try {
    db.prepare(`
      INSERT INTO app_settings(key, value, updated_by, updated_at)
      VALUES(?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value=excluded.value,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at
    `).run(key, value, userId);
  } catch(e) { console.error('[upsertSettingMeta]', e.message); }
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

// 시간대 설정 [INFRA-A2: 2건 → getSetting/setSetting 헬퍼 경유]
app.get('/api/settings/timezone', auth, (req, res) => {
  res.json({ timezone: getSetting('timezone', 'Asia/Seoul') });
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
    setSetting('timezone', timezone);
    process.env.TZ = timezone;
    auditLog(req.user.sub, 'TIMEZONE_CHANGED', null, null,
      `시간대 변경: ${timezone}`, req.ip);
    res.json({ success: true, timezone });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 내가 직속 상사(또는 2차 평가자)인 final_mgr_pending eval 목록 [INFRA-A5]
app.get('/api/evals/my-mgr-pending', auth, async (req, res) => {
  try {
    const directRows = await evalCycleRepo.findFinalPendingByManager(req.user.sub);

    const secondEnabled = getSetting('second_final', '0') === '1';
    let secondRows = [];
    if (secondEnabled) {
      secondRows = await evalCycleRepo.findFinalPending2ndByManager(req.user.sub);
    }

    const seen = new Set(directRows.map(r => r.id));
    const combined = [
      ...directRows,
      ...secondRows.filter(r => !seen.has(r.id)),
    ];
    res.json(combined); // enc 복호화는 findFinalPending* 메서드에서 처리됨
  } catch(err) {
    console.error('[my-mgr-pending]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 등급 기준 API ─────────────────────────────────────────
// [PROMPT_36-8] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.get('/api/grade-criteria', auth, (req, res) => {
//   const grades = db.prepare('SELECT * FROM grade_criteria ORDER BY sort_order, id').all();
//   res.json(grades);
// });

// grade_criteria API 폐기 (PROMPT 63A) — /api/grade-policies 사용
app.all('/api/grade-criteria', (req, res) => {
  res.status(410).json({ error: 'grade_criteria API는 폐기되었습니다. /api/grade-policies를 사용하세요.' });
});
app.all('/api/grade-criteria/:id', (req, res) => {
  res.status(410).json({ error: 'grade_criteria API는 폐기되었습니다.' });
});

// GET /api/grade-policies — 등급 정책 목록 + criteria + applied_periods
app.get('/api/grade-policies', auth, adminOnly, async (req, res) => {
  try {
    const policies = await gradePolicyRepo.findAll();
    res.json(policies);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/grade-policies — 신규 정책 생성
app.post('/api/grade-policies', auth, adminOnly, async (req, res) => {
  const { name, description, criteria } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: '정책 이름은 필수입니다.' });
  }
  try {
    const existing = await gradePolicyRepo.findByName(name.trim());
    if (existing) {
      return res.status(409).json({ error: `이미 존재하는 정책 이름입니다: ${name}` });
    }
    const validation = validateGradePolicyCriteria(criteria);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const policyId = await gradePolicyRepo.createWithCriteria(
      { name: name.trim(), description: description || null, created_by: req.user.sub },
      criteria
    );
    auditLog(req.user.sub, 'GRADE_POLICY_CREATED', policyId, name.trim(),
      JSON.stringify({ criteria_count: criteria.length, criteria: criteria.map(c => ({ code: c.grade_code, min_score: c.min_score })) }), req.ip);
    res.status(201).json({ id: policyId, name: name.trim() });
  } catch (e) {
    res.status(500).json({ error: '정책 생성 실패: ' + e.message });
  }
});

// PUT /api/grade-policies/:id — 정책 수정 (이름·description은 항상 허용, criteria는 미바인딩 시에만)
app.put('/api/grade-policies/:id', auth, adminOnly, async (req, res) => {
  const policyId = parseInt(req.params.id);
  if (!Number.isInteger(policyId)) {
    return res.status(400).json({ error: '유효하지 않은 정책 ID' });
  }
  try {
    const target = await gradePolicyRepo.findById(policyId);
    if (!target) {
      return res.status(404).json({ error: '정책을 찾을 수 없습니다.' });
    }
    const { name, description, criteria } = req.body;
    const hasNameOrDesc = (name !== undefined) || (description !== undefined);
    const hasCriteria = criteria !== undefined;
    if (!hasNameOrDesc && !hasCriteria) {
      return res.status(400).json({ error: '수정할 필드가 없습니다.' });
    }
    if (hasCriteria) {
      // 잠금가드: applied_periods ≥ 1이면 criteria 수정 차단
      const appliedCount = await gradePolicyRepo.getAppliedCount(policyId);
      if (appliedCount > 0) {
        const appliedPeriods = await gradePolicyRepo.getAppliedPeriods(policyId);
        return res.status(409).json({
          error: `이 정책은 ${appliedCount}개 평가 기간에 적용 중이므로 cutoff(등급 기준)를 수정할 수 없습니다. 신규 정책을 만들고 새 기간에 바인딩하세요.`,
          applied_periods: appliedPeriods,
          hint: '정책 이름·description은 수정 가능합니다.'
        });
      }
      const validation = validateGradePolicyCriteria(criteria);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }
    }
    if (name !== undefined && name.trim() !== target.name) {
      const dup = await gradePolicyRepo.findByNameExcluding(name.trim(), policyId);
      if (dup) {
        return res.status(409).json({ error: `이미 존재하는 정책 이름입니다: ${name}` });
      }
    }
    const metaUpdates = {};
    if (name        !== undefined) metaUpdates.name        = name.trim();
    if (description !== undefined) metaUpdates.description = description || null;
    await gradePolicyRepo.updateWithCriteria(policyId, metaUpdates, hasCriteria ? criteria : null);
    const resolvedName = name !== undefined ? name.trim() : target.name;
    if (hasNameOrDesc) {
      auditLog(req.user.sub, 'GRADE_POLICY_UPDATED', policyId, target.name,
        JSON.stringify({ before: { name: target.name, description: target.description }, after: { name: resolvedName, description: description !== undefined ? description : target.description } }), req.ip);
    }
    if (hasCriteria) {
      auditLog(req.user.sub, 'GRADE_POLICY_CRITERIA_UPDATED', policyId, resolvedName,
        JSON.stringify({ new_criteria: criteria.map(c => ({ code: c.grade_code, min_score: c.min_score })) }), req.ip);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '정책 수정 실패: ' + e.message });
  }
});

// DELETE /api/grade-policies/:id — 정책 삭제 (applied_periods 강제 초기화 + 비활성화)
app.delete('/api/grade-policies/:id', auth, adminOnly, async (req, res) => {
  const policyId = parseInt(req.params.id);
  if (!Number.isInteger(policyId)) {
    return res.status(400).json({ error: '유효하지 않은 정책 ID' });
  }
  try {
    const target = await gradePolicyRepo.findById(policyId);
    if (!target) {
      return res.status(404).json({ error: '정책을 찾을 수 없습니다.' });
    }
    // TX3: eval_periods 바인딩 해제 + 정책 삭제 (원자 처리), 영향받은 기간 반환
    const appliedPeriods = await gradePolicyRepo.deletePolicy(policyId);
    auditLog(req.user.sub, 'GRADE_POLICY_DELETED', policyId, target.name,
      JSON.stringify({ affected_period_count: appliedPeriods.length, affected_periods: appliedPeriods.map(p => ({ id: p.id, label: `${p.eval_year}년 ${p.period_label}`, was_active: p.is_active === 1 })) }), req.ip);
    for (const p of appliedPeriods) {
      auditLog(req.user.sub, 'EVAL_PERIOD_POLICY_DETACHED', p.id, `${p.eval_year}년 ${p.period_label}`,
        JSON.stringify({ reason: `정책 삭제로 인한 강제 초기화 (deleted policy: ${target.name})`, was_active: p.is_active === 1, deactivated: p.is_active === 1 }), req.ip);
    }
    res.json({
      ok: true,
      affected_period_count: appliedPeriods.length,
      message: appliedPeriods.length > 0
        ? `정책이 삭제되었습니다. 영향받은 ${appliedPeriods.length}개 평가 기간은 비활성화되었습니다.`
        : '정책이 삭제되었습니다.'
    });
  } catch (e) {
    res.status(500).json({ error: '정책 삭제 실패: ' + e.message });
  }
});

app.get('/api/settings/approval-edit', auth, (req, res) => {
  res.json({ enabled: getSetting('approval_edit', '0') === '1' });
});
app.post('/api/settings/approval-edit', auth, adminOnly, (req, res) => {
  setSetting('approval_edit', req.body.enabled ? '1' : '0');
  res.json({ success: true });
});

app.get('/api/admin/audit', auth, adminOnly, async (req, res) => {
  try {
    const { action, limit = 300 } = req.query;
    const logs = await adminRepo.getAuditLogs({ action: action || null, limit: parseInt(limit) });
    res.json(logs);
  } catch(err) {
    console.error('[audit]', err);
    res.status(500).json({ error: err.message });
  }
});

// [PROMPT_44-B] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// app.post('/api/admin/final/:id/unlock', auth, masterOnly, (req, res) => {
//   try {
//     const fe = db.prepare('SELECT * FROM final_evaluations WHERE id=?').get(req.params.id);
//     if (!fe) return res.status(404).json({ error: '최종평가를 찾을 수 없습니다.' });
//     db.prepare(`UPDATE final_evaluations
//       SET locked=0, locked_at=NULL,
//           self_done=0, self_done_at=NULL,
//           mgr_done=0, mgr_done_at=NULL,
//           mgr_approver_id=NULL,
//           second_mgr_done=0, second_mgr_done_at=NULL,
//           second_mgr_id=NULL,
//           final_score=NULL, final_grade=NULL, selected_grade=NULL
//       WHERE id=?`).run(req.params.id);
//     db.prepare(`UPDATE eval_cycles
//       SET phase='final_self', locked=0, updated_at=datetime('now')
//       WHERE id=?`).run(fe.eval_id);
//     db.prepare(`UPDATE final_eval_scores
//       SET mgr_score=NULL, second_mgr_score=NULL
//       WHERE final_id=?`).run(req.params.id);
//     const ev = db.prepare('SELECT user_id, period_label FROM eval_cycles WHERE id=?').get(fe.eval_id);
//     const target = ev ? db.prepare('SELECT name FROM users WHERE id=?').get(ev.user_id) : null;
//     auditLog(req.user.sub, 'FINAL_EVAL_UNLOCKED', fe.eval_id, target?.name,
//       `최종평가 잠금 해제 및 초기화 (${ev?.period_label||''})`, req.ip);
//     res.json({ success: true });
//   } catch(err) {
//     console.error('[unlock]', err);
//     res.status(500).json({ error: err.message });
//   }
// });

// [PROMPT_44-B] Repository Pattern 적용
app.post('/api/admin/final/:id/unlock', auth, masterOnly, async (req, res) => {
  try {
    const fe = await finalEvalRepo.findById(req.params.id);
    if (!fe) return res.status(404).json({ error: '최종평가를 찾을 수 없습니다.' });

    // final_evaluations 초기화 + 별점 초기화 (트랜잭션 내)
    await finalEvalRepo.resetForUnlock(req.params.id);

    // eval_cycles → final_self, 잠금 해제
    await evalCycleRepo.updatePhaseAndLocked(fe.eval_id, 'final_self', 0);

    const ev = await evalCycleRepo.findById(fe.eval_id);
    auditLog(req.user.sub, 'FINAL_EVAL_UNLOCKED', fe.eval_id, ev?.user_name,
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
      goal_id INTEGER,
      round INTEGER DEFAULT 1,
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
    `CREATE TABLE IF NOT EXISTS grade_policies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      created_by  INTEGER REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS grade_policy_criteria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id   INTEGER NOT NULL REFERENCES grade_policies(id) ON DELETE CASCADE,
      grade_code  TEXT NOT NULL,
      grade_name  TEXT NOT NULL,
      min_score   REAL NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
      sort_order  INTEGER NOT NULL,
      description TEXT,
      note        TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(policy_id, grade_code),
      UNIQUE(policy_id, sort_order)
    )`,
    "ALTER TABLE eval_periods ADD COLUMN grade_policy_id INTEGER REFERENCES grade_policies(id)",
    "DROP TABLE IF EXISTS grade_criteria",
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

  // 64A: progress_reports goal_id/round 컬럼 자동 추가 (idempotent)
  const prCols = db.prepare('PRAGMA table_info(progress_reports)').all();
  if (!prCols.find(c => c.name === 'goal_id'))
    db.exec('ALTER TABLE progress_reports ADD COLUMN goal_id INTEGER');
  if (!prCols.find(c => c.name === 'round'))
    db.exec('ALTER TABLE progress_reports ADD COLUMN round INTEGER DEFAULT 1');

  // 등급 정책 시드 (없을 때만 — PROMPT 63A)
  try {
    let policy = db.prepare("SELECT id FROM grade_policies WHERE name='사이냅 표준안'").get();
    if (!policy) {
      const r = db.prepare(
        "INSERT INTO grade_policies(name,description,created_by) VALUES(?,?,?)"
      ).run('사이냅 표준안', '운영 디폴트 등급 정책 (OI=90/EE=80/SC=70/ME=60/PB=50/IR=40)', 1);
      policy = { id: r.lastInsertRowid };
      const criteria = [
        { code:'OI', name:'OI (Outstanding Impact)',    min:90, order:1 },
        { code:'EE', name:'EE (Exceeds Expectations)',  min:80, order:2 },
        { code:'SC', name:'SC (Strong Contributor)',    min:70, order:3 },
        { code:'ME', name:'ME (Meets Expectations)',    min:60, order:4 },
        { code:'PB', name:'PB (Performance Building)', min:50, order:5 },
        { code:'IR', name:'IR (Improvement Required)', min: 0, order:6 },
      ];
      const ins = db.prepare('INSERT OR IGNORE INTO grade_policy_criteria(policy_id,grade_code,grade_name,min_score,sort_order) VALUES(?,?,?,?,?)');
      criteria.forEach(c => ins.run(policy.id, c.code, c.name, c.min, c.order));
      console.log('✅ 디폴트 등급 정책 "사이냅 표준안" 생성 완료');
    }
    // 기존 eval_periods에 정책 자동 바인딩 (grade_policy_id NULL인 것만)
    db.prepare('UPDATE eval_periods SET grade_policy_id=? WHERE grade_policy_id IS NULL').run(policy.id);
  } catch(e) { console.log('[grade policy seed skip]', e.message); }
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
