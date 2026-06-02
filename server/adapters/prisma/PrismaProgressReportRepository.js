const ProgressReportRepository = require('../../repositories/ProgressReportRepository');
const crypto = require('crypto');
const { _toStr } = require('./_helpers');

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

  // 명시적 매핑 — SQLite(snake_case 필드) / PostgreSQL(camelCase 필드) 양쪽 호환
  _flatten(report, authorName, files) {
    if (!report) return null;
    return {
      id:          report.id,
      eval_id:     report.evalId,
      author_id:   report.authorId,
      content:     report.content ? this._decrypt(report.content) : '',
      created_at:  _toStr(report.createdAt ?? report.created_at),
      updated_at:  _toStr(report.updatedAt ?? report.updated_at),
      author_name: authorName || null,
      files:       files || [],
    };
  }

  // 첨부파일 메타데이터 평탄화 (file_data 제외)
  _flattenFileMeta(f) {
    if (!f) return null;
    return {
      id:            f.id,
      report_id:     f.reportId,
      feedback_id:   f.feedbackId,
      final_eval_id: f.finalEvalId,
      file_name:     f.fileName,
      file_type:     f.fileType  ?? f.file_type,
      file_size:     f.fileSize  ?? f.file_size,
      created_at:    _toStr(f.createdAt ?? f.created_at),
    };
  }

  async findByEvalId(evalId) {
    const reports = await this.prisma.progressReport.findMany({
      where: { evalId: Number(evalId) },
      orderBy: { created_at: 'desc' }
    });
    if (!reports.length) return [];

    const authorIds = [...new Set(reports.map(r => r.authorId))];
    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true }
    });
    const authorMap = Object.fromEntries(authors.map(u => [u.id, u.name]));

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

    const filesByReport = {};
    allFiles.forEach(f => {
      if (!filesByReport[f.reportId]) filesByReport[f.reportId] = [];
      filesByReport[f.reportId].push(this._flattenFileMeta(f));
    });

    return reports.map(r => this._flatten(r, authorMap[r.authorId], filesByReport[r.id] || []));
  }

  // [INFRA-A5] items 배열 + round 지원 — tx 캡슐화 (Prisma $transaction + rawUnsafe for round/goalId)
  async createMulti({ eval_id, author_id, items, overall, round, files }) {
    const newRound = Number(round) || 1;
    return await this.prisma.$transaction(async (tx) => {
      const insertedIds = [];

      const insertRow = async (content, goalId) => {
        const rows = await tx.$queryRawUnsafe(
          'INSERT INTO progress_reports (eval_id, author_id, content, goal_id, round) VALUES (?, ?, ?, ?, ?) RETURNING id',
          Number(eval_id), Number(author_id), this._encrypt(content), goalId || null, newRound
        );
        const id = rows[0]?.id;
        if (id) insertedIds.push(id);
      };

      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item.content?.trim()) continue;
          await insertRow(item.content.trim(), item.goal_id || null);
        }
        if (overall?.trim()) await insertRow(overall.trim(), null);
      } else if (overall?.trim()) {
        await insertRow(overall.trim(), null);
      }

      if (insertedIds.length === 0) throw new Error('보고 내용이 비어있습니다.');

      const fileList = Array.isArray(files) ? files : [];
      if (fileList.length && insertedIds.length) {
        for (const f of fileList) {
          await tx.reportFile.create({
            data: { reportId: insertedIds[0], fileName: f.name, fileData: f.data, file_type: f.type, file_size: f.size },
          });
        }
      }

      return { insertedIds, round: newRound };
    });
  }

  // 보고 회차 카운트 (Prisma client에 round 미반영 → rawUnsafe)
  async getMaxRound(evalId, authorId) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT COALESCE(MAX(round), 0) AS max_round FROM progress_reports WHERE eval_id = ? AND author_id = ?',
      Number(evalId), Number(authorId)
    );
    return Number(rows[0]?.max_round || 0);
  }

  async create(data) {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.progressReport.create({
        data: {
          evalId:   Number(data.eval_id),
          authorId: Number(data.author_id),
          content:  this._encrypt(data.content || ''),
        }
      });

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
      file_type: f.fileType ?? f.file_type,
    };
  }
}

module.exports = PrismaProgressReportRepository;
