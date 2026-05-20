# CLAUDE_CODE_PROMPT_BUG-2-FIX.md

## 작업 개요

**버그**: "내 승인 이력"에서 `final_evaluations` 행이 없는 사이클(예: 한개발 2025년 2분기 — approved 단계까지만 진행)은 "최종평가 결과" 섹션이 통째로 표시되지 않아서, **승인한 목표 내용도 함께 사라짐**.

**원인**: 현재 코드 구조에서 목표 섹션이 `h.final_eval ? ... : ''` 외부 조건문 안에 중첩되어 있음. `final_eval`이 null이면 목표 섹션도 함께 안 나옴.

**해결**: 목표 섹션을 외부 조건문 밖으로 빼서 **`goals.length > 0`이면 항상 표시**되도록 구조 재배치. 목표별 별점(자기/1차/2차)은 `final_eval.scores`가 있을 때만 표시.

**파일**: `public/js/pages/approvals.js`

**위험도**: 하 (클라이언트 단일 파일, HTML 구조 재배치)

---

## 수정 내용

### 위치: `renderMyApprovalHistory` 함수의 `history.forEach(h => { ... })` 블록 내부

`card.innerHTML = ...` 끝부분에서, 다음 블록 전체를 찾으세요:

**기존 (검색용)**:

