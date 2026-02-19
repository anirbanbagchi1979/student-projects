import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { collection, getDocs, orderBy, query, doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import QuestionCard from './QuestionCard'
import ResultsScreen from './ResultsScreen'
import Dashboard from './Dashboard'

export default function QuizApp() {
    const { user, signOut } = useAuth()
    const [allQuestions, setAllQuestions] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentIdx, setCurrentIdx] = useState(0)
    const [answers, setAnswers] = useState({})
    const [mode, setModeState] = useState('practice')
    const [filter, setFilterState] = useState('all')
    const [showResults, setShowResults] = useState(false)
    const [source, setSource] = useState('all')
    const [typeFilter, setTypeFilter] = useState('MC')

    // Spaced repetition state for practice mode
    const [practiceIdx, setPracticeIdx] = useState(0)
    const [practiceHistory, setPracticeHistory] = useState([])
    const stepRef = useRef(0)
    const repRef = useRef({})

    // Test mode timer
    const [timeLeft, setTimeLeft] = useState(60)
    const timerRef = useRef(null)

    // Load questions from Firestore
    useEffect(() => {
        async function load() {
            try {
                const q = query(collection(db, 'questions'), orderBy('number'))
                const snap = await getDocs(q)
                const data = snap.docs.map(d => d.data())
                setAllQuestions(data)
            } catch (err) {
                console.error('Error loading questions:', err)
            }
            setLoading(false)
        }
        load()
    }, [])

    // Load mastery data from Firestore when user and questions are ready
    useEffect(() => {
        if (!user || allQuestions.length === 0) return
        async function loadMastery() {
            try {
                const snap = await getDoc(doc(db, 'mastery', user.uid))
                if (snap.exists()) {
                    const data = snap.data()
                    if (data.answers) setAnswers(data.answers)
                    if (data.repData) repRef.current = data.repData
                    if (data.step) stepRef.current = data.step
                }
            } catch (err) {
                console.error('Error loading mastery:', err)
            }
        }
        loadMastery()
    }, [user, allQuestions])

    // Save mastery to Firestore (debounced)
    const saveTimeoutRef = useRef(null)
    function saveMastery(newAnswers) {
        if (!user) return
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                await setDoc(doc(db, 'mastery', user.uid), {
                    answers: newAnswers,
                    repData: repRef.current,
                    step: stepRef.current,
                    updatedAt: new Date().toISOString()
                })
            } catch (err) {
                console.error('Error saving mastery:', err)
            }
        }, 1000)
    }

    // Timer for test mode
    useEffect(() => {
        if (mode !== 'test') {
            clearInterval(timerRef.current)
            return
        }
        // Reset timer on question change
        setTimeLeft(60)
        clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    // Auto-advance when time runs out
                    navigate(1)
                    return 60
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timerRef.current)
    }, [mode, currentIdx])

    // Derive unique sources
    const sources = useMemo(() => {
        const s = new Set(allQuestions.map(q => q.source).filter(Boolean))
        return ['all', ...Array.from(s).sort()]
    }, [allQuestions])

    // Filter questions by source and type
    const questions = useMemo(() => {
        return allQuestions.filter(q => {
            if (source !== 'all' && q.source !== source) return false
            if (typeFilter !== 'all' && q.type !== typeFilter) return false
            return true
        })
    }, [allQuestions, source, typeFilter])

    // Compute filtered indices (for review mode filters)
    const filteredIndices = questions
        .map((_, i) => i)
        .filter(i => {
            const a = answers[i]
            if (filter === 'wrong') return a && !a.correct
            if (filter === 'unanswered') return !a
            return true
        })

    const realIdx = filteredIndices[currentIdx] ?? 0
    const activeIdx = mode === 'practice' ? practiceIdx : realIdx
    const activeQuestion = questions[activeIdx]
    const answeredCount = Object.keys(answers).length
    const correctCount = Object.values(answers).filter(x => x.correct).length

    function setMode(m) {
        setModeState(m)
        setFilterState('all')
        setCurrentIdx(0)
        setShowResults(false)
        if (m === 'test') setAnswers({})
        if (m === 'practice') {
            // Reset practice spaced repetition
            stepRef.current = 0
            repRef.current = {}
            setPracticeIdx(0)
            setPracticeHistory([])
            setAnswers({})
        }
    }

    function changeSource(s) {
        setSource(s)
        setAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
        setModeState('practice')
    }

    function changeType(t) {
        setTypeFilter(t)
        setAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
        setModeState('practice')
    }

    function setFilter(f) {
        setFilterState(f)
        setCurrentIdx(0)
    }

    function selectAnswer(letter) {
        const idx = mode === 'practice' ? practiceIdx : realIdx
        const q = questions[idx]
        const correctLetters = q.answer.split(',').map(s => s.trim())
        const isCorrect = correctLetters.length === 1 && correctLetters.includes(letter)
        const newAnswers = { ...answers, [idx]: { selected: letter, correct: isCorrect } }
        setAnswers(newAnswers)

        // Update spaced repetition data in practice mode
        if (mode === 'practice') {
            const rep = repRef.current[idx] || { correctStreak: 0, lastSeenStep: 0 }
            if (isCorrect) {
                rep.correctStreak++
            } else {
                rep.correctStreak = 0
            }
            rep.lastSeenStep = stepRef.current
            repRef.current[idx] = rep
        }

        // Save to Firestore
        saveMastery(newAnswers)
    }

    // Pick next question for spaced repetition
    const pickNextPractice = useCallback(() => {
        const step = stepRef.current
        const n = questions.length
        if (n === 0) return 0

        // Score each question: lower = higher priority
        const scored = questions.map((_, i) => {
            const rep = repRef.current[i]
            const ans = answers[i]
            if (!rep && !ans) {
                // Never seen: high priority, ordered by index
                return { i, score: i }
            }
            if (ans && !ans.correct) {
                // Wrong: come back soon (after ~2 steps)
                const gap = step - (rep?.lastSeenStep || 0)
                return { i, score: gap >= 2 ? -1000 + i : 5000 + i }
            }
            if (rep) {
                // Correct: push back based on streak
                const interval = Math.pow(2, rep.correctStreak) * 3
                const gap = step - rep.lastSeenStep
                return { i, score: gap >= interval ? 2000 + i : 10000 + (interval - gap) * 100 + i }
            }
            return { i, score: i }
        })

        scored.sort((a, b) => a.score - b.score)
        return scored[0].i
    }, [questions, answers])

    function navigate(dir) {
        if (mode === 'practice') {
            if (dir === -1) {
                // Go back in practice history
                if (practiceHistory.length === 0) return
                const prev = practiceHistory[practiceHistory.length - 1]
                setPracticeHistory(h => h.slice(0, -1))
                setPracticeIdx(prev)
            } else {
                // Pick next via spaced repetition
                stepRef.current++
                setPracticeHistory(h => [...h, practiceIdx])
                const next = pickNextPractice()
                setPracticeIdx(next)
                // Clear previous answer for this question so it can be re-attempted
                setAnswers(prev => {
                    const copy = { ...prev }
                    delete copy[next]
                    return copy
                })
            }
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }

        // Non-practice modes: sequential navigation
        const next = currentIdx + dir
        if (next < 0) return
        if (next >= filteredIndices.length) {
            setShowResults(true)
            return
        }
        setCurrentIdx(next)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    function retryWrong() {
        const wrongIndices = Object.entries(answers)
            .filter(([_, a]) => !a.correct)
            .map(([i]) => parseInt(i))
        if (wrongIndices.length === 0) return
        wrongIndices.forEach(i => {
            setAnswers(prev => {
                const copy = { ...prev }
                delete copy[i]
                return copy
            })
        })
        setFilterState('all')
        setCurrentIdx(0)
        setShowResults(false)
    }

    function resetQuiz() {
        setAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
    }

    if (loading) {
        return (
            <div className="app">
                <div className="loading-screen">
                    <div className="spinner"></div>
                    <p>Loading questions...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            {/* Header */}
            <div className="header">
                <div className="header-top">
                    <div className="badge">Science Olympiad</div>
                    <button className="user-btn" onClick={signOut}>
                        <img src={user.photoURL} alt="" className="user-avatar" />
                        <span className="signout-text">Sign Out</span>
                    </button>
                </div>
                <h1 className="app-title">Designer Genes C</h1>
                <p className="app-subtitle">{questions.length} Questions · Multiple Choice</p>
            </div>

            {/* Source & type selector */}
            <div className="source-bar">
                <label className="source-label" htmlFor="source-select">📚 Source</label>
                <select
                    id="source-select"
                    className="source-select"
                    value={source}
                    onChange={e => changeSource(e.target.value)}
                >
                    {sources.map(s => (
                        <option key={s} value={s}>
                            {s === 'all' ? 'All Sources' : s}
                        </option>
                    ))}
                </select>
            </div>
            <div className="type-bar">
                {['MC', 'Free Response', 'all'].map(t => (
                    <button
                        key={t}
                        className={`type-btn ${typeFilter === t ? 'active' : ''}`}
                        onClick={() => changeType(t)}
                    >
                        {t === 'all' ? 'All Types' : t}
                    </button>
                ))}
            </div>

            {/* Mode bar */}
            <div className="mode-bar">
                {['practice', 'test', 'review', 'dashboard'].map(m => (
                    <button
                        key={m}
                        className={`mode-btn ${mode === m ? 'active' : ''}`}
                        onClick={() => setMode(m)}
                    >
                        {m === 'practice' ? '📝 Practice' : m === 'test' ? '⏱ Test' : m === 'review' ? '📖 Review' : '📊 Dashboard'}
                    </button>
                ))}
            </div>

            {mode === 'dashboard' ? (
                <Dashboard questions={questions} answers={answers} />
            ) : showResults ? (
                <ResultsScreen
                    questions={questions}
                    answers={answers}
                    onReview={() => setMode('review')}
                    onRetryWrong={retryWrong}
                    onReset={resetQuiz}
                />
            ) : (
                <>
                    {/* Progress */}
                    <div className="progress-wrap">
                        <div className="progress-stats">
                            <span>
                                {mode === 'practice'
                                    ? `Step ${stepRef.current + 1} · Q${activeQuestion?.number ?? '?'}`
                                    : `Question ${currentIdx + 1} of ${filteredIndices.length}`
                                }
                            </span>
                            <span className="score">Score: {correctCount}/{answeredCount}</span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                            />
                        </div>
                    </div>

                    {/* Question grid (review mode) */}
                    {mode === 'review' && (
                        <>
                            <div className="filter-bar">
                                {['all', 'wrong', 'unanswered'].map(f => (
                                    <button
                                        key={f}
                                        className={`filter-btn ${filter === f ? 'active' : ''}`}
                                        onClick={() => setFilter(f)}
                                    >
                                        {f === 'all' ? 'All' : f === 'wrong' ? '❌ Wrong' : '⬜ Unanswered'}
                                    </button>
                                ))}
                            </div>
                            <div className="q-grid">
                                {questions.map((q, i) => {
                                    const a = answers[i]
                                    let cls = ''
                                    if (a) cls = a.correct ? 'answered-correct' : 'answered-wrong'
                                    if (i === realIdx) cls += ' current'
                                    return (
                                        <button
                                            key={i}
                                            className={`q-grid-btn ${cls}`}
                                            onClick={() => {
                                                const fIdx = filteredIndices.indexOf(i)
                                                if (fIdx !== -1) setCurrentIdx(fIdx)
                                            }}
                                        >
                                            {q.number}
                                        </button>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {/* Question */}
                    {(mode !== 'practice' && filteredIndices.length === 0) ? (
                        <div className="question-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            <p>No questions match this filter.</p>
                        </div>
                    ) : activeQuestion && (
                        <QuestionCard
                            question={activeQuestion}
                            answer={answers[activeIdx]}
                            mode={mode}
                            onSelectAnswer={selectAnswer}
                            timeLeft={mode === 'test' ? timeLeft : undefined}
                        />
                    )}

                    {/* Navigation */}
                    <div className="nav-row">
                        <button
                            className="nav-btn"
                            disabled={mode === 'practice' ? practiceHistory.length === 0 : currentIdx === 0}
                            onClick={() => navigate(-1)}
                        >
                            ← Prev
                        </button>
                        <button
                            className="nav-btn primary-btn"
                            onClick={() => navigate(1)}
                        >
                            {mode === 'practice' ? 'Next →' : (currentIdx >= filteredIndices.length - 1 ? '🏁 Finish' : 'Next →')}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
