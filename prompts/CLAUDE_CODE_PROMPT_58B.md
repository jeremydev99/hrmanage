# CLAUDE_CODE_PROMPT_58B — 전체 조직 분석: 활성/비활성 기간 선택 옵션 추가

## 작업 개요

PROMPT 58(전체 조직 AI 요약·통계)에 사용자 요구 추가 사항 반영:

> "평가기간을 활성기간만/비활성기간포함 선택해서 평가기간 조회 가능하도록. 비활성은 분석할 필요 없을 수 있음."

**기본 동작 변경**:
- 현재: 모든 평가 기간(활성+비활성)이 드롭다운에 표시됨
- 변경 후: 기본은 활성 기간만, 사용자가 "비활성 포함" 옵션 선택 시 모두 표시

**권한별 옵션 노출**:
- master/admin: "비활성 포함" 체크박스 노출 (감사·통계 목적)
- 조직장 (일반 user with leader): **노출 안 함** (활성 기간만 분석 가능)
- 일반 user: 탭 자체 미표시 (PROMPT 58 정책 유지)

PROMPT 58은 아직 푸시 안 됐으므로 본 보강 작업과 통합하여 한 번에 푸시.

## 작업 위험도: 중 (기능 확장, 스키마 변경 없음)
## 자동 푸시 여부: ⚠️ 회색 지대 — PROMPT 58 검증 + 본 추가 시나리오 통과 후 통합 푸시

## 사전 확인

PROMPT 58 작업 결과 다음 파일 확인:
- `server/index.js`의 `/api/perf/org-tree`, `/api/perf/quarterly-trend`, `/api/perf/grade-distribution`, `/api/perf/org-ai-summary` 라우터
- `public/js/app.js`의 `renderOrgViewHTML()`, `loadOrgAnalysis()` 등

## 기능 명세

### 1. 백엔드 API 4개 보강

다음 4개 라우터에 `include_inactive` 쿼리 파라미터 추가:

- `GET /api/perf/org-tree`
- `GET /api/perf/quarterly-trend`
- `GET /api/perf/grade-distribution`
- `POST /api/perf/org-ai-summary`

**파라미터 사양**:
- 이름: `include_inactive`
- 값: `'true'` 또는 `'false'` (문자열 비교)
- 기본값: `false` (활성 기간만)
- 권한 체크: master/admin이 아닌 사용자가 `include_inactive=true` 보내면 무시하고 강제로 `false` 처리 (silent)

**구현 패턴** (각 라우터에 적용):

```javascript
const includeInactive = String(req.query.include_inactive) === 'true';
const isAdmin = ['master','admin'].includes(req.user?.role);
const effectiveIncludeInactive = isAdmin && includeInactive; // 비관리자는 강제 false

// 평가 기간 조회 시
const periodFilter = effectiveIncludeInactive 
  ? '' 
  : 'AND ep.is_active = 1';
  
const periods = db.prepare(`
  SELECT * FROM eval_periods ep
  WHERE ep.period_type = 'quarter'
  ${periodFilter}
  ORDER BY ep.eval_year, ep.period_label
`).all();
```

**감사 로그**: 비관리자가 `include_inactive=true` 시도 시 audit_log 기록 권장:
```javascript
if (!isAdmin && includeInactive) {
  auditLog(req.user.sub, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null,
    `비관리자의 비활성 기간 포함 시도 차단`, req.ip);
}
```

### 2. 프론트엔드 — UI 추가

#### 2-1. 기간 선택 영역에 체크박스 추가

`renderOrgViewHTML()` (또는 해당 페이지 렌더링 함수)의 기간 선택 UI 다음에 체크박스 추가:

```html
<!-- 권한별 분기 -->
<!-- master/admin만 표시 -->
<div class="form-group" id="includeInactiveGroup" 
     style="display:${isAdmin ? 'block' : 'none'};">
  <label class="checkbox-label">
    <input type="checkbox" id="includeInactiveCheck">
    <span>비활성 기간 포함</span>
  </label>
  <small class="hint">기본은 활성 기간만 표시. 비활성 포함 시 모든 분기 표시 (관리자 전용).</small>
</div>
```

체크박스 위치: 기간 선택 드롭다운과 "조직 깊이" 선택 사이.

#### 2-2. 기간 드롭다운 동적 갱신

체크박스 변경 시 기간 드롭다운 다시 로드 (활성/비활성 기간 토글):

