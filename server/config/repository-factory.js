/**
 * Repository Factory — 환경변수에 따라 적절한 어댑터를 선택
 *
 * 환경변수:
 *   DATA_ADAPTER=prisma (기본값)
 *   향후 추가 예정: direct-sql, mongo, external-api 등
 */

const PrismaUserRepository = require('../adapters/prisma/PrismaUserRepository');
const PrismaGoalCategoryRepository = require('../adapters/prisma/PrismaGoalCategoryRepository');
const PrismaGradeCriteriaRepository = require('../adapters/prisma/PrismaGradeCriteriaRepository');
const PrismaOrganizationRepository = require('../adapters/prisma/PrismaOrganizationRepository');
const PrismaEvalCycleRepository = require('../adapters/prisma/PrismaEvalCycleRepository');
const PrismaGoalRepository = require('../adapters/prisma/PrismaGoalRepository');
const PrismaFeedbackRepository = require('../adapters/prisma/PrismaFeedbackRepository');
const PrismaFinalEvaluationRepository = require('../adapters/prisma/PrismaFinalEvaluationRepository');
const PrismaProgressReportRepository = require('../adapters/prisma/PrismaProgressReportRepository');
const PrismaGoalApprovalRepository   = require('../adapters/prisma/PrismaGoalApprovalRepository');
const PrismaEvalPeriodRepository     = require('../adapters/prisma/PrismaEvalPeriodRepository');
const PrismaAdminRepository          = require('../adapters/prisma/PrismaAdminRepository');
// 향후 추가:
// const DirectSqlUserRepository = require('../adapters/direct-sql/DirectSqlUserRepository');

const ADAPTER = process.env.DATA_ADAPTER || 'prisma';

// PrismaClient 인스턴스 공유 (싱글톤)
let sharedPrismaClient = null;
function getSharedPrismaClient() {
  if (!sharedPrismaClient) {
    const { PrismaClient } = require('@prisma/client');
    sharedPrismaClient = new PrismaClient();
  }
  return sharedPrismaClient;
}

function getUserRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaUserRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getGoalCategoryRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaGoalCategoryRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getGradeCriteriaRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaGradeCriteriaRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getOrganizationRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaOrganizationRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getEvalCycleRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaEvalCycleRepository(getSharedPrismaClient(), encSecret);
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getGoalRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaGoalRepository(getSharedPrismaClient(), encSecret);
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getFeedbackRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaFeedbackRepository(getSharedPrismaClient(), encSecret);
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getFinalEvaluationRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaFinalEvaluationRepository(getSharedPrismaClient(), encSecret);
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getProgressReportRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaProgressReportRepository(getSharedPrismaClient(), encSecret);
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getAdminRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaAdminRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getEvalPeriodRepository() {
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaEvalPeriodRepository(getSharedPrismaClient());
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

function getGoalApprovalRepository() {
  const encSecret = process.env.ENC_SECRET || 'synap-local-enc-secret-32bytes!!';
  switch (ADAPTER) {
    case 'prisma':
      return new PrismaGoalApprovalRepository(getSharedPrismaClient(), encSecret);
    default:
      throw new Error(`Unknown DATA_ADAPTER: ${ADAPTER}`);
  }
}

module.exports = {
  getUserRepository,
  getGoalCategoryRepository,
  getGradeCriteriaRepository,
  getOrganizationRepository,
  getEvalCycleRepository,
  getGoalRepository,
  getFeedbackRepository,
  getFinalEvaluationRepository,
  getProgressReportRepository,
  getGoalApprovalRepository,
  getEvalPeriodRepository,
  getAdminRepository,
  getSharedPrismaClient,
};
