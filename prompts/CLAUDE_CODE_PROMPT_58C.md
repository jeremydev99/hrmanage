# CLAUDE_CODE_PROMPT_58C — 전체 조직 AI 요약: 3단계 요약 옵션 (요약 / 상세 요약 / 상세 분석)

## 작업 개요

PROMPT 58의 AI 요약이 10줄 제약으로 너무 단순화되어 분석 깊이가 부족. 사용자가 분석 목적에 맞춰 3단계 중 선택 가능하도록 확장.

**사용자 결정 사항 (2026-05-27)**:
- **3단계 사양**: 요약(10줄) / 상세 요약(20~30줄) / 상세 분석(50줄~)
- **UI 형태**: 드롭다운 (요약 수준 선택) + 시간 안내
- **결과 표시**: 단계 전환 시 화면 다시 그림 (누적 안 함)
- **캐싱**: 세션 메모리 캐싱 (같은 기간·옵션·단계 재요청 시 LLM 호출 안 함)

본 작업은 PROMPT 58B 이후 진행. PROMPT 58·58B·58C·59 통합 푸시.

## 작업 위험도: 중 (LLM 프롬프트 변경, 캐싱 로직 추가)
## 자동 푸시 여부: ⚠️ 회색 지대 — 검증 후 통합 푸시

## 기능 명세

### 1. 3단계 요약 사양

#### 1단계 — `summary` (요약, 기본값)

**용도**: 빠른 파악, 대시보드  
**길이**: 10줄 이내 (현재와 동일)  
**LLM 응답 시간**: 약 3~5초  
**구조**:
```
- 전체 요약 (1~2줄): 평균·완료율·전반 상태
- 강점 부서 (1~2줄, 최대 2개)
- 약점 부서 (1~2줄, 최대 2개)
- 트렌드 (1~2줄)
- 액션 아이템 (1~2줄, 최대 2개)
```

#### 2단계 — `detailed` (상세 요약, 신규)

**용도**: 임원·인사팀 회의 자료  
**길이**: 20~30줄  
**LLM 응답 시간**: 약 8~15초  
**구조**: 1단계의 모든 항목 + 다음 추가:
```
- 전체 요약 (2~4줄, 회사 규모·평가 완료율·전반 상태 확장)
- 강점 부서 (2~3개, 각 2~3줄)
- 약점 부서 (2~3개, 각 2~3줄)
- 부서별 상세 (신규): 각 본부·팀의 평균·등급·완료율·강점·개선점
- 분기별 상세 트렌드 (2~3줄): 변화 추이 + 원인 추정
- 액션 아이템 (3~5개, 각 실행 난이도·기간 표시)
```

#### 3단계 — `comprehensive` (상세 분석, 신규)

**용도**: 이사회 보고·연말 평가·전략 수립 자료  
**길이**: 50줄~  
**LLM 응답 시간**: 약 20~40초  
**구조**: 2단계의 모든 항목 + 다음 추가:
```
- 위험 요소 (신규): 잠재 위험 (낮은 완료율·등급 양극화·하락 부서 등)
- 향후 전망 (신규): 현재 트렌드 기반 다음 분기 예측
- 부서간 비교 분석 (신규): 본부 간·팀 간 격차 분석
- 장기 권고 사항 (신규): 인사 제도·평가 시스템 개선 제안
- 강점·약점 부서 각 3~5개로 확장
- 액션 아이템 5~10개로 확장
```

### 2. 백엔드 — `POST /api/perf/org-ai-summary` 보강

#### 2-1. 파라미터 추가

기존 파라미터 + `level` 추가:

```json
{
  "period_ids": "1,2,3,4,5,6,7,8",
  "max_depth": 3,
  "include_inactive": false,
  "level": "summary"  // 신규: "summary" | "detailed" | "comprehensive"
}
```

- 기본값: `"summary"` (1단계)
- 유효 값 외 입력 시: 400 에러 또는 기본값으로 강제

#### 2-2. AI 프롬프트 분기

각 단계별로 다른 프롬프트 사용:

