const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hrmanage.db');

const backupDir = path.join(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `hrmanage_before_64A_${ts}.db`);
fs.copyFileSync(dbPath, backupPath);
console.log(`Backup created: ${backupPath}`);

const db = new Database(dbPath);

console.log('Starting progress_reports goal_id/round migration...');

db.exec('BEGIN');
try {
  const cols = db.prepare('PRAGMA table_info(progress_reports)').all();

  if (!cols.find(c => c.name === 'goal_id')) {
    db.exec('ALTER TABLE progress_reports ADD COLUMN goal_id INTEGER');
    console.log('  Added progress_reports.goal_id');
  } else {
    console.log('  progress_reports.goal_id already exists');
  }

  if (!cols.find(c => c.name === 'round')) {
    db.exec('ALTER TABLE progress_reports ADD COLUMN round INTEGER DEFAULT 1');
    console.log('  Added progress_reports.round');
  } else {
    console.log('  progress_reports.round already exists');
  }

  const updated = db.prepare('UPDATE progress_reports SET round = 1 WHERE round IS NULL').run();
  console.log(`  Set round=1 for ${updated.changes} existing rows`);

  db.exec('COMMIT');
  console.log('Migration completed successfully.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Migration failed:', e);
  process.exit(1);
}
