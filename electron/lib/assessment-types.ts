/** Mirror of src/lib/assessment-types.ts — keep in sync for main-process categorization. */
export const ONLINE_TEST_COMPANY = 'Online Test'

export function isOnlineTestSession(company: string): boolean {
  return company === ONLINE_TEST_COMPANY
}

/** Use session testType for category bucketing; fall back to per-question type for interviews. */
export function qaCategoryType(
  sessionTestType: string | null,
  questionType: string,
): string {
  return sessionTestType ?? questionType
}
