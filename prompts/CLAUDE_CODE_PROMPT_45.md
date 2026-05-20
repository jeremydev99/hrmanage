# CLAUDE_CODE_PROMPT_45.md

## 작업 개요

`progress_reports` 테이블(중간 보고)을 Repository Pattern으로 전환. `report_files`(첨부파일)는 같은 Repository에서 함께 다룸(Aggregate Root 패턴).

**라우터 3개 전환**:
| 라우터 | 변경 |
|--------|------|
| `GET /api/reports/:evalId` | 중간 보고 목록 + 첨부파일 메타데이터 (file_data 제외) |
| `POST /api/reports/:evalId` | 중간 보고 + 첨부파일 일괄 저장 (트랜잭션) |
| `GET /api/files/:fileId` | 파일 다운로드 (file_data base64) |

**암호화**: `progress_reports.content` (AES-256-CBC, PROMPT 40-A/41/43과 동일 패턴)

**파일 처리**: base64 그대로 SQLite에 저장 (기존 동작 100% 유지). MinIO/Object Storage 이관은 INFRA-2에서.

**권한 보강**: 적용 안 함 (기존 동작 유지, 별도 BUG로 분리).

**위험도**: 중하 (트랜잭션 단순, PROMPT 41/43과 유사 패턴)

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `server/repositories/ProgressReportRepository.js` | **신규** — 인터페이스 |
| `server/adapters/prisma/PrismaProgressReportRepository.js` | **신규** — 구현 (암호화 + 트랜잭션) |
| `server/config/repository-factory.js` | `getProgressReportRepository()` 추가 |
| `server/index.js` | reports 라우터 3개 전환 (기존 코드 주석 처리, 롤백 대비) |

---

## (1) ProgressReportRepository.js — 신규 파일

`server/repositories/ProgressReportRepository.js`:

```javascript
/**
 * 중간 보고(ProgressReport) Repository 인터페이스
 *
 * 다루는 테이블:
 *   - progress_reports (content는 AES-256-CBC 암호화)
 *   - report_files     (파일 메타데이터 + base64 데이터)
 *
 * Aggregate Root 패턴: report와 첨부파일을 한 단위로 다룸
 */
class ProgressReportRepository {
  /**
   * 특정 평가 사이클의 중간 보고 전체 목록 조회 (최신순)
   * 응답에는 첨부파일 메타데이터만 포함 (file_data 제외 — 다운로드 시 별도 조회)
   * @param {number} evalId
   * @returns {Promise<Array>} [{id, eval_id, author_id, author_name, content, created_at, updated_at, files: [{id, file_name, file_type, file_size, created_at}]}]
   */
  async findByEvalId(evalId) {
    throw new Error('Not implemented');
  }

  /**
   * 중간 보고 작성 (첨부파일 일괄 저장, 트랜잭션)
   * @param {Object} data - { eval_id, author_id, content, files: [{name, data, type, size}] }
   * @returns {Promise<number>} 새로 생성된 progress_report.id
   */
  async create(data) {
    throw new Error('Not implemented');
  }

  /**
   * 파일 단건 조회 (다운로드용 — file_data 포함)
   * @param {number} fileId
   * @returns {Promise<{file_name, file_data, file_type}|null>}
   */
  async findFileById(fileId) {
    throw new Error('Not implemented');
  }
}

module.exports = ProgressReportRepository;
```

---

## (2) PrismaProgressReportRepository.js — 신규 파일

`server/adapters/prisma/PrismaProgressReportRepository.js`:

