# PROMPT 37: 목표 카테고리 삭제 UI 버그 수정 (일괄 저장 방식)

> 작성일: 2026-05-14
> 브랜치: feat/prisma-orm
> 선행 작업: PROMPT 36-1 ~ 36-8 완료 + B-1(.gitignore 정리) push 완료
> 위험도: 낮음 (클라이언트 단일 파일 수정)
> 예상 소요: 20분 이내
> 영향 범위: `public/js/pages/admin.js` 의 카테고리 관리 영역만

---

## 배경 — 버그 진단 결과

PROMPT 36-6 검증 중 발견된 버그를 분석한 결과:

**현상**: 관리자 → 목표 카테고리 관리 탭에서 카테고리 삭제 버튼 클릭 시 화면에서는 사라지지만, 페이지 새로고침하면 다시 나타남.

**원인 위치**: `public/js/pages/admin.js`

**근본 원인**:
1. `delEditCat()` 함수가 메모리 배열(`_editCats`)에서만 제거하고 **DELETE API를 호출하지 않음**
2. `saveCats()` 함수는 추가/수정만 처리하고 **삭제된 항목은 추적조차 안 함**

**서버 측 상태**: `DELETE /api/categories/:id` 라우터는 정상 동작 (server/index.js 382줄, 36-6에서 Repository Pattern 적용됨). 서버 수정 불필요.

---

## 수정 방향 — 옵션 B (일괄 저장 방식)

현재 패턴 유지:
- 추가/수정/삭제는 모두 메모리에서 임시 처리
- "저장" 버튼 누를 때 일괄 API 호출
- 가중치 합계 100% 검증과 일관된 흐름

**핵심 변경**:
1. `_deletedCatIds` 배열 신규 추가 — 삭제 대상 ID 추적
2. `delEditCat()` — 기존 카테고리 삭제 시 `_deletedCatIds`에 ID 추가
3. `saveCats()` — 추가/수정 후 `_deletedCatIds` 순회하며 DELETE API 호출
4. `renderAdmCat()` — 진입 시 `_deletedCatIds` 초기화

---

## 작업 지시

### 수정 파일

`public/js/pages/admin.js` 만 수정. 다른 파일은 건드리지 않음.

---

### 1단계 — 전역 상태 변수 추가

`let _editCats = [];` 줄 바로 아래에 다음 한 줄 추가:

```javascript
let _editCats = [];
let _deletedCatIds = [];   // ← 신규 추가: 삭제 대상 카테고리 ID 추적
```

---

### 2단계 — `renderAdmCat()` 수정

진입 시 `_deletedCatIds`를 초기화하도록 변경.

**기존**:
```javascript
async function renderAdmCat() {
  const el = document.getElementById('adm-cat'); if(!el)return;
  _editCats = JSON.parse(JSON.stringify(App.categories));
  rebuildCatUI();
}
```

**변경 후**:
```javascript
async function renderAdmCat() {
  const el = document.getElementById('adm-cat'); if(!el)return;
  _editCats = JSON.parse(JSON.stringify(App.categories));
  _deletedCatIds = [];   // ← 추가: 진입할 때마다 초기화
  rebuildCatUI();
}
```

---

### 3단계 — `delEditCat()` 수정

기존 카테고리(DB에 존재 = `cat.id` 있음)일 때만 삭제 ID 추적. 신규 추가 항목(`cat.id` 없음)은 그냥 메모리에서 제거.

**기존**:
```javascript
function delEditCat(i) { 
  if(_editCats.length<=1){
    showAlert('최소 1개 이상 필요합니다.','orange');
    return;
  } 
  _editCats.splice(i,1); 
  rebuildCatUI(); 
}
```

**변경 후**:
```javascript
function delEditCat(i) { 
  if(_editCats.length<=1){
    showAlert('최소 1개 이상 필요합니다.','orange');
    return;
  } 
  const removed = _editCats[i];
  // 기존 카테고리(DB 존재)인 경우 삭제 대상으로 기록
  if (removed && removed.id) {
    _deletedCatIds.push(removed.id);
  }
  _editCats.splice(i,1);
  markDirty();   // ← 추가: 미저장 변경 표시
  rebuildCatUI(); 
}
```

---

### 4단계 — `saveCats()` 수정

추가/수정 후 삭제 처리 추가. 에러 메시지도 명확하게.

**기존**:
```javascript
async function saveCats() {
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  if (totalW !== 100) { 
    showAlert('가중치 합계가 100%여야 합니다. 현재: '+totalW+'%','orange'); 
    return; 
  }
  try {
    for (const cat of _editCats) {
      if (cat.id) await API.put(`/categories/${cat.id}`, cat);
      else await API.post('/categories', cat);
    }
    App.categories = await API.get('/categories');
    clearDirty();
    showAlert('카테고리가 저장되었습니다!','green');
    renderAdmCat();
  } catch(e) { showAlert(e.message,'red'); }
}
```

