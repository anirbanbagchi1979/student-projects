export default function Dashboard({ questions, answers }) {
    const total = questions.length
    const correct = Object.values(answers).filter(a => a.correct).length
    const wrong = Object.values(answers).filter(a => !a.correct).length
    const unattempted = total - correct - wrong
    const mastery = total > 0 ? Math.round((correct / total) * 100) : 0

    // Per-source breakdown
    const sourceMap = {}
    questions.forEach((q, i) => {
        const src = q.source || 'Unknown'
        if (!sourceMap[src]) sourceMap[src] = { total: 0, correct: 0, wrong: 0, unattempted: 0 }
        sourceMap[src].total++
        const a = answers[i]
        if (!a) sourceMap[src].unattempted++
        else if (a.correct) sourceMap[src].correct++
        else sourceMap[src].wrong++
    })

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
                        strokeDasharray={`${mastery * 3.267} 326.7`}
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                    />
                </svg>
                <div className="mastery-pct">{mastery}%</div>
                <div className="mastery-label">Mastery</div>
            </div>

            {/* Stat cards */}
            <div className="stat-cards">
                <div className="stat-card correct-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-value">{correct}</div>
                    <div className="stat-name">Correct</div>
                </div>
                <div className="stat-card wrong-card">
                    <div className="stat-icon">❌</div>
                    <div className="stat-value">{wrong}</div>
                    <div className="stat-name">Wrong</div>
                </div>
                <div className="stat-card unattempted-card">
                    <div className="stat-icon">⬜</div>
                    <div className="stat-value">{unattempted}</div>
                    <div className="stat-name">Remaining</div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="dash-progress">
                <div className="dash-progress-label">
                    <span>Overall Progress</span>
                    <span>{correct + wrong} / {total}</span>
                </div>
                <div className="dash-progress-bar">
                    <div className="dash-bar-correct" style={{ width: `${total > 0 ? (correct / total) * 100 : 0}%` }} />
                    <div className="dash-bar-wrong" style={{ width: `${total > 0 ? (wrong / total) * 100 : 0}%` }} />
                </div>
            </div>

            {/* Per-source breakdown */}
            <div className="source-breakdown">
                <h3 className="breakdown-title">By Source</h3>
                {Object.entries(sourceMap).sort((a, b) => a[0].localeCompare(b[0])).map(([src, s]) => {
                    const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0
                    return (
                        <div key={src} className="source-row">
                            <div className="source-row-header">
                                <span className="source-row-name">{src}</span>
                                <span className="source-row-pct">{pct}%</span>
                            </div>
                            <div className="dash-progress-bar">
                                <div className="dash-bar-correct" style={{ width: `${s.total > 0 ? (s.correct / s.total) * 100 : 0}%` }} />
                                <div className="dash-bar-wrong" style={{ width: `${s.total > 0 ? (s.wrong / s.total) * 100 : 0}%` }} />
                            </div>
                            <div className="source-row-stats">
                                <span className="src-stat correct-text">✅ {s.correct}</span>
                                <span className="src-stat wrong-text">❌ {s.wrong}</span>
                                <span className="src-stat muted-text">⬜ {s.unattempted}</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
