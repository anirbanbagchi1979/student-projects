import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { collection, getDocs, orderBy, query, doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { updateMastery, applyDecay, pickNextQuestion, createEmptyMastery, MASTERY_LEVELS } from '../lib/mastery'
import { updateStreak, createEmptyStreak, computeBadgeStats, checkBadges, BADGES } from '../lib/gamification'
import { EVENTS, DEFAULT_EVENT, getEvent } from '../lib/events'
import QuestionCard from './QuestionCard'
import ResultsScreen from './ResultsScreen'
import Dashboard from './Dashboard'
import AdminPanel from './AdminPanel'

export default function QuizApp() {
    const { user, signOut } = useAuth()
    const [allQuestions, setAllQuestions] = useState([])
    const [loading, setLoading] = useState(true)

    // Screen navigation: 'home' | 'event' | 'playing'
    const [screen, setScreen] = useState('home')
    const [showProfileMenu, setShowProfileMenu] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [showAdmin, setShowAdmin] = useState(false)

    const [currentIdx, setCurrentIdx] = useState(0)
    const [sessionAnswers, setSessionAnswers] = useState({})
    const [mode, setModeState] = useState('practice') // practice | test | review
    const [filter, setFilterState] = useState('all')
    const [showResults, setShowResults] = useState(false)
    const [source, setSource] = useState('all')
    const [typeFilter, setTypeFilter] = useState('MC')
    const [hideContextMissing, setHideContextMissing] = useState(true)

    // Event state
    const [event, setEventState] = useState(DEFAULT_EVENT)
    const currentEvent = getEvent(event)

    // Per-event mastery/gamification state (scoped to current event)
    const [eventsMastery, setEventsMastery] = useState({}) // { slug: { masteryMap, streakData, earnedBadges } }
    const [allUsersMastery, setAllUsersMastery] = useState([])

    // Global cross-event state
    const [globalData, setGlobalData] = useState({
        dailyStreak: createEmptyStreak(),
        eventsToday: [],
    })

    // Derive current event's mastery/streak/badges from the events map
    const eventData = eventsMastery[event] || { masteryMap: {}, streakData: createEmptyStreak(), earnedBadges: [] }
    const masteryMap = eventData.masteryMap
    const streakData = eventData.streakData
    const earnedBadges = eventData.earnedBadges

    // Session gamification
    const [sessionCorrectStreak, setSessionCorrectStreak] = useState(0)
    const [sessionMaxStreak, setSessionMaxStreak] = useState(0)
    const [sessionMasteries, setSessionMasteries] = useState(0)
    const [badgeToast, setBadgeToast] = useState(null)

    // Combo & feedback state
    const [comboFeedback, setComboFeedback] = useState(null)
    const [bonusTime, setBonusTime] = useState(null)

    // Spaced repetition state for practice mode
    const [practiceIdx, setPracticeIdx] = useState(0)
    const [practiceHistory, setPracticeHistory] = useState([])

    // Test mode timer
    const [timeLeft, setTimeLeft] = useState(60)
    const timerRef = useRef(null)

    // Load questions from Firestore
    async function reloadQuestions() {
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

    useEffect(() => {
        reloadQuestions()
    }, [])

    // Load mastery data from Firestore — handles migration from old flat format
    useEffect(() => {
        if (!user || allQuestions.length === 0) return
        async function loadMastery() {
            try {
                const snap = await getDoc(doc(db, 'mastery', user.uid))
                if (snap.exists()) {
                    const data = snap.data()

                    if (data.events) {
                        // New multi-event format
                        const loaded = {}
                        for (const [slug, evtData] of Object.entries(data.events)) {
                            const decayed = {}
                            if (evtData.masteryMap) {
                                for (const [k, v] of Object.entries(evtData.masteryMap)) {
                                    decayed[k] = applyDecay(v)
                                }
                            }
                            loaded[slug] = {
                                masteryMap: decayed,
                                streakData: evtData.streakData || createEmptyStreak(),
                                earnedBadges: evtData.earnedBadges || [],
                            }
                        }
                        setEventsMastery(loaded)
                        console.log('Loaded multi-event mastery for', Object.keys(loaded).length, 'events')
                    } else if (data.masteryMap) {
                        // OLD flat format — migrate to designer-genes event
                        console.log('Migrating old flat mastery to multi-event format...')
                        const decayed = {}
                        for (const [k, v] of Object.entries(data.masteryMap)) {
                            decayed[k] = applyDecay(v)
                        }
                        const migrated = {
                            [DEFAULT_EVENT]: {
                                masteryMap: decayed,
                                streakData: data.streakData || createEmptyStreak(),
                                earnedBadges: data.earnedBadges || [],
                            }
                        }
                        setEventsMastery(migrated)
                        // Save migrated format back to Firestore
                        await setDoc(doc(db, 'mastery', user.uid), {
                            events: {
                                [DEFAULT_EVENT]: {
                                    masteryMap: decayed,
                                    streakData: data.streakData || createEmptyStreak(),
                                    earnedBadges: data.earnedBadges || [],
                                }
                            },
                            global: {
                                dailyStreak: data.streakData || createEmptyStreak(),
                                eventsToday: [],
                            },
                            displayName: user.displayName || '',
                            email: user.email || '',
                            photoURL: user.photoURL || '',
                            updatedAt: new Date().toISOString()
                        })
                        console.log('Migration complete')
                    }

                    // Load global data
                    if (data.global) {
                        setGlobalData({
                            dailyStreak: data.global.dailyStreak || createEmptyStreak(),
                            eventsToday: data.global.eventsToday || [],
                        })
                    }
                }
            } catch (err) {
                console.error('Error loading mastery:', err)
            }
        }
        loadMastery()
    }, [user, allQuestions])

    // Load all users' mastery data for leaderboard
    useEffect(() => {
        if (allQuestions.length === 0) return
        async function loadAllMastery() {
            try {
                const snap = await getDocs(collection(db, 'mastery'))
                const users = []
                snap.forEach(d => {
                    const data = d.data()
                    // Support both old and new format
                    const eventsData = data.events || (data.masteryMap ? { [DEFAULT_EVENT]: { masteryMap: data.masteryMap } } : {})
                    users.push({
                        uid: d.id,
                        name: (data.displayName || data.email || d.id.slice(0, 8)).split(' ')[0],
                        photoURL: data.photoURL || null,
                        events: eventsData,
                        updatedAt: data.updatedAt
                    })
                })
                setAllUsersMastery(users)
            } catch (err) {
                console.error('Error loading leaderboard:', err)
            }
        }
        loadAllMastery()
    }, [allQuestions])

    // Save mastery to Firestore (debounced)
    const saveTimeoutRef = useRef(null)
    function saveMasteryToFirestore(newEventsMastery, newGlobal = globalData) {
        if (!user) return
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                await setDoc(doc(db, 'mastery', user.uid), {
                    events: newEventsMastery,
                    global: newGlobal,
                    displayName: user.displayName || '',
                    email: user.email || '',
                    photoURL: user.photoURL || '',
                    updatedAt: new Date().toISOString()
                })
            } catch (err) {
                console.error('Error saving mastery:', err)
            }
        }, 1000)
    }

    // Timer for test mode
    useEffect(() => {
        if (mode !== 'test' || screen !== 'playing') {
            clearInterval(timerRef.current)
            return
        }
        setTimeLeft(60)
        clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    navigate(1)
                    return 60
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timerRef.current)
    }, [mode, currentIdx, screen])

    // Filter questions by event first, then by source/type
    const eventQuestions = useMemo(() => {
        return allQuestions.filter(q => (q.event || DEFAULT_EVENT) === event)
    }, [allQuestions, event])

    // Derive unique sources for the current event
    const sources = useMemo(() => {
        const s = new Set(eventQuestions.map(q => q.source).filter(Boolean))
        return ['all', ...Array.from(s).sort()]
    }, [eventQuestions])

    // Filter and shuffle questions by source and type
    const questions = useMemo(() => {
        const filtered = eventQuestions.filter(q => {
            if (source !== 'all' && q.source !== source) return false
            if (typeFilter !== 'all' && q.type !== typeFilter) return false
            if (hideContextMissing && q.contextMissing) return false
            return true
        })
        const seed = (source + typeFilter).split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 31
        const shuffled = [...filtered]
        let s = seed || 1
        for (let i = shuffled.length - 1; i > 0; i--) {
            s = (s * 16807 + 0) % 2147483647
            const j = s % (i + 1)
                ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled
    }, [eventQuestions, source, typeFilter, hideContextMissing])

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

    // ── Navigation helpers ──

    function selectEvent(slug) {
        setEventState(slug)
        setSessionAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
        setSource('all')
        setTypeFilter('MC')
        setPracticeIdx(0)
        setPracticeHistory([])
        setSessionCorrectStreak(0)
        setSessionMaxStreak(0)
        setSessionMasteries(0)
        setScreen('event')
        setShowSettings(false)
    }

    function startPlay(m) {
        setModeState(m)
        setFilterState('all')
        setCurrentIdx(0)
        setShowResults(false)
        setSessionAnswers({})
        setSessionCorrectStreak(0)
        setSessionMaxStreak(0)
        setSessionMasteries(0)
        if (m === 'practice') {
            setPracticeIdx(0)
            setPracticeHistory([])
        }
        setScreen('playing')
        setShowSettings(false)
    }

    function goHome() {
        setScreen('home')
        setShowResults(false)
        setShowSettings(false)
        setShowAdmin(false)
    }

    function goBackToEvent() {
        setScreen('event')
        setShowResults(false)
        clearInterval(timerRef.current)
    }

    function setMode(m) {
        setModeState(m)
        setFilterState('all')
        setCurrentIdx(0)
        setShowResults(false)
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
    }

    function changeType(t) {
        setTypeFilter(t)
        setSessionAnswers({})
        setCurrentIdx(0)
        setFilterState('all')
        setShowResults(false)
    }

    function selectAnswer(letter, isCorrect) {
        const idx = mode === 'practice' ? practiceIdx : realIdx
        const q = questions[idx]

        setSessionAnswers(prev => ({ ...prev, [idx]: { selected: letter, correct: isCorrect } }))

        // Update permanent mastery (per event)
        const key = String(q.number)
        const current = masteryMap[key] || createEmptyMastery()
        const updated = updateMastery(current, isCorrect)
        const newMasteryMap = { ...masteryMap, [key]: updated }

        // Update event mastery
        const newEventData = {
            ...eventData,
            masteryMap: newMasteryMap,
        }

        // Track session correct streak
        let newSessionStreak = sessionCorrectStreak
        let newMaxStreak = sessionMaxStreak
        if (isCorrect) {
            newSessionStreak++
            if (newSessionStreak > newMaxStreak) newMaxStreak = newSessionStreak
        } else {
            newSessionStreak = 0
        }
        setSessionCorrectStreak(newSessionStreak)
        setSessionMaxStreak(newMaxStreak)

        // Combo feedback toast
        const feedbackKey = Date.now()
        if (isCorrect) {
            setComboFeedback({ type: 'correct', combo: newSessionStreak, key: feedbackKey })
            if (mode === 'test') {
                const bonus = newSessionStreak >= 5 ? 5 : 3
                setTimeLeft(t => t + bonus)
                setBonusTime({ amount: bonus, key: feedbackKey })
                setTimeout(() => setBonusTime(null), 1200)
            }
        } else {
            if (sessionCorrectStreak >= 2) {
                setComboFeedback({ type: 'broken', combo: sessionCorrectStreak, key: feedbackKey })
            } else {
                setComboFeedback({ type: 'wrong', combo: 0, key: feedbackKey })
            }
        }
        setTimeout(() => setComboFeedback(null), 1500)

        // Track session masteries for streak shield
        let newSessionMasteries = sessionMasteries
        if (updated.level >= 5 && (current.level || 0) < 5) {
            newSessionMasteries++
            setSessionMasteries(newSessionMasteries)
        }

        // Update per-event streak
        const newStreak = updateStreak(eventData.streakData)
        if (newSessionMasteries > 0 && newSessionMasteries % 5 === 0 && newSessionMasteries > sessionMasteries) {
            newStreak.streakShields = (newStreak.streakShields || 0) + 1
            newStreak.totalShieldsEarned = (newStreak.totalShieldsEarned || 0) + 1
        }
        newEventData.streakData = newStreak

        // Check per-event badges
        const stats = computeBadgeStats(newMasteryMap, eventQuestions, newStreak, { maxCorrectStreak: newMaxStreak })
        const newlyEarned = checkBadges(stats, eventData.earnedBadges)
        let newBadges = eventData.earnedBadges
        if (newlyEarned.length > 0) {
            newBadges = [...eventData.earnedBadges, ...newlyEarned.map(b => b.id)]
            newEventData.earnedBadges = newBadges
            setBadgeToast(newlyEarned[0])
            setTimeout(() => setBadgeToast(null), 3000)
        }

        // Update events mastery state
        const newEventsMastery = { ...eventsMastery, [event]: newEventData }
        setEventsMastery(newEventsMastery)

        // Update global data
        const newGlobal = { ...globalData }
        newGlobal.dailyStreak = updateStreak(globalData.dailyStreak)
        const today = new Date().toISOString().split('T')[0]
        if (!newGlobal.eventsToday || newGlobal.eventsToday._date !== today) {
            newGlobal.eventsToday = { _date: today, events: [event] }
        } else if (!newGlobal.eventsToday.events.includes(event)) {
            newGlobal.eventsToday = { ...newGlobal.eventsToday, events: [...newGlobal.eventsToday.events, event] }
        }
        setGlobalData(newGlobal)

        saveMasteryToFirestore(newEventsMastery, newGlobal)
    }

    // Pick next question for spaced repetition using mastery data
    const pickNextPractice = useCallback(() => {
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
                setSessionAnswers(prev => {
                    const copy = { ...prev }
                    delete copy[next]
                    return copy
                })
            }
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
        }

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

    // ── Compute per-event stats for home page event cards ──
    function getEventStats(slug) {
        const evtQuestions = allQuestions.filter(q => (q.event || DEFAULT_EVENT) === slug)
        const mcQuestions = evtQuestions.filter(q => q.type === 'MC' && !q.contextMissing)
        const total = mcQuestions.length
        const mm = eventsMastery[slug]?.masteryMap || {}
        const mastered = Object.values(mm).filter(m => m.level >= 4).length
        const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
        return { total, mastered, pct, totalQuestions: evtQuestions.length }
    }

    // ── Global stats for home page ──
    const globalStreak = globalData?.dailyStreak?.currentStreak || 0
    const totalMasteredAll = Object.keys(eventsMastery).reduce((sum, slug) => {
        const mm = eventsMastery[slug]?.masteryMap || {}
        return sum + Object.values(mm).filter(m => m.level >= 5).length
    }, 0)
    const totalBadgesAll = Object.keys(eventsMastery).reduce((sum, slug) => {
        return sum + (eventsMastery[slug]?.earnedBadges?.length || 0)
    }, 0)

    // Close profile menu on outside click
    useEffect(() => {
        if (!showProfileMenu) return
        function handleClick() { setShowProfileMenu(false) }
        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [showProfileMenu])

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

    // ═══════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════

    return (
        <div className="app" data-mode={mode} data-screen={screen}>
            {/* Badge toast (global) */}
            {badgeToast && (
                <div className="badge-toast">
                    <span className="badge-toast-icon">{badgeToast.icon}</span>
                    <div>
                        <strong>Achievement Unlocked! 🎮</strong>
                        <p>{badgeToast.name} — {badgeToast.description}</p>
                    </div>
                </div>
            )}

            {/* ── ADMIN PANEL (full-screen overlay) ── */}
            {showAdmin && (
                <div className="admin-overlay">
                    <div className="admin-overlay-header">
                        <button className="back-btn" onClick={() => setShowAdmin(false)}>← Back</button>
                        <h2>⚙️ Admin Panel</h2>
                    </div>
                    <AdminPanel onQuestionsUploaded={reloadQuestions} />
                </div>
            )}

            {/* ── SCREEN: HOME ── */}
            {!showAdmin && screen === 'home' && (
                <>
                    {/* Header */}
                    <div className="header">
                        <div className="header-top">
                            <div className="badge">Multiple Choice Grind 🧬</div>
                            <div className="profile-wrap" onClick={e => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu) }}>
                                <img src={user.photoURL} alt="" className="user-avatar" />
                                {showProfileMenu && (
                                    <div className="profile-dropdown">
                                        <div className="profile-dropdown-name">{user.displayName}</div>
                                        {user.email === 'anirban.bagchi@gmail.com' && (
                                            <button className="profile-dropdown-item" onClick={() => { setShowAdmin(true); setShowProfileMenu(false) }}>
                                                ⚙️ Admin Panel
                                            </button>
                                        )}
                                        <button className="profile-dropdown-item" onClick={signOut}>
                                            🚪 Sign Out
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="app-subtitle home-greeting">
                            Hey {user.displayName?.split(' ')[0] || 'there'}! 👋
                        </p>
                    </div>

                    {/* Global laurels */}
                    <div className="home-laurels">
                        <div className="laurel-card">
                            <div className="laurel-icon">🔥</div>
                            <div className="laurel-value">{globalStreak}</div>
                            <div className="laurel-label">Day Streak</div>
                        </div>
                        <div className="laurel-card">
                            <div className="laurel-icon">⭐</div>
                            <div className="laurel-value">{totalMasteredAll}</div>
                            <div className="laurel-label">Mastered</div>
                        </div>
                        <div className="laurel-card">
                            <div className="laurel-icon">🏆</div>
                            <div className="laurel-value">{totalBadgesAll}</div>
                            <div className="laurel-label">Trophies</div>
                        </div>
                        <div className="laurel-card">
                            <div className="laurel-icon">📚</div>
                            <div className="laurel-value">{Object.keys(eventsMastery).filter(s => {
                                const mm = eventsMastery[s]?.masteryMap || {}
                                return Object.values(mm).some(m => m.level >= 1)
                            }).length}/{EVENTS.length}</div>
                            <div className="laurel-label">Events</div>
                        </div>
                    </div>

                    {/* Event cards */}
                    <h2 className="section-title">Choose Your Event</h2>
                    <div className="event-cards-grid">
                        {EVENTS.map(e => {
                            const stats = getEventStats(e.slug)
                            return (
                                <button
                                    key={e.slug}
                                    className="event-card"
                                    onClick={() => selectEvent(e.slug)}
                                >
                                    <div className="event-card-icon">{e.icon}</div>
                                    <div className="event-card-name">{e.name}</div>
                                    <div className="event-card-stats">
                                        {stats.totalQuestions > 0 ? (
                                            <>
                                                <div className="event-card-progress-bar">
                                                    <div className="event-card-progress-fill" style={{ width: `${stats.pct}%` }} />
                                                </div>
                                                <span className="event-card-count">{stats.mastered}/{stats.total} · {stats.pct}%</span>
                                            </>
                                        ) : (
                                            <span className="event-card-count">No questions yet</span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </>
            )}

            {/* ── SCREEN: EVENT ── */}
            {!showAdmin && screen === 'event' && (
                <>
                    {/* Header */}
                    <div className="header event-header">
                        <div className="header-top">
                            <button className="back-btn" onClick={goHome}>← Home</button>
                            <div className="event-header-right">
                                <button
                                    className={`settings-btn ${showSettings ? 'active' : ''}`}
                                    onClick={() => setShowSettings(!showSettings)}
                                    title="Settings"
                                >⚙️</button>
                                <div className="profile-wrap" onClick={e => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu) }}>
                                    <img src={user.photoURL} alt="" className="user-avatar" />
                                    {showProfileMenu && (
                                        <div className="profile-dropdown">
                                            <div className="profile-dropdown-name">{user.displayName}</div>
                                            {user.email === 'anirban.bagchi@gmail.com' && (
                                                <button className="profile-dropdown-item" onClick={() => { setShowAdmin(true); setShowProfileMenu(false) }}>
                                                    ⚙️ Admin Panel
                                                </button>
                                            )}
                                            <button className="profile-dropdown-item" onClick={signOut}>
                                                🚪 Sign Out
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <h1 className="app-title">{currentEvent.icon} {currentEvent.name}</h1>
                        <p className="app-subtitle">
                            {questions.length} Qs loaded
                            {streakData.currentStreak > 0 && (
                                <span className="streak-display"> · 🔥{streakData.currentStreak}</span>
                            )}
                            {streakData.streakShields > 0 && (
                                <span className="shield-display"> · 🛡️{streakData.streakShields}</span>
                            )}
                        </p>
                    </div>

                    {/* Settings panel (slide-down) */}
                    {showSettings && (
                        <div className="settings-panel">
                            <div className="settings-panel-header">
                                <h3>⚙️ Settings</h3>
                                <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
                            </div>
                            <div className="settings-group">
                                <label className="settings-label">Question Type</label>
                                <div className="settings-options">
                                    {['MC', 'Free Response', 'all'].map(t => (
                                        <button
                                            key={t}
                                            className={`settings-opt-btn ${typeFilter === t ? 'active' : ''}`}
                                            onClick={() => changeType(t)}
                                        >
                                            {t === 'all' ? 'All' : t === 'MC' ? 'MC Only' : 'Written'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="settings-group">
                                <label className="settings-label">📦 Pack</label>
                                <select
                                    className="settings-select"
                                    value={source}
                                    onChange={e => changeSource(e.target.value)}
                                >
                                    {sources.map(s => (
                                        <option key={s} value={s}>
                                            {s === 'all' ? 'All Packs' : s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="settings-group">
                                <label className="settings-toggle-row">
                                    <input
                                        type="checkbox"
                                        checked={hideContextMissing}
                                        onChange={() => setHideContextMissing(!hideContextMissing)}
                                    />
                                    <span>Skip incomplete questions</span>
                                </label>
                            </div>
                            <div className="settings-group">
                                <button
                                    className="settings-review-btn"
                                    onClick={() => startPlay('review')}
                                >
                                    📖 Review Mode
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Play buttons */}
                    <div className="play-buttons">
                        <button className="play-btn play-btn-grind" onClick={() => startPlay('practice')}>
                            <span className="play-btn-icon">🍳</span>
                            <span className="play-btn-label">Grind</span>
                            <span className="play-btn-desc">Spaced repetition</span>
                        </button>
                        <button className="play-btn play-btn-blitz" onClick={() => startPlay('test')}>
                            <span className="play-btn-icon">⏱</span>
                            <span className="play-btn-label">Blitz</span>
                            <span className="play-btn-desc">60s per question</span>
                        </button>
                    </div>

                    {/* Event Dashboard (stats, badges, leaderboard) */}
                    <Dashboard
                        questions={questions}
                        allQuestions={eventQuestions}
                        answers={sessionAnswers}
                        masteryMap={masteryMap}
                        allUsersMastery={allUsersMastery}
                        currentUser={user}
                        streakData={streakData}
                        earnedBadges={earnedBadges}
                        currentEvent={event}
                        globalData={globalData}
                        eventsMastery={eventsMastery}
                    />
                </>
            )}

            {/* ── SCREEN: PLAYING ── */}
            {!showAdmin && screen === 'playing' && (
                <>
                    {/* Minimal play header */}
                    <div className="play-header">
                        <button className="back-btn" onClick={goBackToEvent}>← Back</button>
                        <div className="play-header-info">
                            <span className="play-header-event">{currentEvent.icon} {currentEvent.name}</span>
                            <span className="play-header-progress">
                                {mode === 'practice'
                                    ? `Step ${practiceHistory.length + 1}`
                                    : `Q ${currentIdx + 1}/${filteredIndices.length}`
                                }
                            </span>
                            {mode === 'test' && (
                                <span className={`play-header-timer ${timeLeft <= 10 ? 'danger' : ''}`}>
                                    ⏱ {timeLeft}s
                                </span>
                            )}
                        </div>
                        <span className="play-header-score">
                            {correctCount}/{answeredCount}
                        </span>
                    </div>

                    {showResults ? (
                        <ResultsScreen
                            questions={questions}
                            answers={sessionAnswers}
                            onReview={() => { setMode('review'); setShowResults(false) }}
                            onRetryWrong={retryWrong}
                            onReset={resetQuiz}
                            mode={mode}
                            maxStreak={sessionMaxStreak}
                        />
                    ) : (
                        <>
                            {/* Progress bar */}
                            <div className="progress-wrap">
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
                                                onClick={() => setFilterState(f)}
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

                            {/* Combo feedback overlay */}
                            {comboFeedback && (
                                <div className={`combo-toast combo-${comboFeedback.type}`} key={comboFeedback.key}>
                                    {comboFeedback.type === 'correct' ? (
                                        comboFeedback.combo >= 10 ? `💎 ${comboFeedback.combo}x UNSTOPPABLE` :
                                            comboFeedback.combo >= 5 ? `⚡ ${comboFeedback.combo}x ON FIRE` :
                                                comboFeedback.combo >= 3 ? `🔥 ${comboFeedback.combo}x COMBO` :
                                                    comboFeedback.combo >= 2 ? `✨ ${comboFeedback.combo}x STREAK` :
                                                        '✅ Correct!'
                                    ) : comboFeedback.type === 'broken' ? (
                                        `💥 ${comboFeedback.combo}x COMBO BROKEN`
                                    ) : '❌ Wrong'}
                                </div>
                            )}

                            {/* Blitz bonus time */}
                            {bonusTime && (
                                <div className="bonus-time" key={bonusTime.key}>+{bonusTime.amount}s ⚡</div>
                            )}

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
                </>
            )}
        </div>
    )
}
