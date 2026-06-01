const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hrmanage.db');

const backupDir = path.join(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `hrmanage_before_63C_${ts}.db`);
fs.copyFileSync(dbPath, backupPath);
console.log(`Backup created: ${backupPath}`);

const db = new Database(dbPath);

console.log('Starting activation_blocked_at migration...');

db.exec('BEGIN');
try {
  const cols = db.prepare('PRAGMA table_info(eval_periods)').all();
  if (!cols.find(c => c.name === 'activation_blocked_at')) {
    db.exec('ALTER TABLE eval_periods ADD COLUMN activation_blocked_at TEXT');
    console.log('  Added eval_periods.activation_blocked_at');
  } else {
    console.log('  eval_periods.activation_blocked_at already exists');
  }

  db.exec('COMMIT');
  console.log('Migration completed successfully.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', e);
  process.exit(1);
}