```javascript
function buildAIPrompt(level, stats) {
  const baseData = formatStatsForPrompt(stats); // 공통 데이터 부분
  
  if (level === 'summary') {
    return buildSummaryPrompt(baseData);
  } else if (level === 'detailed') {
    return buildDetailedPrompt(baseData);
  } else if (level === 'comprehensive') {
    return buildComprehensivePrompt(baseData);
  }
  // fallback
  return buildSummaryPrompt(baseData);
}
```

#### 2-3. summary 프롬프트 (기존)

PROMPT 58에서 작성된 그대로 유지. 응답 JSON 구조:
```json
{
  "overall": "...",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "trend": "...",
  "actions": ["...", "..."]
}
```

#### 2-4. detailed 프롬프트 (신규)

```
당신은 회사의 인사 데이터 분석 전문가입니다. 임원과 인사팀이 의사결정 회의 자료로 활용할 수 있도록 평가 통계를 분석해주세요.

## 분석 대상
(공통 데이터 부분)

## 요청 사항
다음 7개 항목으로 작성, 총 20~30줄:

1. 전체 요약 (2~4줄): 회사 규모, 평가 완료율, 전반적 상태
2. 강점 부서 (2~3개, 각 2~3줄): 각 부서의 강점 근거 포함
3. 약점 부서 (2~3개, 각 2~3줄): 각 부서의 약점 근거 + 우려 사항
4. 부서별 상세: 각 본부·팀별 평균·등급·완료율, 강점 1줄, 개선점 1줄
5. 분기별 상세 트렌드 (2~3줄): 변화 추이 + 원인 추정
6. 액션 아이템 (3~5개): 각 항목에 실행 난이도(상/중/하)·예상 기간 표시

응답은 JSON 형식:
{
  "overall": "...",
  "strengths": [{"dept": "개발본부", "detail": "..."}, ...],
  "weaknesses": [{"dept": "영업본부", "detail": "..."}, ...],
  "department_details": [
    {"name": "개발본부", "avg_score": 4.5, "grade": "A", "completion_rate": 95, "strength": "...", "improvement": "..."},
    ...
  ],
  "trend": "...",
  "actions": [
    {"action": "...", "difficulty": "중", "duration": "1개월"},
    ...
  ]
}
```

#### 2-5. comprehensive 프롬프트 (신규)

```
당신은 회사의 인사 데이터 분석 전문가입니다. 이사회 보고와 연말 평가, 전략 수립 자료로 활용할 수 있도록 평가 통계를 심층 분석해주세요.

## 분석 대상
(공통 데이터 부분)

## 요청 사항
다음 10개 항목으로 작성, 총 50줄 이상:

1. 전체 요약 (3~5줄): 회사 규모, 평가 완료율, 전반적 상태, 주요 변화
2. 강점 부서 (3~5개, 각 3~5줄): 정량·정성 근거 포함
3. 약점 부서 (3~5개, 각 3~5줄): 우려 사항·영향 범위
4. 부서별 상세: 각 본부·팀의 평균·등급·완료율·강점·개선점·트렌드
5. 분기별 상세 트렌드 (3~5줄): 변화 추이·원인 추정·시장 환경 고려
6. 위험 요소 (3~5개): 평가 완료율 저조, 등급 양극화, 하락 부서, 미평가 등
7. 향후 전망 (3~5줄): 현재 트렌드 기반 다음 1~2분기 예측
8. 부서간 비교 분석: 본부 간 격차, 팀 간 격차 분석
9. 장기 권고 사항 (5~7개): 인사 제도·평가 시스템 개선 제안
10. 액션 아이템 (5~10개): 각 항목 우선순위·예상 효과·실행 난이도·기간

응답은 JSON 형식:
{
  "overall": "...",
  "strengths": [{"dept": "...", "detail": "...", "quantitative": "...", "qualitative": "..."}, ...],
  "weaknesses": [{"dept": "...", "detail": "...", "concern_scope": "..."}, ...],
  "department_details": [...],
  "trend": "...",
  "risks": ["...", "..."],
  "forecast": "...",
  "comparison": "...",
  "long_term_recommendations": ["...", "..."],
  "actions": [
    {"action": "...", "priority": "상", "expected_effect": "...", "difficulty": "중", "duration": "3개월"},
    ...
  ]
}
```

