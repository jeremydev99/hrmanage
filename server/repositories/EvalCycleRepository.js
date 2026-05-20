/**
 * EvalCycleRepository — 평가 사이클 데이터 접근 인터페이스
 * eval_cycles 테이블 추상화.
 * 암호화 필드: self_reason, reject_reason (저장/조회 시 자동 처리)
 * 실제 구현은 server/adapters/prisma/PrismaEvalCycleRepository.js
 */
class EvalCycleRepository {
  /**
   * ID로 평가 사이클 조회 (암호화 필드 자동 복호화, user 정보 포함)
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    throw new Error('EvalCycleRepository.findById is not implemented');
  }

  /**
   * 평가 사이클 목록 조회
   * @param {Object} options { userId, scope: 'all'|'mine' }
   * @returns {Promise<Array>}
   */
  async findList({ userId, scope }) {
    throw new Error('EvalCycleRepository.findList is not implemented');
  }

  /**
   * draft 상태의 평가 사이클 찾기 (중복 생성 방지용)
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  async findDraftByUserId(userId) {
    throw new Error('EvalCycleRepository.findDraftByUserId is not implemented');
  }

  /**
   * 새 평가 사이클 생성
   * @param {Object} data { user_id, period_type, period_label, eval_year }
   * @returns {Promise<number>} 생성된 ID
   */
  async create(data) {
    throw new Error('EvalCycleRepository.create is not implemented');
  }

  /**
   * 평가 사이클 phase 및 자기평가 사유 업데이트 (제출 시)
   * @param {number} id
   * @param {Object} data { phase, self_reason, submitted_at }
   */
  async updatePhaseAndReason(id, data) {
    throw new Error('EvalCycleRepository.updatePhaseAndReason is not implemented');
  }

  /**
   * 반려된 평가 사이클을 draft로 되돌림
   * @param {number} id
   */
  async reopen(id) {
    throw new Error('EvalCycleRepository.reopen is not implemented');
  }

  /**
   * 평가 단계 + 잠금 상태를 동시에 변경 (force-phase용)
   * @param {number} id - eval_cycles.id
   * @param {string} phase - 변경할 phase 값
   * @param {number} locked - 0 또는 1
   */
  async updatePhaseAndLocked(id, phase, locked) {
    throw new Error('Not implemented');
  }
}

module.exports = EvalCycleRepository;
