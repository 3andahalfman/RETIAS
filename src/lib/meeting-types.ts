/** Company field value stored for Meeting Assist past sessions. */
export const MEETING_ASSIST_COMPANY = 'Meeting Assist'

export function isMeetingAssistSession(session: { company?: string | null }): boolean {
  return (session.company ?? '') === MEETING_ASSIST_COMPANY
}

export function getMeetingTypeLabel(meetingType?: string | null): string {
  if (meetingType === 'standup') return 'Standup'
  if (meetingType === 'general') return 'General Meeting'
  return 'Meeting'
}

/** Prompt card label shown in the answer panel during meeting sessions. */
export function getMeetingPromptLabel(meetingType?: string | null): string {
  return meetingType === 'standup' ? 'Standup prompt' : 'Meeting prompt'
}