#### 2-6. 토큰 한도 설정

LLM 호출 시 `max_tokens` 또는 응답 길이 한도 조정:

```javascript
const tokenLimits = {
  summary: 800,         // 약 10줄 이내
  detailed: 2500,       // 약 20~30줄
  comprehensive: 5000,  // 약 50줄~
};

const apiPayload = {
  model: process.env.LLM_MODEL,
  messages: [{ role: 'user', content: prompt }],
  max_tokens: tokenLimits[level] || tokenLimits.summary,
  stream: false,
};
```

사내 LLM이 `max_tokens` 지원하는지 확인 필요. 미지원 시 응답 길이는 LLM 자연 종료에 의존.

#### 2-7. 감사 로그

기존 `ORG_AI_SUMMARY_GENERATED` 액션에 level 정보 포함:
```javascript
auditLog(req.user.sub, 'ORG_AI_SUMMARY_GENERATED', null, null,
  `전체 조직 AI 요약 생성 (level=${level}, periods=${period_ids})`, req.ip);
```

### 3. 프론트엔드 — UI 추가

#### 3-1. 드롭다운 추가

`renderOrgViewHTML()` 의 "AI 요약 생성" 버튼 영역을 다음으로 교체:

```html
<div class="ai-summary-controls">
  <div class="form-inline">
    <label>요약 수준:</label>
    <select id="aiSummaryLevel">
      <option value="summary" selected>요약 (10줄, 약 5초)</option>
      <option value="detailed">상세 요약 (20~30줄, 약 15초)</option>
      <option value="comprehensive">상세 분석 (50줄+, 약 30초)</option>
    </select>
    <button id="generateAISummaryBtn" onclick="generateOrgAISummary()">AI 요약 생성</button>
  </div>
  <small class="hint">상세 분석은 LLM 응답 시간이 더 길어집니다.</small>
</div>
```

#### 3-2. 생성 버튼 클릭 시 처리

```javascript
async function generateOrgAISummary() {
  const level = document.getElementById('aiSummaryLevel').value;
  const periodIds = currentPeriodIds; // 현재 선택된 기간
  const maxDepth = currentMaxDepth;
  const includeInactive = document.getElementById('includeInactiveCheck')?.checked || false;
  
  // 세션 캐시 키
  const cacheKey = `${periodIds}|${maxDepth}|${includeInactive}|${level}`;
  
  // 1. 캐시 확인
  if (window._aiSummaryCache && window._aiSummaryCache[cacheKey]) {
    renderAISummary(window._aiSummaryCache[cacheKey], level);
    return;
  }
  
  // 2. 로딩 표시
  const btn = document.getElementById('generateAISummaryBtn');
  btn.disabled = true;
  btn.textContent = '생성 중... (' + estimatedTime(level) + ')';
  
  try {
    // 3. API 호출
    const result = await API.post('/perf/org-ai-summary', {
      period_ids: periodIds,
      max_depth: maxDepth,
      include_inactive: includeInactive,
      level: level,
    });
    
    // 4. 캐시 저장
    if (!window._aiSummaryCache) window._aiSummaryCache = {};
    window._aiSummaryCache[cacheKey] = result;
    
    // 5. 렌더링
    renderAISummary(result, level);
  } catch (err) {
    alert('AI 요약 생성에 실패했습니다: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 요약 생성';
  }
}

function estimatedTime(level) {
  if (level === 'summary') return '약 5초';
  if (level === 'detailed') return '약 15초';
  if (level === 'comprehensive') return '약 30초';
  return '잠시만 기다려주세요';
}
```

#### 3-3. 렌더링 함수 — 단계별 분기

