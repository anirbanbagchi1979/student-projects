/**
 * Memrise-style mastery system
 *
 * Per-question mastery data:
 * {
 *   level: 0-5 (New → Learning → Familiar → Review → Strong → Mastered)
 *   correctStreak: consecutive correct answers
 *   totalCorrect: lifetime correct count
 *   totalWrong: lifetime wrong count
 *   lastAnswered: ISO timestamp
 *   lastCorrect: ISO timestamp or null
 *   nextDue: ISO timestamp for spaced repetition
 * }
 *
 * Time decay: items "wilt" if not reviewed within their interval
 */

export const MASTERY_LEVELS = [
    { name: 'New', color: '#6c7293', icon: '⬜' },
    { name: 'Learning', color: '#f0a020', icon: '🌱' },
    { name: 'Familiar', color: '#e8d44d', icon: '🌿' },
    { name: 'Review', color: '#4ecdc4', icon: '🌳' },
    { name: 'Strong', color: '#6c5ce7', icon: '💪' },
    { name: 'Mastered', color: '#00ce9e', icon: '🌟' },
]

// Spaced repetition intervals per mastery level (in hours)
const INTERVALS = [0, 4, 24, 72, 168, 720] // 0, 4h, 1d, 3d, 7d, 30d

// Decay thresholds: how long before a level "wilts" (in hours)
const DECAY_THRESHOLDS = [Infinity, 24, 72, 168, 336, 720] // -, 1d, 3d, 7d, 14d, 30d

export function createEmptyMastery() {
    return {
        level: 0,
        correctStreak: 0,
        totalCorrect: 0,
        totalWrong: 0,
        lastAnswered: null,
        lastCorrect: null,
        nextDue: null,
    }
}

export function updateMastery(mastery, isCorrect) {
    const now = new Date().toISOString()
    const m = { ...mastery }

    m.lastAnswered = now

    if (isCorrect) {
        m.correctStreak++
        m.totalCorrect++
        m.lastCorrect = now
        // Level up (max 5)
        if (m.level < 5) m.level++
        // Set next due based on new level
        const intervalHours = INTERVALS[m.level] || 0
        m.nextDue = new Date(Date.now() + intervalHours * 3600000).toISOString()
    } else {
        m.correctStreak = 0
        m.totalWrong++
        // Level drops by 1 (min 0), but never below 0
        if (m.level > 0) m.level = Math.max(0, m.level - 1)
        // Come back soon
        m.nextDue = new Date(Date.now() + INTERVALS[1] * 3600000).toISOString()
    }

    return m
}

export function applyDecay(mastery) {
    if (!mastery || mastery.level === 0 || !mastery.lastAnswered) return mastery

    const hoursSince = (Date.now() - new Date(mastery.lastAnswered).getTime()) / 3600000
    const threshold = DECAY_THRESHOLDS[mastery.level]

    if (hoursSince > threshold) {
        const m = { ...mastery }
        // Drop one level per threshold exceeded
        while (m.level > 0) {
            const t = DECAY_THRESHOLDS[m.level]
            if (hoursSince > t) {
                m.level--
            } else {
                break
            }
        }
        return m
    }
    return mastery
}

/**
 * Pick the next question for spaced repetition practice
 * Priority: due/overdue wrong → due/overdue correct → new → not yet due
 */
export function pickNextQuestion(questions, masteryMap) {
    const now = Date.now()
    const n = questions.length
    if (n === 0) return 0

    const scored = questions.map((q, i) => {
        const key = String(q.number)
        const m = masteryMap[key]

        if (!m || m.level === 0) {
            // Never seen: medium priority, ordered by index
            return { i, score: 1000 + i }
        }

        const isDue = !m.nextDue || new Date(m.nextDue).getTime() <= now
        const overdue = m.nextDue ? (now - new Date(m.nextDue).getTime()) / 3600000 : 0

        if (m.totalWrong > m.totalCorrect && isDue) {
            // Struggled items that are due: highest priority
            return { i, score: -2000 + i }
        }

        if (isDue) {
            // Due for review: high priority, more overdue = higher priority
            return { i, score: -overdue }
        }

        // Not yet due: low priority
        const hoursUntilDue = m.nextDue ? (new Date(m.nextDue).getTime() - now) / 3600000 : 0
        return { i, score: 5000 + hoursUntilDue * 10 + i }
    })

    scored.sort((a, b) => a.score - b.score)
    return scored[0].i
}
