export default function QuestionCard({ question, answer, mode, onSelectAnswer }) {
    const showFeedback = mode !== 'test'
    const isLocked = (answer !== undefined && showFeedback) || mode === 'review'
    const correctLetters = question.answer.split(',').map(s => s.trim())

    // Detect Gemini mismatch for MC questions
    const geminiAnswer = question.gemini_answer?.trim().toUpperCase()
    const providedAnswer = question.answer?.trim().toUpperCase()
    const isMC = question.type === 'MC'
    const hasMismatch = isMC && geminiAnswer && providedAnswer && geminiAnswer !== providedAnswer

    return (
        <div className="question-card">
            <div className="q-number">Question {question.number}</div>
            <div className="q-text">{question.question}</div>

            <div className="options">
                {question.options.map((opt, i) => {
                    const letter = opt.charAt(0)
                    const text = opt.substring(3)

                    let cls = ''
                    if (answer && showFeedback) {
                        // Practice/Review: show correct/wrong colors
                        if (correctLetters.includes(letter)) cls = 'correct'
                        if (answer.selected === letter && !answer.correct && !correctLetters.includes(letter)) cls = 'wrong'
                        if (answer.selected === letter && answer.correct) cls = 'correct'
                    } else if (answer && !showFeedback) {
                        // Test: only highlight the selected option, no correct/wrong
                        if (answer.selected === letter) cls = 'selected'
                    }

                    return (
                        <button
                            key={i}
                            className={`option-btn ${cls} ${isLocked ? 'locked' : ''}`}
                            onClick={() => !isLocked && onSelectAnswer(letter)}
                        >
                            <span className="option-letter">{letter}</span>
                            <span className="option-text">{text}</span>
                        </button>
                    )
                })}
            </div>

            {showFeedback && (answer || mode === 'review') && (
                <div className="explanation-box">
                    <strong>Correct Answer:</strong> {question.answer}
                    {question.explanation && <><br /><br />{question.explanation}</>}
                </div>
            )}

            {showFeedback && (answer || mode === 'review') && hasMismatch && (
                <div className="gemini-mismatch">
                    <div className="gemini-mismatch-header">⚠️ Gemini Disagrees</div>
                    <p>
                        Gemini's answer: <strong>{question.gemini_answer}</strong>
                        <span className="mismatch-vs">vs</span>
                        Provided answer: <strong>{question.answer}</strong>
                    </p>
                    <p className="mismatch-note">Please verify the correct answer manually.</p>
                </div>
            )}
        </div>
    )
}
