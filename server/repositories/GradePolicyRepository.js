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
}

module.exports = GradePolicyRepository;
