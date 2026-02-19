export default function QuestionCard({ question, answer, mode, onSelectAnswer }) {
    const isLocked = answer !== undefined || mode === 'review'
    const correctLetters = question.answer.split(',').map(s => s.trim())

    return (
        <div className="question-card">
            <div className="q-number">Question {question.number}</div>
            <div className="q-text">{question.question}</div>

            <div className="options">
                {question.options.map((opt, i) => {
                    const letter = opt.charAt(0)
                    const text = opt.substring(3)

                    let cls = ''
                    if (answer) {
                        if (correctLetters.includes(letter)) cls = 'correct'
                        if (answer.selected === letter && !answer.correct && !correctLetters.includes(letter)) cls = 'wrong'
                        if (answer.selected === letter && answer.correct) cls = 'correct'
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

            {(answer || mode === 'review') && (
                <div className="explanation-box">
                    <strong>Correct Answer:</strong> {question.answer}
                    {question.explanation && <><br /><br />{question.explanation}</>}
                </div>
            )}
        </div>
    )
}
