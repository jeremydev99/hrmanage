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