```javascript
        ${h.final_eval ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--o100)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500">최종평가 결과</div>

          <!-- 상태 뱃지 -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <span class="bd ${selfDone?'bd-approved':'bd-draft'}" style="font-size:11px">
              자기평가 ${selfDone?'완료':'미완료'}
            </span>
            <span class="bd ${h.final_eval.mgr_done?'bd-locked':'bd-pending'}" style="font-size:11px">
              1차(${h.final_eval.mgr_approver_name||'상사'}) ${h.final_eval.mgr_done?'완료':'대기'}
            </span>
            ${h.final_eval.second_mgr_done ? `
            <span class="bd bd-locked" style="font-size:11px">
              2차(${h.final_eval.second_mgr_name||''}) 완료
            </span>` : ''}
            ${h.final_eval.final_score != null
              ? `<span style="font-size:18px;font-weight:700;color:var(--o500)">${h.final_eval.final_score}점</span>
                 <span class="bd bd-locked" style="font-size:13px">${h.final_eval.selected_grade||h.final_eval.final_grade||''}</span>`
              : ''}
          </div>

          <!-- 목표별 자기/상사 별점 -->
          ${(h.goals||[]).length && (h.final_eval.scores||[]).length ? `
          <div style="margin-bottom:10px">
            <div style="font-size:11px;color:var(--muted);margin-bottom:5px">목표별 평가</div>
            ${(h.goals||[]).map(g => {
              const sc  = (h.final_eval.scores||[]).find(s=>String(s.goal_id)===String(g.id));
              const ss  = sc?.self_score        || 0;
              const ms  = sc?.mgr_score         || 0;
              const ms2 = sc?.second_mgr_score  || 0;
              if (!ss && !ms && !ms2) return '';
              return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap">
                <span style="flex:1;font-size:12px;font-weight:500">${g.name||''}</span>
                ${ss  ? `<span style="font-size:12px;color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)} ${ss}점</span>`  : ''}
                ${ms  ? `<span style="font-size:12px;color:var(--o500)">1차 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>`   : ''}
                ${ms2 ? `<span style="font-size:12px;color:var(--o700)">2차 ${'★'.repeat(ms2)}${'☆'.repeat(5-ms2)} ${ms2}점</span>` : ''}
              </div>`;
            }).join('')}
          </div>` : ''}

          <!-- 1차 평가자 종합의견 -->
          ${h.final_eval.mgr_note ? `
          <div style="margin-bottom:8px">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">1차(${h.final_eval.mgr_approver_name||'상사'}) 종합의견</div>
            <div style="font-size:12px;padding:8px;background:var(--o50);border-radius:6px;line-height:1.6">${h.final_eval.mgr_note}</div>
          </div>` : ''}

          <!-- 2차 평가자 종합의견 -->
          ${h.final_eval.second_mgr_note ? `
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">2차(${h.final_eval.second_mgr_name||''}) 종합의견</div>
            <div style="font-size:12px;padding:8px;background:var(--o50);border-radius:6px;line-height:1.6">${h.final_eval.second_mgr_note}</div>
          </div>` : ''}
        </div>` : ''}`;
```

**변경 후 (전체 교체)**:

```javascript
        <!-- 승인한 목표 (final_eval 유무와 무관하게 항상 표시) -->
        ${(h.goals||[]).length ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--o100)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500">
            승인한 목표${(h.final_eval?.scores||[]).length ? ' 및 평가' : ''}
          </div>
          ${(h.goals||[]).map(g => {
            const sc  = (h.final_eval?.scores||[]).find(s=>String(s.goal_id)===String(g.id));
            const ss  = sc?.self_score        || 0;
            const ms  = sc?.mgr_score         || 0;
            const ms2 = sc?.second_mgr_score  || 0;
            return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--o50);flex-wrap:wrap">
              <span style="flex:1;font-size:12px;font-weight:500">${g.name||''}
                <span style="font-size:11px;color:var(--muted);margin-left:4px">${g.weight||0}%</span>
                ${g.kpi ? `<span style="font-size:11px;color:var(--muted);margin-left:6px">KPI: ${g.kpi}</span>` : ''}
              </span>
              ${ss  ? `<span style="font-size:12px;color:var(--muted)">자기 ${'★'.repeat(ss)}${'☆'.repeat(5-ss)} ${ss}점</span>`  : ''}
              ${ms  ? `<span style="font-size:12px;color:var(--o500)">1차 ${'★'.repeat(ms)}${'☆'.repeat(5-ms)} ${ms}점</span>`   : ''}
              ${ms2 ? `<span style="font-size:12px;color:var(--o700)">2차 ${'★'.repeat(ms2)}${'☆'.repeat(5-ms2)} ${ms2}점</span>` : ''}
            </div>`;
          }).join('')}
        </div>` : ''}

        <!-- 최종평가 결과 (final_eval 있을 때만) -->
        ${h.final_eval ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--o100)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500">최종평가 결과</div>

          <!-- 상태 뱃지 -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <span class="bd ${selfDone?'bd-approved':'bd-draft'}" style="font-size:11px">
              자기평가 ${selfDone?'완료':'미완료'}
            </span>
            <span class="bd ${h.final_eval.mgr_done?'bd-locked':'bd-pending'}" style="font-size:11px">
              1차(${h.final_eval.mgr_approver_name||'상사'}) ${h.final_eval.mgr_done?'완료':'대기'}
            </span>
            ${h.final_eval.second_mgr_done ? `
            <span class="bd bd-locked" style="font-size:11px">
              2차(${h.final_eval.second_mgr_name||''}) 완료
            </span>` : ''}
            ${h.final_eval.final_score != null
              ? `<span style="font-size:18px;font-weight:700;color:var(--o500)">${h.final_eval.final_score}점</span>
                 <span class="bd bd-locked" style="font-size:13px">${h.final_eval.selected_grade||h.final_eval.final_grade||''}</span>`
              : ''}
          </div>

          <!-- 1차 평가자 종합의견 -->
          ${h.final_eval.mgr_note ? `
          <div style="margin-bottom:8px">
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">1차(${h.final_eval.mgr_approver_name||'상사'}) 종합의견</div>
            <div style="font-size:12px;padding:8px;background:var(--o50);border-radius:6px;line-height:1.6">${h.final_eval.mgr_note}</div>
          </div>` : ''}

          <!-- 2차 평가자 종합의견 -->
          ${h.final_eval.second_mgr_note ? `
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">2차(${h.final_eval.second_mgr_name||''}) 종합의견</div>
            <div style="font-size:12px;padding:8px;background:var(--o50);border-radius:6px;line-height:1.6">${h.final_eval.second_mgr_note}</div>
          </div>` : ''}
        </div>` : ''}`;
```

---

## 주요 변경 요약

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| 목표 섹션 표시 조건 | `final_eval` AND `scores.length` | `goals.length`만 (final_eval 무관) |
| 섹션 위치 | "최종평가 결과" 안에 중첩 | 별도 섹션으로 분리 |
| 섹션 제목 | "목표별 평가" | "승인한 목표" 또는 "승인한 목표 및 평가" (동적) |
| 목표 표시 정보 | 이름 + 별점만 | **이름 + 가중치 + KPI + (별점 있으면 별점)** |
| 별점 옵셔널 체이닝 | `h.final_eval.scores` | `h.final_eval?.scores` (안전) |
| 최종평가 섹션 | 목표 섹션 포함 | 상태 뱃지 + 종합의견만 |

---

## 작업 순서

1. `public/js/pages/approvals.js` 열기
2. `renderMyApprovalHistory` 함수의 `${h.final_eval ? ... : ''}` 블록(맨 마지막)을 통째로 찾기
3. 그 블록을 위 "변경 후" 코드로 교체
4. 저장

---

## 검증 절차

브라우저 Ctrl+F5 후 ceo 로그인 → "내 승인 이력" 탭:

### 시나리오 A — 한개발 2025년 2분기 (final_eval=null)
- ✅ "**승인한 목표**" 섹션 표시 (제목에 "및 평가" 없음)
- ✅ 3건의 목표 표시: 목표명 + 가중치(%) + KPI
- ✅ 별점은 표시 안 됨 (final_eval 없으므로)
- ✅ "최종평가 결과" 섹션 자체가 없음

### 시나리오 B — 오영업 2026년 상반기 (final_done)
- ✅ "**승인한 목표 및 평가**" 섹션 표시
- ✅ 각 목표에 가중치 + KPI + 자기/1차 별점 모두 표시
- ✅ "최종평가 결과" 섹션 — 자기평가 완료(BUG-2 fix), 1차(이대표) 완료, 66.7점/IR, 1차 종합의견 "미흡하지만... 열정은 인정"

### 시나리오 C — 정개발 2026년 상반기 (final_eval 있지만 mgr 미완료)
- ✅ "**승인한 목표 및 평가**" 섹션 표시
- ✅ 각 목표에 자기 별점만 표시 (1차/2차 없음)
- ✅ "최종평가 결과" 섹션 — 자기평가 완료, 1차(이대표) 대기

### 회귀 확인
- ✅ 자기평가 미완료 배지 표시(BUG-2 기존 로직) 정상 유지
- ✅ 의견 수정/승인 취소 버튼 동작 정상

---

## 커밋 메시지

```
fix: 승인 이력에 목표 내용 항상 표시 + KPI/가중치 노출 (final_eval 분리) (BUG-2-FIX)
```

---

## 작업 완료 후

- ClaudeHRM.md "최근 개발 이력" 상단에 1줄 추가:
  ```
  | 2026-05-20 | 승인 이력 화면에 목표 내용 항상 표시 (final_eval 없어도 표시, KPI/가중치 추가) (BUG-2-FIX) | Claude Code |
  ```