```javascript
const ProgressReportRepository = require('../../repositories/ProgressReportRepository');
const crypto = require('crypto');

class PrismaProgressReportRepository extends ProgressReportRepository {
  constructor(prismaClient, encSecret) {
    super();
    if (!prismaClient) throw new Error('PrismaProgressReportRepository requires a prismaClient');
    if (!encSecret)    throw new Error('PrismaProgressReportRepository requires encSecret');
    this.prisma = prismaClient;
    this.encSecret = encSecret;
  }

  _encrypt(text) {
    if (!text) return '';
    const iv  = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encSecret, 'salt', 32);
    const c   = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  }

  _decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
      const [ivHex, encHex] = text.split(':');
      const key = crypto.scryptSync(this.encSecret, 'salt', 32);
      const d   = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
      return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
    } catch { return '[복호화 오류]'; }
  }

  // ProgressReport row를 snake_case로 평탄화 + content 복호화
  _flatten(report, authorName, files) {
    if (!report) return null;
    const { evalId, authorId, content, ...rest } = report;
    return {
      ...rest,
      eval_id:     evalId,
      author_id:   authorId,
      author_name: authorName || null,
      content:     content ? this._decrypt(content) : '',
      files:       files || [],
    };
  }

  // ReportFile row를 snake_case로 평탄화 (메타데이터만, file_data 제외)
  _flattenFileMeta(f) {
    if (!f) return null;
    const { fileName, fileData, ...rest } = f;
    return {
      ...rest,
      file_name: fileName,
      // file_type, file_size는 schema에서 이미 snake_case (필드명 그대로)
    };
  }

  async findByEvalId(evalId) {
    // 1. 보고서 목록 조회
    const reports = await this.prisma.progressReport.findMany({
      where: { evalId: Number(evalId) },
      orderBy: { created_at: 'desc' }
    });
    if (!reports.length) return [];

    // 2. 작성자 이름 한 번에 조회
    const authorIds = [...new Set(reports.map(r => r.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true }
    });
    const authorMap = Object.fromEntries(authors.map(u => [u.id, u.name]));

    // 3. 첨부파일 메타데이터 한 번에 조회 (file_data 제외)
    const reportIds = reports.map(r => r.id);
    const allFiles = await this.prisma.reportFile.findMany({
      where: { reportId: { in: reportIds } },
      select: {
        id: true,
        reportId: true,
        fileName: true,
        file_type: true,
        file_size: true,
        created_at: true,
      }
    });

    // 4. 보고서별 파일 그룹핑
    const filesByReport = {};
    allFiles.forEach(f => {
      if (!filesByReport[f.reportId]) filesByReport[f.reportId] = [];
      filesByReport[f.reportId].push(this._flattenFileMeta(f));
    });

    // 5. 평탄화 + 결합
    return reports.map(r => this._flatten(r, authorMap[r.authorId], filesByReport[r.id] || []));
  }

  async create(data) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. 보고서 생성 (content 암호화)
      const created = await tx.progressReport.create({
        data: {
          evalId:   Number(data.eval_id),
          authorId: Number(data.author_id),
          content:  this._encrypt(data.content || ''),
        }
      });

      // 2. 첨부파일 일괄 저장
      for (const f of (data.files || [])) {
        await tx.reportFile.create({
          data: {
            reportId:  created.id,
            fileName:  f.name,
            fileData:  f.data,
            file_type: f.type,
            file_size: f.size,
          }
        });
      }

      return created.id;
    });
  }

  async findFileById(fileId) {
    const f = await this.prisma.reportFile.findUnique({
      where: { id: Number(fileId) }
    });
    if (!f) return null;
    return {
      file_name: f.fileName,
      file_data: f.fileData,
      file_type: f.file_type,
    };
  }
}

module.exports = PrismaProgressReportRepository;
```

---

## (3) repository-factory.js — 메서드 추가

`server/config/repository-factory.js`의 기존 패턴(다른 Repository factory) 그대로 따라 추가:

```javascript
// 파일 상단에 require 추가 (다른 Prisma 어댑터 require들 옆에)
const PrismaProgressReportRepository = require('../adapters/prisma/PrismaProgressReportRepository');

// 파일 하단의 module.exports 직전에 함수 추가
function getProgressReportRepository() {
  const adapter = process.env.DATA_ADAPTER || 'prisma';
  if (adapter === 'prisma') {
    const prisma = getPrismaClient();
    const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
    return new PrismaProgressReportRepository(prisma, encSecret);
  }
  throw new Error(`Unknown DATA_ADAPTER: ${adapter}`);
}

// module.exports에 추가
module.exports = {
  // 기존 항목들...
  getProgressReportRepository,
};
```

**주의**: `getPrismaClient()`나 다른 헬퍼 이름이 기존 코드와 다를 수 있음. 다른 Repository(예: FinalEvaluation) factory 함수 그대로 따라하면 됨.

---

## (4) server/index.js — 라우터 3개 전환

파일 상단의 require 영역에 추가 (다른 Repository require 근처):

```javascript
const { getProgressReportRepository } = require('./config/repository-factory');
```

그리고 적절한 위치(다른 Repository 인스턴스 옆)에:

```javascript
const progressReportRepo = getProgressReportRepository();
```

### 4-1. GET /api/reports/:evalId

**기존 코드 (검색용)**:

```javascript
// 중간 보고 목록 조회
app.get('/api/reports/:evalId', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '없음' });
    const isAdmin   = ['master','admin'].includes(req.user.role);
    const isOwner   = String(ev.user_id) === String(req.user.sub);
    const chain = [];
    let cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev.user_id));
    while (cur?.manager_id && chain.length < 5) {
      chain.push(String(cur.manager_id));
      cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(cur.manager_id));
    }
    const isApprover = chain.includes(String(req.user.sub));
    if (!isAdmin && !isOwner && !isApprover)
      return res.status(403).json({ error: '권한 없음' });

    const reports = db.prepare(
      'SELECT r.*, u.name as author_name FROM progress_reports r JOIN users u ON r.author_id=u.id WHERE r.eval_id=? ORDER BY r.created_at DESC'
    ).all(req.params.evalId).map(r => ({
      ...r,
      content: r.content ? decrypt(r.content) : '',
      files: db.prepare('SELECT id,file_name,file_type,file_size,created_at FROM report_files WHERE report_id=?').all(r.id),
    }));
    res.json(reports);
  } catch(err) {
    console.error('[reports GET]', err);
    res.status(500).json({ error: err.message });
  }
});
```

**변경 후**: 위 라우터를 통째로 주석 처리하고 다음 코드로 교체:

```javascript
// [PROMPT_45] Repository Pattern 전환 — 기존 코드 주석 처리 (롤백 대비)
// (위에 주석 처리한 기존 코드 — 생략)

// [PROMPT_45] Repository Pattern 적용
app.get('/api/reports/:evalId', auth, async (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev) return res.status(404).json({ error: '없음' });
    const isAdmin = ['master','admin'].includes(req.user.role);
    const isOwner = String(ev.user_id) === String(req.user.sub);
    const chain = [];
    let cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(ev.user_id));
    while (cur?.manager_id && chain.length < 5) {
      chain.push(String(cur.manager_id));
      cur = db.prepare('SELECT manager_id FROM users WHERE id=?').get(String(cur.manager_id));
    }
    const isApprover = chain.includes(String(req.user.sub));
    if (!isAdmin && !isOwner && !isApprover)
      return res.status(403).json({ error: '권한 없음' });

    const reports = await progressReportRepo.findByEvalId(req.params.evalId);
    res.json(reports);
  } catch(err) {
    console.error('[reports GET]', err);
    res.status(500).json({ error: err.message });
  }
});
```

**참고**: 권한 체크 부분(manager_id 재귀 탐색)은 그대로 유지. 이건 EvalCycle/User 영역이라 PROMPT 45 범위 밖. 향후 별도 정리.

### 4-2. POST /api/reports/:evalId

**기존 코드 (검색용)**:

```javascript
// 중간 보고 작성
app.post('/api/reports/:evalId', auth, (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '본인만 작성 가능' });
    if (!['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(400).json({ error: '목표 확정 후 작성 가능합니다.' });
    const { content, files } = req.body;
    const r = db.prepare(
      "INSERT INTO progress_reports(eval_id,author_id,content,created_at) VALUES(?,?,?,datetime('now'))"
    ).run(req.params.evalId, req.user.sub, encrypt(content || ''));
    // 파일 저장 (base64)
    (files || []).forEach(f => {
      db.prepare(
        'INSERT INTO report_files(report_id,file_name,file_data,file_type,file_size) VALUES(?,?,?,?,?)'
      ).run(r.lastInsertRowid, f.name, f.data, f.type, f.size);
    });
    auditLog(req.user.sub, 'REPORT_SUBMITTED', ev.user_id, null,
      `중간 보고 작성 (${ev.period_label||''})`, req.ip);
    res.json({ id: r.lastInsertRowid });
  } catch(err) {
    console.error('[reports POST]', err);
    res.status(500).json({ error: err.message });
  }
});
```

**변경 후**:

```javascript
// [PROMPT_45] Repository Pattern 적용
app.post('/api/reports/:evalId', auth, async (req, res) => {
  try {
    const ev = db.prepare('SELECT * FROM eval_cycles WHERE id=?').get(req.params.evalId);
    if (!ev || String(ev.user_id) !== String(req.user.sub))
      return res.status(403).json({ error: '본인만 작성 가능' });
    if (!['approved','final_self','final_mgr_pending','final_done'].includes(ev.phase))
      return res.status(400).json({ error: '목표 확정 후 작성 가능합니다.' });

    const { content, files } = req.body;
    const reportId = await progressReportRepo.create({
      eval_id:   req.params.evalId,
      author_id: req.user.sub,
      content:   content || '',
      files:     files || [],
    });
    auditLog(req.user.sub, 'REPORT_SUBMITTED', ev.user_id, null,
      `중간 보고 작성 (${ev.period_label||''})`, req.ip);
    res.json({ id: reportId });
  } catch(err) {
    console.error('[reports POST]', err);
    res.status(500).json({ error: err.message });
  }
});
```

### 4-3. GET /api/files/:fileId

**기존 코드 (검색용)**:

```javascript
// 파일 다운로드
app.get('/api/files/:fileId', auth, (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM report_files WHERE id=?').get(req.params.fileId);
    if (!f) return res.status(404).json({ error: '파일 없음' });
    res.json({ file_name: f.file_name, file_data: f.file_data, file_type: f.file_type });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

**변경 후**:

```javascript
// [PROMPT_45] Repository Pattern 적용
app.get('/api/files/:fileId', auth, async (req, res) => {
  try {
    const f = await progressReportRepo.findFileById(req.params.fileId);
    if (!f) return res.status(404).json({ error: '파일 없음' });
    res.json(f);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 작업 순서

1. `server/repositories/ProgressReportRepository.js` 신규 생성
2. `server/adapters/prisma/PrismaProgressReportRepository.js` 신규 생성
3. `server/config/repository-factory.js`에 `getProgressReportRepository()` 추가 + require + exports
4. `server/index.js`:
   - 상단에 require + 인스턴스 추가
   - 라우터 3개 주석 처리 + 새 라우터 작성
5. 서버 재시작 (`docker-compose restart` 또는 `node server/index.js`)

---

## 검증 절차

### 사전 준비
```powershell
cd C:\claudeprojects\hrmanage
Copy-Item data\hrmanage.db data\hrmanage.db.bak-45
```

### 시나리오 A — 기존 중간 보고 조회 (복호화 검증)
콘솔에서 (어떤 사용자든 본인 또는 승인자가 볼 수 있는 사이클로):

```javascript
// 본인 사이클의 중간 보고 목록
const evs = await API.get('/evals');
const myEv = evs[0];  // 또는 적절한 eval_id 선택
const reports = await API.get(`/reports/${myEv.id}`);
console.log('보고서 수:', reports.length);
console.log('첫 보고서:', reports[0]);
```

기대:
- `content`가 원문 한글로 표시 (복호화 정상)
- `author_name`이 정상 표시
- `files` 배열에 메타데이터만 (file_data 없음)

### 시나리오 B — 신규 중간 보고 작성
```javascript
// 본인 사이클(approved 이상)에 보고 작성
const r = await API.post(`/reports/${myEv.id}`, {
  content: 'PROMPT 45 검증용 중간 보고 — 한글/특수문자!@# 테스트 🎯',
  files: [],
});
console.log('생성된 보고서 ID:', r.id);

// 즉시 재조회로 복호화 확인
const reports2 = await API.get(`/reports/${myEv.id}`);
const justCreated = reports2.find(x => x.id === r.id);
console.log('방금 작성한 보고서 content:', justCreated.content);
```

기대: 작성한 문자열과 글자 단위로 일치 (이모지 포함).

### 시나리오 C — 첨부파일 다운로드 (기존 데이터 있을 시)
```javascript
const evs = await API.get('/evals');
// 첨부파일이 있는 사이클 찾기
for (const ev of evs) {
  const rs = await API.get(`/reports/${ev.id}`);
  const withFiles = rs.find(r => r.files && r.files.length > 0);
  if (withFiles) {
    const fileMeta = withFiles.files[0];
    console.log('파일 메타:', fileMeta);
    const file = await API.get(`/files/${fileMeta.id}`);
    console.log('파일 본문 (앞 100자):', file.file_data?.slice(0, 100));
    console.log('file_name:', file.file_name);
    console.log('file_type:', file.file_type);
    break;
  }
}
```

기대: file_data가 base64 문자열로 정상 반환.

### 시나리오 D — 권한 거부
```javascript
// 본인이 아닌 다른 사용자 사이클의 보고서 조회 시도
// (적절한 다른 evalId로 시도)
try {
  await API.get('/reports/999');  // 존재 안 하거나 권한 없는 evalId
} catch (e) {
  console.log('권한 거부 OK:', e.message);
}
```

기대: 403 또는 404.

### 시나리오 E — 회귀 방지
- 기존 중간 보고가 보이는 모든 화면 (마이 평가 > 중간 보고, 피드백 화면 등)에서 정상 표시 확인
- 첨부파일 다운로드 버튼 동작 확인

---

## 주의 사항

- **트랜잭션**: `create` 메서드는 보고서 + 모든 첨부파일을 한 트랜잭션으로 묶음. 한 파일이라도 실패하면 전체 롤백.
- **첨부파일 file_data 제외 조회**: `findByEvalId`에서 `select`로 file_data 명시 제외. 대용량 파일이 응답에 포함되어 페이지 로딩 느려지는 문제 방지.
- **외래키 Number 변환**: evalId, authorId, fileId 모두 Number() 변환 (PROMPT 38 후속에서 학습한 교훈).
- **schema의 file_type, file_size**: 다른 필드와 달리 이미 snake_case 그대로(`file_type`, `file_size`)이므로 `@map` 없이 그대로 사용.

---

## 커밋 메시지

```
refactor: ProgressReport Repository 어댑터 도입 (content 암호화, files Aggregate Root, 트랜잭션) (PROMPT 45)
```

---

## 작업 완료 후

- ClaudeHRM.md "최근 개발 이력" 상단에 1줄 추가:
  ```
  | 2026-05-20 | ProgressReport Repository 어댑터 (content 암호화, files Aggregate Root, 트랜잭션, 라우터 3개 전환) (PROMPT 45) | Claude Code |
  ```
- ClaudeHRM.md "핵심 설계 원칙" 18번 항목(Repository Pattern)에 ProgressReport 추가
- ClaudeHRM.md "Repository Pattern 적용 도메인" 카운트 7개 → 8개로 갱신
