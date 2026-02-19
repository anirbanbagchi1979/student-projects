import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { collection, getDocs, orderBy, query, doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { updateMastery, applyDecay, pickNextQuestion, createEmptyMastery } from '../lib/mastery'
import QuestionCard from './QuestionCard'
import ResultsScreen from './ResultsScreen'
import Dashboard from './Dashboard'

export default function QuizApp() {
    const { user, signOut } = useAuth()
    const [allQuestions, setAllQuestions] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentIdx, setCurrentIdx] = useState(0)
    const [sessionAnswers, setSessionAnswers] = useState({}) // current session answers (index → {selected, correct})
    const [masteryMap, setMasteryMap] = useState({}) // persistent mastery (qNumber → mastery data)
    const [mode, setModeState] = useState('practice')
    const [filter, setFilterState] = useState('all')
    const [showResults, setShowResults] = useState(false)
    const [source, setSource] = useState('all')
    const [typeFilter, setTypeFilter] = useState('MC')
    const [hideContextMissing, setHideContextMissing] = useState(true)

    // Spaced repetition state for practice mode
    const [practiceIdx, setPracticeIdx] = useState(0)
    const [practiceHistory, setPracticeHistory] = useState([])

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
                console.log('Loaded', data.length, 'questions from Firestore')
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
                    if (data.masteryMap) {
                        // Apply time decay on load
                        const decayed = {}
                        for (const [k, v] of Object.entries(data.masteryMap)) {
                            decayed[k] = applyDecay(v)
                        }
                        setMasteryMap(decayed)
                        console.log('Loaded mastery for', Object.keys(decayed).length, 'questions')
                    }
                }
            } catch (err) {
                console.error('Error loading mastery:', err)
            }
        }
        loadMastery()
    }, [user, allQuestions])

    // Save mastery to Firestore (debounced)
    const saveTimeoutRef = useRef(null)
    function saveMasteryToFirestore(newMap) {
        if (!user) return
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                await setDoc(doc(db, 'mastery', user.uid), {
                    masteryMap: newMap,
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

    // Filter and shuffle questions by source and type
    const questions = useMemo(() => {
        const filtered = allQuestions.filter(q => {
            if (source !== 'all' && q.source !== source) return false
            if (typeFilter !== 'all' && q.type !== typeFilter) return false
            if (hideContextMissing && q.contextMissing) return false
            return true
        })
        // Shuffle questions with a seed based on filter combo
        const seed = (source + typeFilter).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 31
        const shuffled = [...filtered]
        let s = seed || 1
        for (let i = shuffled.length - 1; i > 0; i--) {
            s = (s * 16807 + 0) % 2147483647
            const j = s % (i + 1)
                ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
    }, [allQuestions, source, typeFilter, hideContextMissing])

    // Compute filtered indices (for review mode filters)
    const filteredIndices = questions
        .map((_, i) => i)
        .filter(i => {
            const a = sessionAnswers[i]
            if (filter === 'wrong') return a && !a.correct
            if (filter === 'unanswered') return !a
            return true
        })

    const realIdx = filteredIndices[currentIdx] ?? 0
    const activeIdx = mode === 'practice' ? practiceIdx : realIdx
    const activeQuestion = questions[activeIdx]
    const answeredCount = Object.keys(sessionAnswers).length
    const correctCount = Object.values(sessionAnswers).filter(x => x.correct).length

    function setMode(m) {
        setModeState(m)
        setFilterState('all')
        setCurrentIdx(0)
        setShowResults(false)
        // Reset session answers on mode switch (but mastery persists)
        setSessionAnswers({})
        if (m === 'practice') {
            setPracticeIdx(0)
            setPracticeHistory([])
        }
    }

    function changeSource(s) {
        setSource(s)
        setSessionAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
        setModeState('practice')
    }

    function changeType(t) {
        setTypeFilter(t)
        setSessionAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
        setModeState('practice')
    }

    function setFilter(f) {
        setFilterState(f)
        setCurrentIdx(0)
    }

    function selectAnswer(letter, isCorrect) {
        const idx = mode === 'practice' ? practiceIdx : realIdx
        const q = questions[idx]

        // Update session answers
        setSessionAnswers(prev => ({ ...prev, [idx]: { selected: letter, correct: isCorrect } }))

        // Update permanent mastery (all modes contribute)
        const key = String(q.number)
        const current = masteryMap[key] || createEmptyMastery()
        const updated = updateMastery(current, isCorrect)
        const newMap = { ...masteryMap, [key]: updated }
        setMasteryMap(newMap)

        // Save to Firestore
        saveMasteryToFirestore(newMap)
    }

    // Pick next question for spaced repetition using mastery data
    const pickNextPractice = useCallback(() => {
        // Random cooldown of 1-4 recent questions to skip
        const cooldown = Math.floor(Math.random() * 4) + 1
        const recent = [...practiceHistory.slice(-cooldown), practiceIdx]
        return pickNextQuestion(questions, masteryMap, recent)
    }, [questions, masteryMap, practiceHistory, practiceIdx])

    function navigate(dir) {
        if (mode === 'practice') {
            if (dir === -1) {
                if (practiceHistory.length === 0) return
                const prev = practiceHistory[practiceHistory.length - 1]
                setPracticeHistory(h => h.slice(0, -1))
                setPracticeIdx(prev)
            } else {
                setPracticeHistory(h => [...h, practiceIdx])
                const next = pickNextPractice()
                setPracticeIdx(next)
                // Clear session answer so it can be re-attempted
                setSessionAnswers(prev => {
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
        const wrongIndices = Object.entries(sessionAnswers)
            .filter(([_, a]) => !a.correct)
            .map(([i]) => parseInt(i))
        if (wrongIndices.length === 0) return
        wrongIndices.forEach(i => {
            setSessionAnswers(prev => {
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
        setSessionAnswers({})
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

            {/* Context filter toggle */}
            <div className="context-filter-bar">
                <button
                    className={`context-filter-btn ${hideContextMissing ? 'active' : ''}`}
                    onClick={() => setHideContextMissing(!hideContextMissing)}
                >
                    📎 {hideContextMissing ? 'Context-missing hidden' : 'Showing all questions'}
                </button>
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
                <Dashboard questions={questions} allQuestions={allQuestions} answers={sessionAnswers} masteryMap={masteryMap} />
            ) : showResults ? (
                <ResultsScreen
                    questions={questions}
                    answers={sessionAnswers}
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
                                    ? `Step ${practiceHistory.length + 1} · Q${activeQuestion?.number ?? '?'}`
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
                                    const a = sessionAnswers[i]
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
                            answer={sessionAnswers[activeIdx]}
                            mode={mode}
                            onSelectAnswer={selectAnswer}
                            timeLeft={mode === 'test' ? timeLeft : undefined}
                            masteryLevel={masteryMap[String(activeQuestion?.number)]?.level ?? 0}
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
