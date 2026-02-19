import { useMemo } from 'react'
import { MASTERY_LEVELS } from '../lib/mastery'

// Seeded shuffle using question number for stability across re-renders
function seededShuffle(arr, seed) {
    const shuffled = [...arr]
    let s = seed
    for (let i = shuffled.length - 1; i > 0; i--) {
        s = (s * 16807 + 0) % 2147483647
        const j = s % (i + 1)
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export default function QuestionCard({ question, answer, mode, onSelectAnswer, timeLeft, masteryLevel }) {
    const isLocked = answer !== undefined || mode === 'review'

    // Detect Gemini mismatch for MC questions
    const geminiAnswer = question.gemini_answer?.trim().toUpperCase()
    const providedAnswer = question.answer?.trim().toUpperCase()
    const isMC = question.type === 'MC'
    const hasMismatch = isMC && geminiAnswer && providedAnswer && geminiAnswer !== providedAnswer

    const lvl = MASTERY_LEVELS[masteryLevel ?? 0]

    // Shuffle options with a stable seed based on question number
    const { shuffledOptions, correctNewLetters, originalCorrectLetters } = useMemo(() => {
        const origOptions = question.options
        const origCorrectLetters = question.answer.split(',').map(s => s.trim())

        // Extract text content from each option
        const optionTexts = origOptions.map(opt => ({
            originalLetter: opt.charAt(0),
            text: opt.substring(3),
            isCorrect: origCorrectLetters.includes(opt.charAt(0))
        }))

        // Shuffle
        const shuffled = seededShuffle(optionTexts, question.number * 7919)

        // Assign new letters
        const newOptions = shuffled.map((opt, i) => ({
            letter: LETTERS[i],
            text: opt.text,
            isCorrect: opt.isCorrect,
            originalLetter: opt.originalLetter
        }))

        const correctNew = newOptions.filter(o => o.isCorrect).map(o => o.letter)

        return {
            shuffledOptions: newOptions,
            correctNewLetters: correctNew,
            originalCorrectLetters: origCorrectLetters
        }
    }, [question.number, question.options, question.answer])

    return (
        <div className="question-card">
            <div className="q-header-row">
                <div className="q-number">Question {question.number}</div>
                <div className="q-header-right">
                    <span className="mastery-badge" style={{ color: lvl.color }}>{lvl.icon} {lvl.name}</span>
                    {mode === 'test' && timeLeft !== undefined && (
                        <span className={`timer-badge ${timeLeft <= 10 ? 'timer-danger' : timeLeft <= 30 ? 'timer-warn' : ''}`}>
                            ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                        </span>
                    )}
                </div>
            </div>
            <div className="q-text">{question.question}</div>

            {question.contextMissing && (
                <div className="context-missing-banner">
                    <span className="context-missing-icon">📎</span>
                    <div>
                        <strong>Context Missing</strong>
                        <p>{question.contextReason || 'This question references external material not included here.'}</p>
                    </div>
                </div>
            )}

            <div className="options">
                {shuffledOptions.map((opt, i) => {
                    let cls = ''
                    if (answer) {
                        if (opt.isCorrect) cls = 'correct'
                        if (answer.selected === opt.letter && !answer.correct) cls = 'wrong'
                        if (answer.selected === opt.letter && answer.correct) cls = 'correct'
                    }

                    return (
                        <button
                            key={i}
                            className={`option-btn ${cls} ${isLocked ? 'locked' : ''}`}
                            onClick={() => !isLocked && onSelectAnswer(opt.letter, opt.isCorrect)}
                        >
                            <span className="option-letter">{opt.letter}</span>
                            <span className="option-text">{opt.text}</span>
                        </button>
                    )
                })}
            </div>

            {(answer || mode === 'review') && (
                <div className="explanation-box">
                    <strong>Correct Answer:</strong> {correctNewLetters.join(', ')}
                    {question.explanation && <><br /><br />{question.explanation}</>}
                </div>
            )}

            {(answer || mode === 'review') && hasMismatch && (() => {
                const geminiOpt = shuffledOptions.find(o => o.originalLetter === question.gemini_answer?.trim().toUpperCase())
                const providedOpt = shuffledOptions.find(o => o.originalLetter === question.answer?.trim().toUpperCase())
                return (
                    <div className="gemini-mismatch">
                        <div className="gemini-mismatch-header">⚠️ Gemini Disagrees</div>
                        <p>
                            Gemini's answer: <strong>{geminiOpt ? `${geminiOpt.letter}) ${geminiOpt.text}` : question.gemini_answer}</strong>
                            <span className="mismatch-vs">vs</span>
                            Provided answer: <strong>{providedOpt ? `${providedOpt.letter}) ${providedOpt.text}` : question.answer}</strong>
                        </p>
                        <p className="mismatch-note">Please verify the correct answer manually.</p>
                    </div>
                )
            })()}
        </div>
    )
}