**변경 후**:
```javascript
async function saveCats() {
  const totalW = _editCats.reduce((a,c)=>a+Number(c.weight),0);
  if (totalW !== 100) { 
    showAlert('가중치 합계가 100%여야 합니다. 현재: '+totalW+'%','orange'); 
    return; 
  }
  try {
    // 1. 추가/수정 처리
    for (const cat of _editCats) {
      if (cat.id) await API.put(`/categories/${cat.id}`, cat);
      else await API.post('/categories', cat);
    }
    // 2. 삭제 처리 (신규 추가)
    for (const id of _deletedCatIds) {
      await API.delete(`/categories/${id}`);
    }
    _deletedCatIds = [];   // 처리 완료 후 초기화
    // 3. 목록 갱신
    App.categories = await API.get('/categories');
    clearDirty();
    showAlert('카테고리가 저장되었습니다!','green');
    renderAdmCat();
  } catch(e) { 
    showAlert(e.message,'red'); 
  }
}
```

---

### 5단계 — `API.delete()` 메서드 존재 확인

작업 전 `public/js/api.js`에 `API.delete()` 함수가 있는지 확인. 없으면 추가 작업 필요.

```bash
# 확인 명령
findstr /n /c:"delete" public\js\api.js
```

대부분의 경우 fetch wrapper에 이미 구현되어 있을 것이다. 없으면 다음을 `api.js`에 추가:

```javascript
delete(path) {
  return this._fetch(path, { method: 'DELETE' });
}
```

(실제 구조는 기존 `get`, `post`, `put` 메서드와 동일한 패턴으로 작성)

---

## 검증 절차

### 1. 서버 실행
```powershell
node server\index.js
```

### 2. 브라우저 검증

`ceo@synapsoft.com` / `admin1234` 로그인 → 관리자 → 목표 카테고리 관리.

| 시나리오 | 동작 | 기대 결과 |
|----------|------|-----------|
| A. 신규 추가 항목 즉시 삭제 | "+카테고리 추가" → 바로 "삭제" | 메모리에서만 제거 (DELETE API 호출 안 됨, 정상) |
| B. 기존 카테고리 삭제 시도 | "삭제" 클릭 | 화면에서 사라짐, **저장 버튼 누르기 전까지는 DB 변화 없음** |
| C. 삭제 후 저장 | B 후 "저장" | DELETE API 호출됨, 새로고침해도 안 보임 |
| D. 삭제 후 저장 안 함 | B 후 새로고침 | 삭제했던 카테고리가 다시 나타남 (롤백 정상) |
| E. 가중치 100% 미달 | 삭제 후 합계 90% 상태에서 저장 | "가중치 합계가 100%여야 합니다" 에러, 삭제 안 됨 |

### 3. F12 Network 탭 확인

시나리오 C 진행 시 Network 탭에서 다음 호출이 발생해야 함:
```
DELETE /api/categories/숫자 → 200 OK
GET /api/categories → 200 OK
```

### 4. F12 Console 탭 확인

에러 빨간색 메시지 없는지.

---

## 완료 후 처리

### 1. 변경사항 확인
```powershell
git status
git diff public\js\pages\admin.js
```

변경된 파일은 `public/js/pages/admin.js` 하나만 보여야 함 (`api.js`에 `delete` 추가가 필요했다면 그것도).

### 2. ClaudeHRM.md 갱신

"최근 개발 이력" 표 상단에 한 줄 추가:
```
| 2026-05-14 | PROMPT 37: 목표 카테고리 삭제 UI 버그 수정 (일괄 저장 방식, _deletedCatIds 추적) | Claude Code |
```

### 3. 커밋 + 푸시
```powershell
git add public/js/pages/admin.js
git add ClaudeHRM.md
git commit -m "fix(admin): 목표 카테고리 삭제 UI 버그 수정 (PROMPT 37)"
git push
```

(만약 `api.js`에도 변경이 있었다면 그것도 함께 add)

---

## 작업 시 주의사항

- **서버 코드는 건드리지 않음** — `DELETE /api/categories/:id` 라우터는 이미 정상 동작 중
- **다른 함수는 건드리지 않음** — `addEditCat()`, `updEditCat()`, `rebuildCatUI()` 등 동작 그대로 유지
- **순서 중요** — `saveCats()`에서 PUT/POST 먼저, DELETE 나중. 가중치 검증 통과 후에만 실제 DB 변경 발생
- **롤백 가능성** — 저장 누르지 않고 페이지 떠나면 모든 변경 사항이 사라지는 것이 정상 동작 (현재 패턴과 일치)
- **`markDirty()` 호출** — 삭제도 미저장 변경이므로 dirty 표시 필요

---

## 다음 작업 예고

PROMPT 37 완료 후 진행 방향 후보:

| 후보 | 비고 |
|------|------|
| **38**: Organization Repository 어댑터 | 36 시리즈의 다음 어댑터 |
| **38**: EvalCycle Repository 어댑터 | 본격 비즈니스 객체 시작 |
| **38**: 그동안 발견된 다른 버그 정리 | 미해결 이슈 청산 |

PROMPT 37 검증 끝나면 결정하겠음.
