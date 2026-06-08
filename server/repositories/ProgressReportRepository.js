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

  /**
   * 본인 중간보고 단건 수정 (소유 검증, 단계 제약 포함)
   * @param {number} reportId - progress_reports.id
   * @param {number} userId   - 요청자 id (authorId 와 일치해야 함)
   * @param {string} content  - 새 내용 (암호화 후 저장)
   * @throws {Error} 소유 불일치 → status:403 / 단계 제약 → status:400
   */
  async updateItem(reportId, userId, content) {
    throw new Error('Not implemented');
  }
}

module.exports = ProgressReportRepository;
