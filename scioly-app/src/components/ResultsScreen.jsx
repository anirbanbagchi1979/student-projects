export default function ResultsScreen({ questions, answers, onReview, onRetryWrong, onReset }) {
    const totalMC = questions.length
    const answeredMC = Object.keys(answers).length
    const correct = Object.values(answers).filter(x => x.correct).length
    const wrong = answeredMC - correct
    const skipped = totalMC - answeredMC
    const pct = answeredMC > 0 ? Math.round((correct / answeredMC) * 100) : 0

    return (
        <div className="results-card">
            <div className="big-score">{pct}%</div>
            <div className="score-label">Multiple Choice Score</div>

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

            <div className="results-actions">
                <button className="nav-btn" onClick={onReview}>📖 Review</button>
                <button className="nav-btn primary-btn" onClick={onRetryWrong}>🔄 Retry Wrong</button>
                <button className="nav-btn" onClick={onReset}>🆕 Start Over</button>
            </div>
        </div>
    )
}
