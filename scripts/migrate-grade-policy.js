/**
 * PROMPT 63A — 등급 정책 시점별 바인딩 마이그레이션
 * - grade_policies, grade_policy_criteria 신규 테이블 생성
 * - eval_periods.grade_policy_id 컬럼 추가
 * - grade_criteria 테이블 DROP
 * 실행: node scripts/migrate-grade-policy.js
 */
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/hrmanage.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found:', DB_PATH);
  process.exit(1);
}

// 자동 백업
const backupDir = path.join(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
const bakPath = path.join(backupDir, `hrmanage_before_63A_${ts}.db`);
fs.copyFileSync(DB_PATH, bakPath);
console.log('Backup created:', bakPath);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF'); // 마이그레이션 중 FK 비활성화

console.log('Starting grade policy migration (PROMPT 63A)...');

try {
  db.exec('BEGIN');

  // 1. grade_policies 신규
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_policies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      created_by  INTEGER REFERENCES users(id)
    )
  `);
  console.log('  [OK] grade_policies table');

  // 2. grade_policy_criteria 신규
  db.exec(`
    CREATE TABLE IF NOT EXISTS grade_policy_criteria (
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
    )
  `);
  console.log('  [OK] grade_policy_criteria table');

  // 3. eval_periods.grade_policy_id 추가 (없으면)
  const cols = db.prepare('PRAGMA table_info(eval_periods)').all();
  if (!cols.find(c => c.name === 'grade_policy_id')) {
    db.exec('ALTER TABLE eval_periods ADD COLUMN grade_policy_id INTEGER REFERENCES grade_policies(id)');
    console.log('  [OK] Added eval_periods.grade_policy_id');
  } else {
    console.log('  [SKIP] eval_periods.grade_policy_id already exists');
  }

  // 4. grade_criteria DROP (있으면)
  db.exec('DROP TABLE IF EXISTS grade_criteria');
  console.log('  [OK] Dropped grade_criteria');

  // 5. 디폴트 정책 생성
  let policy = db.prepare('SELECT id FROM grade_policies WHERE name = ?').get('사이냅 표준안');
  if (!policy) {
    const r = db.prepare(
      "INSERT INTO grade_policies(name, description, created_by) VALUES(?,?,?)"
    ).run('사이냅 표준안', '운영 디폴트 등급 정책 (OI=90/EE=80/SC=70/ME=60/PB=50/IR=40)', 1);
    policy = { id: r.lastInsertRowid };
    console.log('  [OK] Created default policy "사이냅 표준안" id=' + policy.id);
  } else {
    console.log('  [SKIP] Default policy already exists id=' + policy.id);
  }

  // 6. 디폴트 정책 cutoff 시드 (없으면)
  const defaultCriteria = [
    { code: 'OI', name: 'OI (Outstanding Impact)',    min: 90, order: 1 },
    { code: 'EE', name: 'EE (Exceeds Expectations)',  min: 80, order: 2 },
    { code: 'SC', name: 'SC (Strong Contributor)',    min: 70, order: 3 },
    { code: 'ME', name: 'ME (Meets Expectations)',    min: 60, order: 4 },
    { code: 'PB', name: 'PB (Performance Building)',  min: 50, order: 5 },
    { code: 'IR', name: 'IR (Improvement Required)',  min:  0, order: 6 },
  ];
  for (const c of defaultCriteria) {
    db.prepare(
      'INSERT OR IGNORE INTO grade_policy_criteria(policy_id,grade_code,grade_name,min_score,sort_order) VALUES(?,?,?,?,?)'
    ).run(policy.id, c.code, c.name, c.min, c.order);
  }
  console.log('  [OK] Seeded 6 criteria for default policy');

  // 7. 모든 기존 eval_periods에 디폴트 정책 자동 바인딩
  const upd = db.prepare(
    'UPDATE eval_periods SET grade_policy_id = ? WHERE grade_policy_id IS NULL'
  ).run(policy.id);
  console.log(`  [OK] Bound default policy to ${upd.changes} existing eval_periods`);

  db.exec('COMMIT');
  console.log('\nMigration completed successfully.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Migration FAILED — rolled back:', e.message);
  process.exit(1);
} finally {
  db.pragma('foreign_keys = ON');
  db.close();
}
