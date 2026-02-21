import { useEffect, useRef } from 'react'

function getTitle(pct) {
    if (pct >= 95) return { icon: '👑', title: 'LEGENDARY', sub: 'You are the main character' }
    if (pct >= 85) return { icon: '🧠', title: 'BIG BRAIN', sub: 'Absolutely cracked' }
    if (pct >= 75) return { icon: '🔥', title: 'ON FIRE', sub: 'Keep that energy' }
    if (pct >= 60) return { icon: '💪', title: 'SOLID', sub: 'Getting there!' }
    if (pct >= 40) return { icon: '📚', title: 'STUDY ARC', sub: 'Character development incoming' }
    return { icon: '💀', title: 'NEEDS CPR', sub: 'We believe in you... kinda' }
}

// Simple CSS-based confetti via animated particles
function ConfettiCanvas() {
    const colors = ['#6c5ce7', '#00b894', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9', '#a29bfe']
    const particles = Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        size: Math.random() * 6 + 4,
        color: colors[i % colors.length],
        rotation: Math.random() * 360,
        duration: Math.random() * 1.5 + 2,
    }))

    return (
        <div className="confetti-container" aria-hidden="true">
            {particles.map(p => (
                <div
                    key={p.id}
                    className="confetti-particle"
                    style={{
                        left: `${p.left}%`,
                        width: p.size,
                        height: p.size * 1.6,
                        backgroundColor: p.color,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        transform: `rotate(${p.rotation}deg)`,
                    }}
                />
            ))}
        </div>
    )
}

export default function ResultsScreen({ questions, answers, onReview, onRetryWrong, onReset, mode, maxStreak }) {
    const totalMC = questions.length
    const answeredMC = Object.keys(answers).length
    const correct = Object.values(answers).filter(x => x.correct).length
    const wrong = answeredMC - correct
    const skipped = totalMC - answeredMC
    const pct = answeredMC > 0 ? Math.round((correct / answeredMC) * 100) : 0

    const { icon, title, sub } = getTitle(pct)
    const showConfetti = pct >= 75

    return (
        <div className="results-card">
            {showConfetti && <ConfettiCanvas />}

            <div className="results-title-icon">{icon}</div>
            <div className="results-title">{title}</div>
            <div className="results-subtitle">{sub}</div>

            <div className="big-score">{pct}%</div>
            <div className="score-label">
                {mode === 'test' ? 'Blitz Score' : mode === 'practice' ? 'Grind Score' : 'Score'}
            </div>

            <div className="results-breakdown">
                <div className="stat stat-correct">
                    <div className="stat-val">{correct}</div>
                    <div className="stat-lbl">Correct</div>
                </div>
                <div className="stat stat-wrong">
                    <div className="stat-val">{wrong}</div>
                    <div className="stat-lbl">Wrong</div>
                </div>
                <div className="stat stat-skipped">
                    <div className="stat-val">{skipped}</div>
                    <div className="stat-lbl">Skipped</div>
                </div>
            </div>

            {/* Max streak display */}
            {maxStreak > 0 && (
                <div className="results-streak">
                    🔥 Best Streak: {maxStreak} in a row
                </div>
            )}

            <div className="results-actions">
                <button className="nav-btn" onClick={onReview}>📖 Review</button>
                <button className="nav-btn primary-btn" onClick={onRetryWrong}>🔄 Retry Wrong</button>
                <button className="nav-btn" onClick={onReset}>🆕 Start Over</button>
            </div>
        </div>
    )
}
