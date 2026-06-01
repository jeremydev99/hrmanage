/**
 * 64B-FIX: progress_reports 암호화 상태 점검 + 평문 행 재암호화
 *
 * 배경:
 * - PROMPT 64A의 POST 라우터는 정상적으로 encrypt() 호출함
 * - 단, 검증 시 bash curl 테스트가 CP949 인코딩으로 한글 전송
 * - 이로 인해 일부 검증 데이터가 CP949→UTF-8 디코딩 시 깨져 보임
 * - 실제 브라우저 사용은 UTF-8이므로 정상 동작
 *
 * 본 스크립트는:
 * 1. 평문(암호화 안 된) 행이 있으면 재암호화
 * 2. CP949 인코딩 검증 데이터는 삭제 (eval_id 지정 시)
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ENC_SECRET = process.env.ENC_SECRET;
if (!ENC_SECRET) { console.error('ENC_SECRET not found'); process.exit(1); }

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENC_SECRET, 'salt', 32);
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

const ENCRYPTED = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hrmanage.db');

// 백업
const backupDir = path.join(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.copyFileSync(dbPath, path.join(backupDir, `hrmanage_before_64B_FIX_${ts}.db`));
console.log('Backup created.');

const db = new Database(dbPath);

// 1. 평문 행 확인 (AES 형식이 아닌 것)
const allRows = db.prepare("SELECT id, content FROM progress_reports WHERE content IS NOT NULL AND content != ''").all();
const plainRows = allRows.filter(r => !ENCRYPTED.test(r.content));

console.log(`Total rows: ${allRows.length}, Plaintext rows: ${plainRows.length}`);

if (plainRows.length > 0) {
  console.log('Re-encrypting plaintext rows...');
  db.exec('BEGIN');
  try {
    const update = db.prepare('UPDATE progress_reports SET content = ? WHERE id = ?');
    let fixed = 0;
    for (const row of plainRows) {
      update.run(encrypt(row.content), row.id);
      fixed++;
    }
    db.exec('COMMIT');
    console.log(`Fixed ${fixed} plaintext rows.`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Failed:', e.message);
    process.exit(1);
  }
} else {
  console.log('No plaintext rows found. All content is properly encrypted.');
}

// 2. 검증 테스트 데이터 정리 (CP949 인코딩 잔재 — round>=2 for test eval)
const mode = process.argv[2];
if (mode === '--clean-test-data') {
  const testEvalId = process.argv[3];
  if (!testEvalId) {
    console.log('Usage: node migrate-fix-64a-encryption.js --clean-test-data <eval_id>');
    process.exit(1);
  }
  const deleted = db.prepare('DELETE FROM progress_reports WHERE eval_id = ? AND round >= 2').run(testEvalId);
  console.log(`Cleaned ${deleted.changes} test rows from eval_id=${testEvalId} (round>=2)`);
}

db.close();
console.log('Done.');