```javascript
function renderAISummary(result, level) {
  if (level === 'summary') {
    renderSummaryLevel(result);
  } else if (level === 'detailed') {
    renderDetailedLevel(result);
  } else if (level === 'comprehensive') {
    renderComprehensiveLevel(result);
  }
}

function renderSummaryLevel(result) {
  // 기존 PROMPT 58의 렌더링 그대로
  const html = `
    <div class="ai-section">
      <h4>📊 전체 요약</h4>
      <p>${result.structured?.overall || result.summary}</p>
    </div>
    <div class="ai-section">
      <h4>💪 강점 부서</h4>
      <ul>${result.structured?.strengths?.map(s => `<li>${s}</li>`).join('') || ''}</ul>
    </div>
    <!-- ... 나머지 -->
  `;
  document.getElementById('aiSummaryResult').innerHTML = html;
}

function renderDetailedLevel(result) {
  // 상세 요약 렌더링 (부서별 상세 테이블 추가)
  const html = `
    <div class="ai-section">
      <h4>📊 전체 요약</h4>
      <p>${result.structured?.overall}</p>
    </div>
    <div class="ai-section">
      <h4>💪 강점 부서</h4>
      ${result.structured?.strengths?.map(s => 
        `<div class="dept-item"><strong>${s.dept}</strong>: ${s.detail}</div>`
      ).join('') || ''}
    </div>
    <div class="ai-section">
      <h4>📋 부서별 상세</h4>
      <table class="dept-detail-table">
        <thead>
          <tr><th>부서</th><th>평균</th><th>등급</th><th>완료율</th><th>강점</th><th>개선점</th></tr>
        </thead>
        <tbody>
          ${result.structured?.department_details?.map(d => 
            `<tr>
              <td>${d.name}</td>
              <td>${d.avg_score}</td>
              <td>${d.grade}</td>
              <td>${d.completion_rate}%</td>
              <td>${d.strength}</td>
              <td>${d.improvement}</td>
            </tr>`
          ).join('') || ''}
        </tbody>
      </table>
    </div>
    <!-- ... 나머지 (트렌드, 액션 with 난이도) -->
  `;
  document.getElementById('aiSummaryResult').innerHTML = html;
}

function renderComprehensiveLevel(result) {
  // 상세 분석 렌더링 (위험 요소·향후 전망·비교 분석·장기 권고 추가)
  // ... 모든 신규 섹션 포함
}
```

### 4. JSON 파싱 안전성

LLM이 JSON 미준수 시:
- summary: 기존 fallback 로직 유지
- detailed/comprehensive: 부분 파싱 시도, 누락된 필드는 빈 값으로 표시

```javascript
function safeParse(jsonText, level) {
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    // JSON 파싱 실패 → 기본 구조 + raw 텍스트
    return {
      overall: jsonText,
      strengths: [],
      weaknesses: [],
      trend: '',
      actions: [],
      ...(level !== 'summary' && {
        department_details: [],
      }),
      ...(level === 'comprehensive' && {
        risks: [],
        forecast: '',
        comparison: '',
        long_term_recommendations: [],
      }),
    };
  }
}
```

## 작업 절차

### 1. 백엔드 작업

1. `buildAIPrompt(level, stats)` 분기 함수 작성
2. `buildSummaryPrompt`, `buildDetailedPrompt`, `buildComprehensivePrompt` 3개 함수 작성
3. `max_tokens` 또는 응답 길이 한도 설정 (사내 LLM 지원 여부 확인)
4. `/api/perf/org-ai-summary` 라우터에 `level` 파라미터 처리 추가
5. 감사 로그에 level 정보 포함

### 2. 프론트엔드 작업

1. 드롭다운 UI 추가 (요약 수준 선택)
2. 시간 안내 텍스트 표시
3. 생성 버튼 클릭 시 캐시 확인 후 API 호출
4. 응답 받으면 세션 캐시에 저장
5. 단계별 렌더링 함수 작성 (3개)
6. JSON 파싱 안전 처리

### 3. CSS 추가

