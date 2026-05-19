/**
 * GoalRepository — 목표 데이터 접근 인터페이스
 * goals 테이블 추상화.
 * 암호화 필드: name, kpi (저장/조회 시 자동 처리)
 * 관계: evalCycle (필수), category (필수)
 */
class GoalRepository {
  /**
   * 평가 사이클별 목표 목록 조회
   * (암호화 필드 자동 복호화, category 정보 포함)
   * @param {number} evalId - 평가 사이클 ID
   * @returns {Promise<Array>} 목표 객체 배열
   *   각 항목: { ...goal, name, kpi (복호화), cat_name, color, text_color }
   */
  async findByEvalId(evalId) {
    throw new Error('GoalRepository.findByEvalId is not implemented');
  }

  /**
   * 평가 사이클의 모든 목표 삭제 후 새 목표들 일괄 저장 (트랜잭션)
   * @param {number} evalId - 평가 사이클 ID
   * @param {Array} goals - 목표 객체 배열 [{ category_id, name, kpi, weight }]
   */
  async replaceByEvalId(evalId, goals) {
    throw new Error('GoalRepository.replaceByEvalId is not implemented');
  }

  /**
   * 평가 사이클의 모든 목표 상태 일괄 변경
   * @param {number} evalId - 평가 사이클 ID
   * @param {string} status - 새 상태 ('draft', 'pending', 'approved' 등)
   */
  async updateStatusByEvalId(evalId, status) {
    throw new Error('GoalRepository.updateStatusByEvalId is not implemented');
  }
}

module.exports = GoalRepository;
