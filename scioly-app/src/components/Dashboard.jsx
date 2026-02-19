import { MASTERY_LEVELS } from '../lib/mastery'

export default function Dashboard({ questions, allQuestions, answers, masteryMap }) {
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

    return (
        <div className="dashboard">
            {/* Mastery ring */}
            <div className="mastery-ring-wrap">
                <svg className="mastery-ring" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="10" />
                    <circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke="var(--primary)" strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${masteryPct * 3.267} 326.7`}
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                    />
                </svg>
                <div className="mastery-pct">{masteryPct}%</div>
                <div className="mastery-label">{mastered} / {total} Mastered</div>
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
                        <span>This Session</span>
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
                    <span>Overall Progress</span>
                    <span>{attempted} / {total} attempted</span>
                </div>
                <div className="dash-progress-bar">
                    <div className="dash-bar-correct" style={{ width: `${total > 0 ? (mastered / total) * 100 : 0}%` }} />
                    <div className="dash-bar-wrong" style={{ width: `${total > 0 ? ((attempted - mastered) / total) * 100 : 0}%` }} />
                </div>
            </div>

            {/* Per-source breakdown */}
            <div className="source-breakdown">
                <h3 className="breakdown-title">By Source</h3>
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
