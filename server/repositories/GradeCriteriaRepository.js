/**
 * GradeCriteriaRepository — 등급 기준 데이터 접근 인터페이스
 * 모든 구현체는 이 메서드 시그니처를 따라야 함
 */
class GradeCriteriaRepository {
  async findAll() {
    throw new Error('Not implemented');
  }
  async create(data) {
    throw new Error('Not implemented');
  }
  async update(id, data) {
    throw new Error('Not implemented');
  }
  async delete(id) {
    throw new Error('Not implemented');
  }
  async count() {
    throw new Error('Not implemented');
  }
  async getMaxSortOrder() {
    throw new Error('Not implemented');
  }
  async resequenceSortOrder() {
    throw new Error('Not implemented');
  }
}

module.exports = GradeCriteriaRepository;
