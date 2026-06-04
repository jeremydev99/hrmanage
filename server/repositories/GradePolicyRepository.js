class GradePolicyRepository {
  async findAll() { throw new Error('Not implemented'); }
  async findById(id) { throw new Error('Not implemented'); }
  async findByName(name) { throw new Error('Not implemented'); }
  async findByNameExcluding(name, excludeId) { throw new Error('Not implemented'); }
  async getAppliedCount(policyId) { throw new Error('Not implemented'); }
  async getAppliedPeriods(policyId) { throw new Error('Not implemented'); }
  async createWithCriteria(policyData, criteria) { throw new Error('Not implemented'); }
  async updateWithCriteria(policyId, metaUpdates, criteria) { throw new Error('Not implemented'); }
  async deletePolicy(policyId) { throw new Error('Not implemented'); }
  // 헬퍼 지원 메서드 (A8-1)
  async getFirstPolicyId() { throw new Error('Not implemented'); }
  async getCriteriaForGradeMap(policyId) { throw new Error('Not implemented'); }
  async getPolicyForEvalCycle(evalId) { throw new Error('Not implemented'); }
  async getPolicyWithCriteria(policyId) { throw new Error('Not implemented'); }
}

module.exports = GradePolicyRepository;
