/**
 * FeedbackRepository — 피드백 데이터 접근 인터페이스 (Aggregate Root)
 * feedbacks + feedback_items 두 테이블을 함께 처리.
 * 암호화 필드: overall_note, note, goal.name (참조)
 */
class FeedbackRepository {
  /**
   * 평가 사이클별 피드백 목록 조회 (items 포함, author 정보 포함)
   * Repository는 항상 평문 반환. 권한별 마스킹은 라우터에서.
   * @param {number} evalId
   * @returns {Promise<Array>} 피드백 배열, 각 항목에 items 배열 포함
   *   { id, eval_id, author_id, author_name, overall_note(평문), created_at, items: [{...}] }
   */
  async findByEvalId(evalId) {
    throw new Error('FeedbackRepository.findByEvalId is not implemented');
  }

  /**
   * 피드백 생성 (트랜잭션: feedbacks INSERT + items 일괄 INSERT)
   * Repository가 자동 암호화 처리.
   * @param {Object} data { eval_id, author_id, overall_note(평문), items: [{goal_id, score, note(평문)}] }
   * @returns {Promise<number>} 생성된 feedback.id
   */
  async create(data) {
    throw new Error('FeedbackRepository.create is not implemented');
  }
}

module.exports = FeedbackRepository;
