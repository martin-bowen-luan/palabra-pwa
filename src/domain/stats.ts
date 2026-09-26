import type { StudySession, WordProgress } from '../types'

export function toLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(date: Date, amount: number): Date {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + amount)
  return shifted
}

export function calculateStreak(sessions: StudySession[], now = new Date()): number {
  const completedDates = new Set(sessions.filter((item) => item.completed).map((item) => item.date))
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!completedDates.has(toLocalDate(cursor))) {
    cursor = shiftDate(cursor, -1)
  }
  let streak = 0
  while (completedDates.has(toLocalDate(cursor))) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

export function summarizeStages(records: WordProgress[], count = 5): number[] {
  const stages = Array.from({ length: count }, () => 0)
  records.forEach((record) => {
    const stage = Math.max(0, Math.min(count - 1, record.stage))
    stages[stage] += 1
  })
  return stages
}

export function recentSevenDays(sessions: StudySession[], now = new Date()): Array<{ date: string; count: number }> {
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(now, index - 6)
    const key = toLocalDate(date)
    const count = sessions
      .filter((session) => session.date === key && session.completed)
      .reduce((sum, session) => sum + session.newCount + session.reviewCount, 0)
    return { date: key, count }
  })
}
