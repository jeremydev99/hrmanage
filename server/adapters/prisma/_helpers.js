/**
 * Prisma DateTime 응답을 ISO 8601 문자열로 정규화.
 * SQLite: String 그대로 통과
 * PostgreSQL: Date 객체 → ISO 8601 문자열
 * null/undefined: 그대로 반환
 */
function _toStr(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

module.exports = { _toStr };
