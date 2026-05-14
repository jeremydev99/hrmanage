/**
 * GoalCategoryRepository — 목표 카테고리 데이터 접근 인터페이스
 *
 * goal_categories 테이블 추상화.
 * 실제 구현은 server/adapters/{어댑터}/PrismaGoalCategoryRepository.js 등에 위치.
 *
 * 컬럼 매핑 (snake_case 응답 기준):
 *   id, name, description, weight, color, text_color,
 *   sort_order, is_active, created_by, created_at
 */
class GoalCategoryRepository {
  /**
   * 활성 카테고리 전체 목록 (sort_order 오름차순)
   * @returns {Promise<Array>} 카테고리 객체 배열
   */
  async findAllActive() {
    throw new Error('GoalCategoryRepository.findAllActive is not implemented');
  }

  /**
   * 새 카테고리 추가
   * @param {object} data - {name, description, weight, color, text_color, sort_order, created_by}
   * @returns {Promise<number>} 생성된 ID
   */
  async create(data) {
    throw new Error('GoalCategoryRepository.create is not implemented');
  }

  /**
   * 카테고리 수정 (전체 필드)
   * @param {number} id - 카테고리 ID
   * @param {object} data - {name, description, weight, color, text_color, sort_order, is_active}
   * @returns {Promise<boolean>} 성공 여부
   */
  async update(id, data) {
    throw new Error('GoalCategoryRepository.update is not implemented');
  }

  /**
   * 카테고리 비활성화 (soft delete)
   * @param {number} id - 카테고리 ID
   * @returns {Promise<boolean>} 성공 여부
   */
  async deactivate(id) {
    throw new Error('GoalCategoryRepository.deactivate is not implemented');
  }
}

module.exports = GoalCategoryRepository;
