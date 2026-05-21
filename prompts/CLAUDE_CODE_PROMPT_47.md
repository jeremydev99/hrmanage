# CLAUDE_CODE_PROMPT_47 — journal_mode 환경변수 분기

## 작업 개요

PROMPT 46 검증 과정에서 Docker + Windows 바인드 마운트의 `SQLITE_IOERR_SHMOPEN` 오류를 해결하기 위해 `server/index.js`의 `journal_mode = WAL` → `DELETE`로 변경한 상태다.

이 변경은 Docker 환경에서는 필수지만, 로컬 직접 실행(`node server/index.js`) 환경에서는 WAL 모드가 성능상 우위다. **환경변수로 분기**하여 두 환경 모두 최적 동작하도록 개선한다.

## 작업 위험도: 하 (1줄 변경 + docker-compose.yml 1줄 추가)

## 사전 확인

현재 `server/index.js`의 해당 라인(26번째 줄 부근):
```js
const db = new Database(DB_PATH);
db.pragma('journal_mode = DELETE');  // ← 현재 상태 (PROMPT 46 검증 시 변경)
db.pragma('foreign_keys = ON');
```

## 작업 절차

### 1. server/index.js 수정

`db.pragma('journal_mode = DELETE');` 라인을 다음과 같이 변경:

```js
// journal_mode: 로컬은 WAL(성능 우위), Docker+Windows 바인드 마운트는 DELETE 필수
// (SQLITE_IOERR_SHMOPEN 회피)
db.pragma(`journal_mode = ${process.env.SQLITE_JOURNAL_MODE || 'WAL'}`);
```

### 2. docker-compose.yml 수정

`environment:` 섹션에 다음 한 줄 추가:

```yaml
environment:
  # ... 기존 환경변수들 ...
  - SQLITE_JOURNAL_MODE=DELETE  # Windows 바인드 마운트 호환 (SQLITE_IOERR_SHMOPEN 회피)
```

정확한 위치는 docker-compose.yml의 기존 `environment:` 섹션 안. 다른 환경변수와 같은 들여쓰기 유지.

### 3. 검증

**A. 로컬 직접 실행 테스트**
```powershell
# Docker 종료 상태에서
node server/index.js
```
- 정상 기동 확인
- WAL 모드 동작 확인:
  ```powershell
  # 별도 PowerShell 창에서
  ls data/
  # hrmanage.db-wal, hrmanage.db-shm 파일이 생성되어 있으면 WAL 모드 정상
  ```

**B. Docker 실행 테스트**
```powershell
# 로컬 node 종료 후
docker-compose up
```
- 정상 기동 확인 (SQLITE_IOERR_SHMOPEN 오류 없음)
- 로그인 화면 진입 확인

### 4. 문서 업데이트

`ClaudeHRM.md` "환경변수 (.env)" 표에 1줄 추가:

| 변수 | 용도 | 기본값 (fallback) |
|------|------|------|
| SQLITE_JOURNAL_MODE | SQLite journal mode (로컬은 WAL, Docker는 DELETE) | WAL |

`ClaudeHRM.md` "최근 개발 이력" 섹션 맨 위에 1줄 추가:
```
| 2026-05-20 | SQLite journal_mode 환경변수 분기 (로컬 WAL, Docker DELETE) (PROMPT 47) | Claude Code |
```

### 5. Git 커밋

```bash
git add server/index.js docker-compose.yml ClaudeHRM.md
git commit -m "SQLite journal_mode 환경변수 분기 (로컬 WAL, Docker DELETE) (PROMPT 47)"
```

**push는 사용자 수동.**

## 작업 완료 체크리스트

- [ ] server/index.js의 journal_mode 라인이 환경변수 분기 형태로 변경
- [ ] docker-compose.yml에 SQLITE_JOURNAL_MODE=DELETE 추가
- [ ] 로컬 직접 실행 시 WAL 모드 정상 동작
- [ ] Docker 실행 시 SQLITE_IOERR_SHMOPEN 오류 없이 정상 기동
- [ ] ClaudeHRM.md 업데이트 (환경변수 표 + 개발 이력)
- [ ] git commit 완료

## 주의사항

- docker-compose.yml의 들여쓰기는 YAML 문법상 엄격함. 기존 environment 항목과 동일한 들여쓰기 유지
- 환경변수 이름은 대문자 + 언더스코어 표준 (SQLITE_JOURNAL_MODE)
- 다른 SQLite pragma는 건드리지 않음 (foreign_keys = ON 유지)
