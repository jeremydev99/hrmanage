/**
 * cleanup-broken-reports.js
 * CP949 인코딩 테스트 잔재(깨진 보고) 식별 + 선택적 삭제
 *
 * 사용법:
 *   node scripts/cleanup-broken-reports.js          ← dry-run: 식별만
 *   node scripts/cleanup-broken-reports.js --apply  ← 실제 삭제
 *
 * 깨진 보고 식별 기준:
 *   - 복호화 후 U+FFFD(UTF-8 대체 문자) 포함 → CP949 바이트가 UTF-8로 잘못 해석됨
 *   - 또는 복호화 오류('[복호화 오류]' 반환)
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ENC_SECRET = process.env.ENC_SECRET;
if (!ENC_SECRET) { console.error('ENC_SECRET not found in .env'); process.exit(1); }

const APPLY = process.argv.includes('--apply');

function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const [ivHex, encHex] = text.split(':');
    const key = crypto.scryptSync(ENC_SECRET, 'salt', 32);
    const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    const plainBuf = Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]);
    // UTF-8로 디코드 시 대체 문자(U+FFFD) 포함 여부 확인
    const asUtf8 = plainBuf.toString('utf8');
    return asUtf8;
  } catch {
    return '[복호화 오류]';
  }
}

function isBroken(text) {
  if (!text) return false;
  if (text === '[복호화 오류]') return true;
  // UTF-8 대체 문자 (U+FFFD) 포함 → CP949 바이트가 잘못 해석된 것
  return text.includes('�');
}

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hrmanage.db');
const db = new Database(dbPath);

const ENCRYPTED = /^[0-9a-f]{32}:[0-9a-f]+$/i;

const allRows = db.prepare(`
  SELECT pr.id, pr.eval_id, pr.round, pr.goal_id, pr.content, pr.created_at,
         u.name AS author_name
  FROM progress_reports pr
  LEFT JOIN users u ON u.id = pr.author_id
  WHERE pr.content IS NOT NULL AND pr.content != ''
  ORDER BY pr.eval_id, pr.round, pr.id
`).all();

const broken = [];
for (const row of allRows) {
  if (!ENCRYPTED.test(row.content)) {
    // 암호화 형식이 아닌 것은 별도 표시
    broken.push({ ...row, reason: '평문(미암호화)', decrypted: row.content });
    continue;
  }
  const dec = decrypt(row.content);
  if (isBroken(dec)) {
    broken.push({ ...row, reason: 'CP949/깨진 텍스트', decrypted: dec.substring(0, 50) });
  }
}

console.log(`\n=== cleanup-broken-reports.js ===`);
console.log(`전체 보고 행: ${allRows.length}`);
console.log(`깨진 행(삭제 대상): ${broken.length}`);

if (broken.length === 0) {
  console.log('\n✅ 깨진 보고 없음. 정리 불필요.');
  db.close();
  process.exit(0);
}

console.log('\n--- 삭제 대상 목록 ---');
broken.forEach(r => {
  console.log(`  id=${r.id} | eval_id=${r.eval_id} | round=${r.round} | goal_id=${r.goal_id} | ${r.reason}`);
  console.log(`    preview: ${r.decrypted.replace(/[\r\n]+/g, ' ').substring(0, 60)}`);
});

if (!APPLY) {
  console.log('\n[dry-run] 실제 삭제를 진행하려면 --apply 플래그를 추가하세요:');
  console.log('  node scripts/cleanup-broken-reports.js --apply');
  db.close();
  process.exit(0);
}

// --apply: 자동 백업 + 삭제
const backupDir = path.join(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.copyFileSync(dbPath, path.join(backupDir, `hrmanage_before_cleanup_${ts}.db`));
console.log(`\n✅ 백업 생성: hrmanage_before_cleanup_${ts}.db`);

db.exec('BEGIN');
try {
  const ids = broken.map(r => r.id);
  const ph = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM progress_reports WHERE id IN (${ph})`).run(...ids);
  db.exec('COMMIT');
  console.log(`✅ ${result.changes}개 행 삭제 완료.`);
} catch (e) {
  db.exec('ROLLBACK');
  console.error('삭제 실패 (롤백):', e.message);
  process.exit(1);
}

db.close();
