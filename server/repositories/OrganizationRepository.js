/**
 * OrganizationRepository — 조직 데이터 접근 인터페이스
 * organizations 테이블 추상화.
 * 자기참조 관계: parent_id (Organization), leader_id (User)
 * 실제 구현은 server/adapters/prisma/PrismaOrganizationRepository.js
 */
class OrganizationRepository {
  /**
   * 활성 조직 전체 목록 (leader, parent 정보 포함, sort_order 오름차순)
   * @returns {Promise<Array>} 평탄화된 조직 객체 배열
   *   각 항목: { ...org, leader_name, leader_title, parent_name }
   */
  async findAllActiveWithRelations() {
    throw new Error('OrganizationRepository.findAllActiveWithRelations is not implemented');
  }

  /**
   * 새 조직 추가
   * @param {Object} data { name, leader_id, parent_id, description, sort_order }
   * @returns {Promise<number>} 생성된 조직 ID
   */
  async create(data) {
    throw new Error('OrganizationRepository.create is not implemented');
  }

  /**
   * 조직 수정 (전체 필드)
   * @param {number} id - 조직 ID
   * @param {Object} data - 수정할 필드
   */
  async update(id, data) {
    throw new Error('OrganizationRepository.update is not implemented');
  }

  /**
   * 조직 비활성화 (soft delete)
   * @param {number} id - 조직 ID
   * @returns {Promise<Object>} { id, name } - 감사 로그용
   */
  async deactivate(id) {
    throw new Error('OrganizationRepository.deactivate is not implemented');
  }

  /**
   * 조직명 조회 (감사 로그용)
   * @param {number} id - 조직 ID
   * @returns {Promise<Object|null>} { name } 또는 null
   */
  async findNameById(id) {
    throw new Error('OrganizationRepository.findNameById is not implemented');
  }
}

module.exports = OrganizationRepository;
