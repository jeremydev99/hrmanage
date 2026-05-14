/**
 * UserRepository — 사용자 데이터 접근 인터페이스
 *
 * 이 클래스는 추상 인터페이스이며, 실제 구현은
 * server/adapters/{어댑터명}/PrismaUserRepository.js 등에서 합니다.
 *
 * 새 어댑터 추가 방법:
 *   1. server/adapters/{새어댑터}/ 폴더 생성
 *   2. 이 클래스를 상속한 구현 클래스 작성
 *   3. config/repository-factory.js에 분기 추가
 */
class UserRepository {
  /**
   * ID로 사용자 조회
   * @param {number} id - 사용자 ID
   * @returns {Promise<object|null>} 사용자 객체 또는 null
   */
  async findById(id) {
    throw new Error('UserRepository.findById is not implemented');
  }

  /**
   * 이메일로 사용자 조회 (로그인 시 사용)
   * @param {string} email - 이메일
   * @returns {Promise<object|null>}
   */
  async findByEmail(email) {
    throw new Error('UserRepository.findByEmail is not implemented');
  }

  /**
   * 활성 사용자 전체 목록
   * @returns {Promise<Array>}
   */
  async findAllActive() {
    throw new Error('UserRepository.findAllActive is not implemented');
  }

  /**
   * 특정 조직의 활성 멤버 목록 조회
   * @param {number} orgId - 조직 ID
   * @returns {Promise<Array>} 멤버 객체 배열 { id, name, title, grade, dept, role }
   */
  async findByOrgId(orgId) {
    throw new Error('UserRepository.findByOrgId is not implemented');
  }
}

module.exports = UserRepository;