```javascript
document.getElementById('includeInactiveCheck')?.addEventListener('change', async (e) => {
  await loadAvailablePeriods(e.target.checked);
  // 기간 드롭다운 옵션 갱신
});

async function loadAvailablePeriods(includeInactive) {
  // 기존 /api/eval-periods 호출에 include_inactive 파라미터 추가
  // 또는 클라이언트 측에서 이미 받은 모든 기간을 필터링
  // (구현 선택: 클라이언트 필터링이 단순)
}
```

#### 2-3. 분석 로드 시 파라미터 전달

`loadOrgAnalysis()` 함수에서 API 호출 시 `include_inactive` 파라미터 추가:

```javascript
async function loadOrgAnalysis() {
  const includeInactive = document.getElementById('includeInactiveCheck')?.checked || false;
  
  const orgTree = await API.get(`/perf/org-tree?...&include_inactive=${includeInactive}`);
  const trend = await API.get(`/perf/quarterly-trend?...&include_inactive=${includeInactive}`);
  // ... 모든 4개 API 호출에 동일하게 추가
}
```

### 3. 기간 드롭다운 — 비활성 기간 시각 구분

체크박스로 비활성 포함 시 드롭다운에 시각 구분:

```html
<option value="period_id" data-inactive="true">
  2024년 1분기 (비활성)
</option>
<option value="period_id">
  2025년 1분기
</option>
```

비활성 기간은 "(비활성)" 라벨 추가, 회색 처리 권장.

### 4. /api/eval-periods 라우터 보강 (선택)

이미 있는 `/api/eval-periods` 라우터에도 `include_inactive` 파라미터 지원 추가:

```javascript
app.get('/api/eval-periods', auth, (req, res) => {
  const includeInactive = String(req.query.include_inactive) === 'true';
  const isAdmin = ['master','admin'].includes(req.user?.role);
  const effective = isAdmin && includeInactive;
  
  const filter = effective ? '' : 'WHERE is_active = 1';
  const periods = db.prepare(`SELECT * FROM eval_periods ${filter} ORDER BY eval_year, period_label`).all();
  res.json(periods);
});
```

기존 API 호출 코드는 `include_inactive` 미전달 시 활성만 반환 → 호환성 유지.

### 5. 권한 처리 명세

| 사용자 | 체크박스 표시 | 비활성 포함 가능 |
|--------|------------|----------------|
| master | ✅ | ✅ |
| admin | ✅ | ✅ |
| user (조직장) | ❌ | ❌ (강제 활성만) |
| user (일반) | 탭 자체 미표시 | - |

## 작업 절차

### 1. 백엔드 작업

각 라우터에 `include_inactive` 파라미터 처리 추가:

```javascript
// org-tree
app.get('/api/perf/org-tree', auth, (req, res) => {
  // ... 기존 권한 체크 ...
  
  const includeInactive = String(req.query.include_inactive) === 'true';
  const isAdmin = ['master','admin'].includes(req.user?.role);
  const effectiveIncludeInactive = isAdmin && includeInactive;
  
  if (!isAdmin && includeInactive) {
    auditLog(req.user.sub, 'PERF_INACTIVE_ACCESS_BLOCKED', null, null,
      `비관리자의 비활성 기간 포함 시도 (org-tree)`, req.ip);
  }
  
  // 기간 필터링에 적용
  const periodFilter = effectiveIncludeInactive 
    ? '' 
    : `AND period_id IN (SELECT id FROM eval_periods WHERE is_active = 1)`;
  
  // ... 기존 로직에 periodFilter 적용 ...
});
```

같은 패턴을 4개 라우터 모두 적용.

### 2. 프론트엔드 작업

1. `renderOrgViewHTML()` 에 체크박스 추가 (권한별 조건부 렌더)
2. 체크박스 change 이벤트로 기간 드롭다운 갱신
3. 모든 API 호출에 `include_inactive` 파라미터 추가
4. 비활성 기간 시각 구분 (옵션)

### 3. 검증 시나리오 5개 추가

기존 PROMPT 58의 10개 시나리오 + 본 보강 5개:

11. **master 로그인 → 체크박스 표시 확인**
12. **admin(hr2) 로그인 → 체크박스 표시 확인**
13. **dev1(조직장) 로그인 → 체크박스 미표시 확인**
14. **master 비활성 포함 체크 → 비활성 기간 드롭다운 추가 표시**
15. **dev1이 API 호출에 `include_inactive=true` 강제 전달 → 활성만 반환 + audit_log 차단 기록**

검증 명령 예시:
```bash
# 시나리오 15 — 조직장이 강제로 비활성 요청
curl -X GET "http://localhost:3000/api/perf/org-tree?eval_period_ids=1,2&include_inactive=true" \
  -H "Authorization: Bearer <dev1-token>"
# → 응답에 활성 기간만 포함 확인
# → audit_logs에 PERF_INACTIVE_ACCESS_BLOCKED 기록 확인
sqlite3 data/hrmanage.db "SELECT * FROM audit_logs WHERE action='PERF_INACTIVE_ACCESS_BLOCKED' ORDER BY id DESC LIMIT 5;"
```

