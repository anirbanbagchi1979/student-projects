/**
 * Gamification: Daily Streaks & Achievement Badges
 */

// ===== STREAK SYSTEM =====

export function getDateString(date = new Date()) {
    return date.toISOString().split('T')[0] // YYYY-MM-DD
}

export function updateStreak(streakData) {
    const today = getDateString()
    const s = { ...streakData }

    if (s.lastPracticeDate === today) {
        // Already practiced today, no change
        return s
    }

    const yesterday = getDateString(new Date(Date.now() - 86400000))

    if (s.lastPracticeDate === yesterday) {
        // Consecutive day! Extend streak
        s.currentStreak++
    } else if (s.lastPracticeDate && s.lastPracticeDate !== today) {
        // Missed a day — check for streak shield
        if (s.streakShields > 0) {
            s.streakShields--
            s.currentStreak++ // Shield saves the streak
            s.shieldUsedToday = true
        } else {
            s.currentStreak = 1 // Streak broken, start fresh
        }
    } else {
        // First ever practice
        s.currentStreak = 1
    }

    s.lastPracticeDate = today
    if (s.currentStreak > (s.longestStreak || 0)) {
        s.longestStreak = s.currentStreak
    }

    return s
}

export function createEmptyStreak() {
    return {
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: null,
        streakShields: 0,
        shieldUsedToday: false,
    }
}

// ===== BADGE SYSTEM =====

export const BADGES = [
    {
        id: 'first_blood',
        name: 'First Blood',
        icon: '🩸',
        description: 'Answer your first question',
        check: (stats) => stats.totalAnswered >= 1,
    },
    {
        id: 'getting_started',
        name: 'Getting Started',
        icon: '🚀',
        description: 'Answer 10 questions',
        check: (stats) => stats.totalAnswered >= 10,
    },
    {
        id: 'half_century',
        name: 'Half Century',
        icon: '5️⃣',
        description: 'Answer 50 questions',
        check: (stats) => stats.totalAnswered >= 50,
    },
    {
        id: 'century',
        name: 'Century',
        icon: '💯',
        description: 'Answer 100 questions',
        check: (stats) => stats.totalAnswered >= 100,
    },
    {
        id: 'perfect_10',
        name: 'Perfect 10',
        icon: '🎯',
        description: 'Get 10 in a row correct',
        check: (stats) => stats.maxCorrectStreak >= 10,
    },
    {
        id: 'perfect_20',
        name: 'Unstoppable',
        icon: '⚡',
        description: 'Get 20 in a row correct',
        check: (stats) => stats.maxCorrectStreak >= 20,
    },
    {
        id: 'first_mastery',
        name: 'First Mastery',
        icon: '🌟',
        description: 'Master your first question',
        check: (stats) => stats.masteredCount >= 1,
    },
    {
        id: 'mastery_10',
        name: 'Scholar',
        icon: '📚',
        description: 'Master 10 questions',
        check: (stats) => stats.masteredCount >= 10,
    },
    {
        id: 'mastery_50',
        name: 'Expert',
        icon: '🧠',
        description: 'Master 50 questions',
        check: (stats) => stats.masteredCount >= 50,
    },
    {
        id: 'mastery_all',
        name: 'Grandmaster',
        icon: '👑',
        description: 'Master all questions',
        check: (stats) => stats.masteredCount >= stats.totalQuestions && stats.totalQuestions > 0,
    },
    {
        id: 'comeback_kid',
        name: 'Comeback Kid',
        icon: '🔄',
        description: 'Master a question you got wrong 3+ times',
        check: (stats) => stats.hasComeback,
    },
    {
        id: 'streak_3',
        name: 'On Fire',
        icon: '🔥',
        description: '3-day practice streak',
        check: (stats) => stats.currentStreak >= 3,
    },
    {
        id: 'streak_7',
        name: 'Week Warrior',
        icon: '⚔️',
        description: '7-day practice streak',
        check: (stats) => stats.currentStreak >= 7,
    },
    {
        id: 'streak_30',
        name: 'Dedicated',
        icon: '🏆',
        description: '30-day practice streak',
        check: (stats) => stats.currentStreak >= 30,
    },
    {
        id: 'source_slayer',
        name: 'Source Slayer',
        icon: '⚔️',
        description: 'Master all questions from one source',
        check: (stats) => stats.hasSourceSlayer,
    },
    {
        id: 'shield_earned',
        name: 'Shield Bearer',
        icon: '🛡️',
        description: 'Earn your first streak shield',
        check: (stats) => stats.totalShieldsEarned >= 1,
    },
]

/**
 * Compute stats needed for badge checks
 */
export function computeBadgeStats(masteryMap, questions, streakData, sessionData = {}) {
    const mcQuestions = questions.filter(q => q.type === 'MC' && !q.contextMissing)
    const totalQuestions = mcQuestions.length

    let totalAnswered = 0
    let masteredCount = 0
    let hasComeback = false

    // Per-source tracking
    const sourceStats = {}
    mcQuestions.forEach(q => {
        const src = q.source || 'Unknown'
        if (!sourceStats[src]) sourceStats[src] = { total: 0, mastered: 0 }
        sourceStats[src].total++
    })

    for (const q of mcQuestions) {
        const key = String(q.number)
        const m = masteryMap[key]
        if (!m) continue

        if (m.totalCorrect + m.totalWrong > 0) totalAnswered++
        if (m.level >= 5) {
            masteredCount++
            const src = q.source || 'Unknown'
            if (sourceStats[src]) sourceStats[src].mastered++
        }
        if (m.level >= 5 && m.totalWrong >= 3) hasComeback = true
    }

    const hasSourceSlayer = Object.values(sourceStats).some(s => s.total > 0 && s.mastered >= s.total)

    return {
        totalAnswered,
        totalQuestions,
        masteredCount,
        hasComeback,
        hasSourceSlayer,
        maxCorrectStreak: sessionData.maxCorrectStreak || 0,
        currentStreak: streakData?.currentStreak || 0,
        totalShieldsEarned: streakData?.totalShieldsEarned || 0,
    }
}

/**
 * Check which badges have been newly earned
 */
export function checkBadges(stats, earnedBadgeIds = []) {
    const earned = new Set(earnedBadgeIds)
    const newlyEarned = []

    for (const badge of BADGES) {
        if (!earned.has(badge.id) && badge.check(stats)) {
            newlyEarned.push(badge)
        }
    }

    return newlyEarned
}
