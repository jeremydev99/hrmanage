/**
 * 운영 평가 데이터 final_score 재계산 스크립트
 *
 * - 기존 final_score(1-6 스케일)를 새 공식(0-100)으로 재계산
 * - selected_grade는 NULL인 경우만 새 등급으로 채움 (관리자 수동 판단 보존)
 * - final_grade는 new final_score 기준 재산출
 * - 실행 전 자동 백업 (data/backups/)
 *
 * 실행: node scripts/recalc-final-scores.js  (서버 정지 후)
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../data/hrmanage.db');

// 백업
const backupDir = path.resolve(__dirname, '../data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `hrmanage.recalc-${ts}.db`);
fs.copyFileSync(DB_PATH, backupPath);
console.log(`✅ 백업: ${backupPath}`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const cats = db.prepare('SELECT id, weight FROM goal_categories WHERE is_active=1').all();
const catWeightMap = new Map(cats.map(c => [c.id, Number(c.weight) || 0]));

function recalcScore(evalId) {
  const rows = db.prepare(`
    SELECT g.weight, g.category_id, fes.mgr_score AS score
    FROM goals g
    JOIN final_eval_scores fes ON fes.goal_id = g.id
    WHERE g.eval_id = ? AND fes.mgr_score IS NOT NULL
  `).all(evalId);
  if (rows.length === 0) return null;

  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category_id)) byCat.set(r.category_id, []);
    byCat.get(r.category_id).push(r);
  }
  let finalScore = 0, usedCatW = 0;
  for (const [catId, gs] of byCat) {
    const catW = catWeightMap.get(catId);
    if (!catW) continue;
    const totalInner = gs.reduce((a, g) => a + g.weight, 0) || 1;
    const catScore = gs.reduce(
      (a, g) => a + (g.score / 5 * 100) * (g.weight / totalInner), 0
    );
    finalScore += catScore * (catW / 100);
    usedCatW += catW;
  }
  if (usedCatW > 0 && usedCatW < 100) finalScore = finalScore * (100 / usedCatW);
  return Math.round(finalScore * 100) / 100;
}

// 디폴트 정책 criteria 로드 (PROMPT 63A — grade_policy_criteria 기반)
function loadDefaultCriteria() {
  const policy = db.prepare("SELECT id FROM grade_policies WHERE name='사이냅 표준안'").get();
  if (!policy) return [];
  return db.prepare(
    'SELECT grade_code, min_score FROM grade_policy_criteria WHERE policy_id=? ORDER BY min_score DESC'
  ).all(policy.id);
}

function scoreToGrade(score, criteria) {
  if (score == null || isNaN(score)) return null;
  if (!criteria || !criteria.length) return null;
  for (const c of criteria) {
    if (score >= c.min_score) return c.grade_code;
  }
  return criteria[criteria.length - 1]?.grade_code || null;
}

const defaultCriteria = loadDefaultCriteria();
const evals = db.prepare('SELECT eval_id FROM final_evaluations').all();
let updated = 0;

const tx = db.transaction(() => {
  for (const ev of evals) {
    const newScore = recalcScore(ev.eval_id);
    if (newScore === null) continue;
    const newGrade = scoreToGrade(newScore, defaultCriteria);
    db.prepare(`
      UPDATE final_evaluations
      SET final_score = ?, final_grade = ?,
          selected_grade = COALESCE(selected_grade, ?)
      WHERE eval_id = ?
    `).run(newScore, newGrade, newGrade, ev.eval_id);
    updated++;
  }
});
tx();
console.log(`✅ 재계산 완료: ${updated}건`);
db.close();