### 4. 문서 업데이트

`ClaudeHRM.md` 최근 개발 이력 1줄 추가:
```
| 2026-05-27 | 전체 조직 분석에 활성/비활성 기간 선택 옵션 추가 (PROMPT 58B, master/admin 전용) (PROMPT 58B) | Claude Code |
```

`ClaudeHRM.md` API 엔드포인트 4개 라우터에 `?include_inactive` 파라미터 표시:
```
GET    /api/perf/org-tree (?include_inactive)         전체 조직 트리 + 통계
GET    /api/perf/quarterly-trend (?include_inactive)  분기별 평균 추이 
GET    /api/perf/grade-distribution (?include_inactive)  등급 분포 시계열
POST   /api/perf/org-ai-summary (?include_inactive)   전체 조직 AI 요약
```

### 5. Git 커밋 (PROMPT 58 + 58B 통합)

PROMPT 58 작업분이 아직 푸시 안 된 상태이므로, 본 보강을 별도 커밋으로 추가 후 두 커밋 한 번에 푸시:

```bash
# 기존 PROMPT 58 작업은 이미 commit 된 상태 가정
git add server/ public/ ClaudeHRM.md
git commit -m "전체 조직 분석에 활성/비활성 기간 선택 옵션 추가 (master/admin 전용) (PROMPT 58B)"

# 사용자 검증 후 두 커밋 통합 푸시
# git push origin feat/prisma-orm
```

## 작업 완료 체크리스트

- [ ] 4개 API 라우터에 `include_inactive` 파라미터 처리 추가
- [ ] 비관리자의 강제 시도 시 audit_log 기록
- [ ] `/api/eval-periods` 라우터 보강 (선택)
- [ ] 체크박스 UI 추가 (권한별 조건부 표시)
- [ ] 체크박스 change 시 기간 드롭다운 갱신
- [ ] 4개 API 호출에 파라미터 전달
- [ ] 비활성 기간 시각 구분 (옵션, "(비활성)" 라벨)
- [ ] 시나리오 11~15 모두 통과
- [ ] V1 + PROMPT 58 시나리오 1~10 회귀 확인
- [ ] ClaudeHRM.md 갱신
- [ ] git commit 완료
- [ ] **PROMPT 58 + 58B 통합 푸시 (사용자 검증 + 승인 후)**

## 주의사항

- **권한 체크 silent**: 비관리자가 `include_inactive=true` 전달해도 에러 응답 대신 활성만 반환 (사용자 경험 자연스럽게)
- **audit_log 기록 필수**: 비관리자의 강제 시도는 audit_log에 반드시 기록 (보안 추적)
- **기본값 활성만**: 호환성 유지, 기존 동작 영향 없음
- **HRPRIVACY 원칙 4**: "비활성 기간 시 부하·상사 차단" 부분 적용. 조직장도 활성만 분석 가능 → 원칙 준수
- **ISSUE-002 부분 해결**: PRIVACY_ISSUES.md ISSUE-002의 일부 해결 (전체 점검은 별도 PROMPT)
- **자동 푸시 금지**: 회색 지대 정책 유지, 통합 푸시는 사용자 검증 후

## PRIVACY_ISSUES.md 갱신 (옵션)

본 작업으로 ISSUE-002의 일부가 해결됐다고 볼 수 있음. 그러나 전체 점검은 아직 안 됐으므로 ISSUE-002는 "진행 중" 유지. 향후 별도 PROMPT로 전수 점검.

본 작업은 ISSUE-002에 다음 진행 메모 추가 가능:
```markdown
**진행 이력**:
- 2026-05-27: 전체 조직 분석 API 4개에서 비관리자의 비활성 기간 접근 차단 (PROMPT 58B). 다른 조회 API(`/api/evals`, `/api/final/*`, `/api/feedback/*`)는 별도 점검 필요.
```

이는 PRIVACY_ISSUES.md를 직접 수정하지 말고, 본 PROMPT 완료 후 사용자가 직접 추가 또는 다음 PROMPT로 일괄 정리 가능.

## 다음 단계 (이번 작업 이후)

- PROMPT 58 + 58B 통합 푸시
- PROMPT 59 시드 데이터 진행
- (선택) PROMPT 58-차트X축 이슈 분석 — 시드 후 X축에 "상반기/하반기" 잔존 여부 확인
- ISSUE-002 전수 점검 PROMPT (별도, 후순위)
