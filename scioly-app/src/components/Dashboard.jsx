import { MASTERY_LEVELS } from '../lib/mastery'
import { BADGES } from '../lib/gamification'
import { EVENTS, DEFAULT_EVENT, getEvent } from '../lib/events'

export default function Dashboard({ questions, allQuestions, answers, masteryMap, allUsersMastery = [], currentUser, streakData = {}, earnedBadges = [], currentEvent, globalData = {}, eventsMastery = {} }) {
    // Only count MC + non-context-missing questions toward mastery
    const masteryQuestions = (allQuestions || questions).filter(q =>
        q.type === 'MC' && !q.contextMissing
    )
    const total = masteryQuestions.length

    // Count by mastery level (from persistent masteryMap)
    const levelCounts = MASTERY_LEVELS.map(() => 0)
    const perSource = {}

    masteryQuestions.forEach(q => {
        const key = String(q.number)
        const m = masteryMap[key]
        const level = m?.level ?? 0
        levelCounts[level]++

        const src = q.source || 'Unknown'
        if (!perSource[src]) perSource[src] = { total: 0, levels: MASTERY_LEVELS.map(() => 0) }
        perSource[src].total++
        perSource[src].levels[level]++
    })

    const mastered = levelCounts[4] + levelCounts[5] // Strong + Mastered
    const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0
    const attempted = total - levelCounts[0]

    // Session stats
    const sessionAnswered = Object.keys(answers).length
    const sessionCorrect = Object.values(answers).filter(a => a.correct).length

    // Leaderboard: scoped to current event
    const leaderboard = allUsersMastery.map(u => {
        const evtData = u.events?.[currentEvent || DEFAULT_EVENT]
        const userMasteryMap = evtData?.masteryMap || {}
        let userMastered = 0
        let userAttempted = 0
        masteryQuestions.forEach(q => {
            const key = String(q.number)
            const m = userMasteryMap[key]
            if (m && m.level > 0) userAttempted++
            if (m && m.level >= 4) userMastered++
        })
        return {
            uid: u.uid,
            name: u.name,
            photoURL: u.photoURL,
            mastered: userMastered,
            attempted: userAttempted,
            pct: total > 0 ? Math.round((userMastered / total) * 100) : 0
        }
    }).sort((a, b) => b.mastered - a.mastered || b.attempted - a.attempted)

    const earnedSet = new Set(earnedBadges)

    // Cross-event global stats
    const evtSlugs = Object.keys(eventsMastery)
    const totalMasteredAllEvents = evtSlugs.reduce((sum, slug) => {
        const mm = eventsMastery[slug]?.masteryMap || {}
        return sum + Object.values(mm).filter(m => m.level >= 5).length
    }, 0)
    const eventsWithMastery = evtSlugs.filter(slug => {
        const mm = eventsMastery[slug]?.masteryMap || {}
        const masteredCount = Object.values(mm).filter(m => m.level >= 5).length
        return masteredCount > 0
    }).length
    const eventsTodayCount = globalData?.eventsToday?.events?.length || 0
    const globalStreak = globalData?.dailyStreak?.currentStreak || 0

    const eventInfo = getEvent(currentEvent || DEFAULT_EVENT)

    return (
        <div className="dashboard">
            {/* Mastery ring */}
            <div className="mastery-ring-wrap">
                <svg className="mastery-ring" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="10" />
                    <circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke="var(--mode-accent)" strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${masteryPct * 3.267} 326.7`}
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                    />
                </svg>
                <div className="mastery-pct">{masteryPct}%</div>
                <div className="mastery-label">{mastered} / {total} Locked In 🔒</div>
            </div>

            {/* Mastery level breakdown */}
            <div className="stat-cards mastery-level-cards">
                {MASTERY_LEVELS.map((lvl, i) => (
                    <div key={i} className="stat-card" style={{ borderColor: lvl.color + '50' }}>
                        <div className="stat-icon">{lvl.icon}</div>
                        <div className="stat-value">{levelCounts[i]}</div>
                        <div className="stat-name">{lvl.name}</div>
                    </div>
                ))}
            </div>

            {/* Session stats */}
            {sessionAnswered > 0 && (
                <div className="dash-progress">
                    <div className="dash-progress-label">
                        <span>This Sesh 🎮</span>
                        <span>{sessionCorrect}/{sessionAnswered} correct</span>
                    </div>
                    <div className="dash-progress-bar">
                        <div className="dash-bar-correct" style={{ width: `${sessionAnswered > 0 ? (sessionCorrect / sessionAnswered) * 100 : 0}%` }} />
                        <div className="dash-bar-wrong" style={{ width: `${sessionAnswered > 0 ? ((sessionAnswered - sessionCorrect) / sessionAnswered) * 100 : 0}%` }} />
                    </div>
                </div>
            )}

            {/* Overall progress bar */}
            <div className="dash-progress">
                <div className="dash-progress-label">
                    <span>Your Grind 💪</span>
                    <span>{attempted} / {total} attempted</span>
                </div>
                <div className="dash-progress-bar">
                    <div className="dash-bar-correct" style={{ width: `${total > 0 ? (mastered / total) * 100 : 0}%` }} />
                    <div className="dash-bar-wrong" style={{ width: `${total > 0 ? ((attempted - mastered) / total) * 100 : 0}%` }} />
                </div>
            </div>

            {/* Streak & Shields */}
            <div className="stat-cards streak-cards">
                <div className="stat-card" style={{ borderColor: '#ff6b35' + '50' }}>
                    <div className="stat-icon">🔥</div>
                    <div className="stat-value">{streakData.currentStreak || 0}</div>
                    <div className="stat-name">Streak</div>
                </div>
                <div className="stat-card" style={{ borderColor: '#f0a020' + '50' }}>
                    <div className="stat-icon">⭐</div>
                    <div className="stat-value">{streakData.longestStreak || 0}</div>
                    <div className="stat-name">Record</div>
                </div>
                <div className="stat-card" style={{ borderColor: '#4ecdc4' + '50' }}>
                    <div className="stat-icon">🛡️</div>
                    <div className="stat-value">{streakData.streakShields || 0}</div>
                    <div className="stat-name">Shields</div>
                </div>
            </div>

            {/* Cross-Event Global Stats */}
            <div className="cross-event-section">
                <h3 className="breakdown-title">🌍 Across All Events</h3>
                <div className="stat-cards cross-event-cards">
                    <div className="stat-card" style={{ borderColor: '#6c5ce7' + '50' }}>
                        <div className="stat-icon">🌟</div>
                        <div className="stat-value">{totalMasteredAllEvents}</div>
                        <div className="stat-name">Total Mastered</div>
                    </div>
                    <div className="stat-card" style={{ borderColor: '#00cec9' + '50' }}>
                        <div className="stat-icon">📚</div>
                        <div className="stat-value">{eventsWithMastery}/{EVENTS.length}</div>
                        <div className="stat-name">Polymath</div>
                    </div>
                    <div className="stat-card" style={{ borderColor: '#fdcb6e' + '50' }}>
                        <div className="stat-icon">🔥</div>
                        <div className="stat-value">{globalStreak}</div>
                        <div className="stat-name">Daily Streak</div>
                    </div>
                    <div className="stat-card" style={{ borderColor: '#e17055' + '50' }}>
                        <div className="stat-icon">🎯</div>
                        <div className="stat-value">{eventsTodayCount}</div>
                        <div className="stat-name">Events Today</div>
                    </div>
                </div>
            </div>

            {/* Achievement Badges */}
            <div className="badges-section">
                <h3 className="breakdown-title">🏆 {eventInfo.icon} {eventInfo.name} Trophies ({earnedBadges.length}/{BADGES.length})</h3>
                <div className="badges-grid">
                    {BADGES.map(b => {
                        const isEarned = earnedSet.has(b.id)
                        return (
                            <div key={b.id} className={`badge-card ${isEarned ? 'badge-earned' : 'badge-locked'}`}>
                                <div className="badge-icon">{b.icon}</div>
                                <div className="badge-name">{b.name}</div>
                                <div className="badge-desc">{b.description}</div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
                <div className="leaderboard">
                    <h3 className="breakdown-title">💯 {eventInfo.icon} Scoreboard</h3>
                    {leaderboard.map((u, rank) => {
                        const isMe = currentUser && u.uid === currentUser.uid
                        return (
                            <div key={u.uid} className={`leaderboard-row ${isMe ? 'leaderboard-me' : ''}`}>
                                <div className="lb-rank">{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}</div>
                                {u.photoURL ? (
                                    <img src={u.photoURL} alt="" className="lb-avatar" />
                                ) : (
                                    <div className="lb-avatar lb-avatar-placeholder">👤</div>
                                )}
                                <div className="lb-info">
                                    <div className="lb-name">{u.name}{isMe ? ' (you)' : ''}</div>
                                    <div className="dash-progress-bar lb-bar">
                                        <div className="dash-bar-correct" style={{ width: `${u.pct}%` }} />
                                    </div>
                                </div>
                                <div className="lb-stats">
                                    <div className="lb-mastered">{u.mastered}/{total}</div>
                                    <div className="lb-pct">{u.pct}%</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Per-source breakdown */}
            <div className="source-breakdown">
                <h3 className="breakdown-title">🗂 Pack Breakdown</h3>
                {Object.entries(perSource).sort((a, b) => a[0].localeCompare(b[0])).map(([src, s]) => {
                    const srcMastered = s.levels[4] + s.levels[5]
                    const pct = s.total > 0 ? Math.round((srcMastered / s.total) * 100) : 0
                    return (
                        <div key={src} className="source-row">
                            <div className="source-row-header">
                                <span className="source-row-name">{src}</span>
                                <span className="source-row-pct">{srcMastered}/{s.total} · {pct}%</span>
                            </div>
                            <div className="dash-progress-bar">
                                <div className="dash-bar-correct" style={{ width: `${pct}%` }} />
                                <div className="dash-bar-wrong" style={{ width: `${s.total > 0 ? ((s.total - s.levels[0] - srcMastered) / s.total) * 100 : 0}%` }} />
                            </div>
                            <div className="source-row-stats">
                                {MASTERY_LEVELS.map((lvl, i) => s.levels[i] > 0 && (
                                    <span key={i} className="src-stat" style={{ color: lvl.color }}>{lvl.icon} {s.levels[i]}</span>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