```css
.ai-summary-controls .form-inline {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ai-summary-controls select {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.dept-detail-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
}
.dept-detail-table th, .dept-detail-table td {
  padding: 8px;
  border-bottom: 1px solid #eee;
  text-align: left;
}
.dept-item {
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
}
.ai-section {
  margin-bottom: 16px;
}
.ai-section h4 {
  margin-bottom: 6px;
  font-size: 15px;
}
```

### 4. 검증 시나리오

PROMPT 58·58B의 기존 시나리오 + 본 보강 6개:

16. **summary 수준 선택 → 10줄 이내 응답**: 기존 동작 확인
17. **detailed 수준 선택 → 20~30줄 응답, 부서별 상세 테이블 표시**
18. **comprehensive 수준 선택 → 50줄+ 응답, 위험·전망·비교·장기 권고 섹션 표시**
19. **같은 옵션·다른 단계 연속 호출 → 매번 LLM 호출 (서로 다른 캐시 키)**
20. **같은 옵션·같은 단계 재호출 → 캐시 사용, LLM 호출 안 함** (네트워크 탭에서 확인)
21. **드롭다운 시간 안내 표시 확인**: 각 단계 옆에 예상 시간 표시

### 5. 문서 업데이트

`ClaudeHRM.md` 최근 개발 이력 1줄 추가:
```
| 2026-05-27 | 전체 조직 AI 요약 3단계 옵션 추가 (요약/상세 요약/상세 분석) (PROMPT 58C) | Claude Code |
```

`ClaudeHRM.md` API 엔드포인트:
```
POST   /api/perf/org-ai-summary (?level=summary|detailed|comprehensive)  전체 조직 AI 요약 (3단계)
```

### 6. Git 커밋

```bash
git add server/ public/ ClaudeHRM.md
git commit -m "전체 조직 AI 요약 3단계 옵션 추가 (요약/상세요약/상세분석, 세션 캐싱) (PROMPT 58C)"
# 푸시 보류 — PROMPT 58 + 58B + 58C + 59 통합 푸시
```

## 작업 완료 체크리스트

- [ ] `buildAIPrompt` 분기 함수 작성
- [ ] 3개 프롬프트 함수 작성 (summary/detailed/comprehensive)
- [ ] max_tokens 또는 응답 길이 한도 설정
- [ ] `/api/perf/org-ai-summary` 라우터 보강
- [ ] 감사 로그에 level 포함
- [ ] 드롭다운 UI + 시간 안내
- [ ] 세션 캐시 저장·조회 로직
- [ ] 3개 단계별 렌더링 함수
- [ ] JSON 파싱 안전 처리
- [ ] CSS 추가
- [ ] 시나리오 16~21 통과
- [ ] V1 + PROMPT 58·58B 회귀 확인
- [ ] ClaudeHRM.md 갱신
- [ ] git commit 완료
- [ ] **PROMPT 58·58B·58C·59 통합 푸시 (사용자 검증 후)**

## 주의사항

- **사내 LLM 능력 확인**: `max_tokens` 지원 여부, 50줄 이상 응답 가능 여부 확인. 만약 불가능하면 comprehensive를 30줄로 축소 또는 분할 호출.
- **JSON 파싱 실패 시 fallback**: detailed/comprehensive는 구조 복잡 → 부분 파싱 실패 가능성 더 높음. 안전 처리 필수.
- **세션 캐시는 메모리만**: 새로고침 시 사라지는 것 정상. 사용자에게는 추가 안내 불필요.
- **드롭다운 기본값 summary**: 기존 사용자 경험 유지.
- **comprehensive는 LLM 부하 큼**: 사이냅 자체 LLM 사용량 모니터링 권장. 외부 영업 시점에 사용량 제한 정책 검토.

## 다음 단계 (이번 작업 이후)

- PROMPT 58·58B·58C·59 통합 푸시
- ISSUE-005 (P0) 점검·보완 — 부하의 상사 평가 의견 열람 절대 차단
- INFRA-2A-4 PostgreSQL 로컬 마이그레이션
