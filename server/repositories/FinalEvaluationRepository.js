/**
 * FinalEvaluationRepository — 최종 평가 데이터 접근 인터페이스 (Aggregate Root)
 * final_evaluations + final_eval_scores 두 테이블을 함께 처리.
 * 암호화 필드: self_note, mgr_note, second_mgr_note
 */
class FinalEvaluationRepository {
  /**
   * 평가 사이클별 최종평가 조회 (scores 포함, 암호화 필드 자동 복호화)
   * @param {number} evalId
   * @returns {Promise<Object|null>} 최종평가 객체 또는 null
   */
  async findByEvalId(evalId) {
    throw new Error('FinalEvaluationRepository.findByEvalId is not implemented');
  }

  /**
   * 최종평가 upsert — 없으면 생성, 있으면 갱신
   * @param {number} evalId
   * @param {Object} data 갱신할 필드들 (note는 평문, Repository가 자동 암호화)
   * @returns {Promise<number>} final_evaluation.id
   */
  async upsert(evalId, data) {
    throw new Error('FinalEvaluationRepository.upsert is not implemented');
  }

  /**
   * 점수 일괄 upsert — 어떤 필드를 갱신할지 scoreField로 지정
   * @param {number} finalId
   * @param {Array} scores [{ goal_id, score }]
   * @param {string} scoreField 'selfScore' | 'mgrScore' | 'secondMgrScore'
   */
  async upsertScores(finalId, scores, scoreField) {
    throw new Error('FinalEvaluationRepository.upsertScores is not implemented');
  }
}

module.exports = FinalEvaluationRepository;
