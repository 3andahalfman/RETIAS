/** Company field value stored for Meeting Assist past sessions. */
export const MEETING_ASSIST_COMPANY = 'Meeting Assist'

export function isMeetingAssistSession(session: { company?: string | null }): boolean {
  return (session.company ?? '') === MEETING_ASSIST_COMPANY
}
