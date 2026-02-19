import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
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
    const currentQuestion = questions[realIdx]
    const answeredCount = Object.keys(answers).length
    const correctCount = Object.values(answers).filter(x => x.correct).length

    function setMode(m) {
        setModeState(m)
        setFilterState('all')
        setCurrentIdx(0)
        setShowResults(false)
        if (m === 'test') setAnswers({})
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
        const q = questions[realIdx]
        const correctLetters = q.answer.split(',').map(s => s.trim())
        const isCorrect = correctLetters.length === 1 && correctLetters.includes(letter)
        setAnswers(prev => ({ ...prev, [realIdx]: { selected: letter, correct: isCorrect } }))
    }

    function navigate(dir) {
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
                            <span>Question {currentIdx + 1} of {filteredIndices.length}</span>
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
                    {filteredIndices.length === 0 ? (
                        <div className="question-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            <p>No questions match this filter.</p>
                        </div>
                    ) : currentQuestion && (
                        <QuestionCard
                            question={currentQuestion}
                            answer={answers[realIdx]}
                            mode={mode}
                            onSelectAnswer={selectAnswer}
                        />
                    )}

                    {/* Navigation */}
                    <div className="nav-row">
                        <button
                            className="nav-btn"
                            disabled={currentIdx === 0}
                            onClick={() => navigate(-1)}
                        >
                            ← Prev
                        </button>
                        <button
                            className="nav-btn primary-btn"
                            onClick={() => navigate(1)}
                        >
                            {currentIdx >= filteredIndices.length - 1 ? '🏁 Finish' : 'Next →'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
