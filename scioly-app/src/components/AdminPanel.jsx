import { useState, useRef, useEffect } from 'react'
import { collection, getDocs, doc, setDoc, deleteDoc, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { EVENTS, DEFAULT_EVENT } from '../lib/events'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`

const STAGES = [
    { key: 'idle', label: 'Ready', icon: '📋' },
    { key: 'extracting', label: 'Extracting questions from PDFs...', icon: '🔍' },
    { key: 'validating', label: 'Validating answers with Gemini...', icon: '✅' },
    { key: 'detecting', label: 'Detecting context-missing questions...', icon: '📎' },
    { key: 'preview', label: 'Review extracted questions', icon: '👀' },
    { key: 'uploading', label: 'Uploading to question bank...', icon: '📤' },
    { key: 'done', label: 'Complete!', icon: '🎉' },
    { key: 'error', label: 'Error occurred', icon: '❌' }
]

// ── Gemini API helpers ──
async function callGemini(body) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!text) throw new Error('No response text from Gemini')
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return text
}

// Map NLE event slugs to their answer key column headers
const NLE_KEY_COLUMNS = {
    'nle-intro': 'Intro',
    'nle-beginner': 'Begin',
    'nle-level1': 'Interm',
}

function isNLEEvent(slug) {
    return slug in NLE_KEY_COLUMNS
}

async function extractBatch(examData, keyData, sourceName, startQ, endQ, eventName, eventSlug) {
    // Build event-specific prompt
    let promptText
    if (isNLEEvent(eventSlug)) {
        const keyColumn = NLE_KEY_COLUMNS[eventSlug]
        promptText = `You are given two PDFs: a National Latin Exam (NLE) "${eventName}" test and its answer key.

The answer key PDF has a table with columns for multiple exam levels (Intro, Begin, Interm, Int RC, Adv Pro, Adv Poe, Adv RC).
Use ONLY the "${keyColumn}" column to determine correct answers.

Extract ONLY standalone multiple-choice questions ${startQ} through ${endQ} from the test.

IMPORTANT RULES FOR NLE:
- SKIP any question that references a reading passage, story, or Latin paragraph (e.g. "Read the passage above", "In the story", "lines 1-3")
- SKIP any question that requires looking at an image, map, illustration, or picture
- ONLY extract self-contained questions that can be answered independently
- Use the "${keyColumn}" column from the answer key for correct answers

Output the result as a JSON array with this exact format:
[
  {
    "number": 1,
    "question": "Full question text here",
    "options": ["A) option text", "B) option text", "C) option text", "D) option text"],
    "answer": "B",
    "explanation": "Brief explanation if available, otherwise empty string",
    "source": "${sourceName}",
    "type": "MC"
  }
]

Rules:
- Include all 4 options (A/B/C/D), prefix each with the letter like "A) ..."
- "answer" should be the correct answer letter from the "${keyColumn}" column
- Always include "source": "${sourceName}" and "type": "MC" in every object
- If NO questions in the range ${startQ}-${endQ} are standalone, return an empty array []
- Output ONLY valid JSON, no markdown, no code blocks`
    } else {
        promptText = `You are given two PDFs: a Science Olympiad "${eventName}" test and its answer key.

Extract ONLY questions ${startQ} through ${endQ} from the test and match them with the correct answers from the answer key.

Output the result as a JSON array with this exact format:
[
  {
    "number": 1,
    "question": "Full question text here",
    "options": ["A) option text", "B) option text", "C) option text", "D) option text"],
    "answer": "B",
    "explanation": "Brief explanation if available from answer key, otherwise empty string",
    "source": "${sourceName}",
    "type": "MC"
  }
]

Rules:
- For multiple choice: include all options in "options" array, prefix each with the letter like "A) ..."
- For true/false: set options to ["A) True", "B) False"] and type to "MC"
- For fill-in-the-blank or short answer: set options to empty array [] and type to "Free Response"
- "answer" should be the correct answer letter(s) or full text for non-multiple-choice
- Include any explanations from the answer key
- Always include "source": "${sourceName}" and appropriate "type" in every object
- Output ONLY valid JSON, no markdown, no code blocks`
    }

    const text = await callGemini({
        contents: [{
            parts: [
                { inlineData: { mimeType: 'application/pdf', data: examData } },
                { inlineData: { mimeType: 'application/pdf', data: keyData } },
                { text: promptText }
            ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
    })
    return JSON.parse(text)
}

async function validateBatch(batch) {
    const questionsText = batch.map(q => {
        const qText = q.question.length > 500 ? q.question.slice(0, 500) + '...' : q.question
        let text = `Q${q.number}: ${qText}`
        if (q.options?.length > 0) {
            text += '\nOptions: ' + q.options.map(o => o.length > 150 ? o.slice(0, 150) + '...' : o).join(' | ')
        }
        text += `\nProvided answer: ${q.answer}`
        return text
    }).join('\n\n')

    const text = await callGemini({
        contents: [{
            parts: [{
                text: `You are a biology/genetics expert. For each question, provide YOUR answer and a brief explanation (under 100 words).

Output ONLY valid JSON array:
[{"number":<n>,"gemini_answer":"<letter or text>","explanation":"<under 100 words>"}]

Rules: For MC use UPPERCASE letter only. For free response give full text. Output ONLY JSON.

${questionsText}`
            }]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
    })
    return JSON.parse(text)
}

async function detectContextBatch(batch) {
    const questionsText = batch.map(q => {
        let text = `Q${q.number}: ${q.question}`
        if (q.options?.length > 0) text += '\nOptions: ' + q.options.join(' | ')
        return text
    }).join('\n\n')

    const text = await callGemini({
        contents: [{
            parts: [{
                text: `You are analyzing quiz questions for a study app. Identify questions that CANNOT be answered without additional external context missing from the question text.

A question has MISSING CONTEXT if it references a pedigree, diagram, figure, table, chart, graph, image, gel, karyotype, or lab result that is not provided, or refers to prior questions, or says "shown below/above" but the material is not present.

Output ONLY valid JSON array:
[{"number":<n>,"contextMissing":"Y" or "N","reason":"<brief reason if Y, empty if N>"}]

Questions:
${questionsText}`
            }]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
    })
    return JSON.parse(text)
}

// ── Main Component ──
export default function AdminPanel({ onQuestionsUploaded }) {
    const [stage, setStage] = useState('idle')
    const [progress, setProgress] = useState('')
    const [error, setError] = useState('')
    const [sourceName, setSourceName] = useState('')
    const [eventSlug, setEventSlug] = useState(DEFAULT_EVENT)
    const [questions, setQuestions] = useState([])
    const [stats, setStats] = useState(null)
    const examRef = useRef(null)
    const keyRef = useRef(null)

    // Per-event + per-pack question counts for management
    // Structure: { 'designer-genes': { 'MIT Invite 2026': 20, 'Purdue 2026': 15 }, ... }
    const [packCounts, setPackCounts] = useState({})
    const [deleteLoading, setDeleteLoading] = useState(null)
    const [confirmModal, setConfirmModal] = useState(null) // { message, onConfirm }

    // Load question counts per event + source
    useEffect(() => {
        loadPackCounts()
    }, [])

    async function loadPackCounts() {
        try {
            const snap = await getDocs(collection(db, 'questions'))
            const counts = {}
            snap.forEach(d => {
                const data = d.data()
                const evt = data.event || 'designer-genes'
                const src = data.source || 'Unknown'
                if (!counts[evt]) counts[evt] = {}
                counts[evt][src] = (counts[evt][src] || 0) + 1
            })
            setPackCounts(counts)
        } catch (err) {
            console.error('Error loading counts:', err)
        }
    }

    async function handleDeletePack(eventSlugToDelete, sourceName) {
        const evtName = EVENTS.find(e => e.slug === eventSlugToDelete)?.name || eventSlugToDelete
        const count = packCounts[eventSlugToDelete]?.[sourceName] || 0

        setConfirmModal({
            message: `Delete all ${count} questions from "${sourceName}" in ${evtName}?`,
            subtitle: 'This cannot be undone.',
            onConfirm: async () => {
                setConfirmModal(null)
                const key = `${eventSlugToDelete}:${sourceName}`
                setDeleteLoading(key)
                try {
                    const snap = await getDocs(collection(db, 'questions'))
                    let deleted = 0
                    for (const d of snap.docs) {
                        const data = d.data()
                        const evt = data.event || 'designer-genes'
                        const src = data.source || 'Unknown'
                        if (evt === eventSlugToDelete && src === sourceName) {
                            await deleteDoc(doc(db, 'questions', d.id))
                            deleted++
                        }
                    }
                    console.log(`Deleted ${deleted} questions from "${sourceName}" in ${evtName}`)
                    await loadPackCounts()
                    if (onQuestionsUploaded) onQuestionsUploaded()
                } catch (err) {
                    console.error('Error deleting:', err)
                }
                setDeleteLoading(null)
            }
        })
    }

    async function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result.split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    async function handleProcess() {
        const examFile = examRef.current?.files[0]
        const keyFile = keyRef.current?.files[0]
        if (!examFile || !keyFile || !sourceName.trim()) {
            setError('Please provide exam PDF, answer key PDF, and source name.')
            return
        }

        setError('')
        try {
            // Step 1: Read PDFs
            setStage('extracting')
            setProgress('Reading PDF files...')
            const examData = await fileToBase64(examFile)
            const keyData = await fileToBase64(keyFile)

            // Step 2: Extract questions in batches
            const allQuestions = []
            for (const [start, end] of [[1, 25], [26, 50], [51, 80]]) {
                setProgress(`Extracting questions ${start}-${end}...`)
                try {
                    const evtName = EVENTS.find(e => e.slug === eventSlug)?.name || eventSlug
                    const batch = await extractBatch(examData, keyData, sourceName.trim(), start, end, evtName, eventSlug)
                    allQuestions.push(...batch)
                    setProgress(`Got ${allQuestions.length} questions so far...`)
                } catch (e) {
                    console.warn(`Batch ${start}-${end} failed:`, e.message)
                    // Continue with other batches
                }
            }

            if (allQuestions.length === 0) throw new Error('Failed to extract any questions from the PDFs.')

            // Deduplicate
            const seen = new Set()
            const deduped = []
            for (const q of allQuestions) {
                const key = q.question.trim().toLowerCase()
                if (!seen.has(key)) { seen.add(key); deduped.push(q) }
            }
            deduped.forEach((q, i) => { q.number = i + 1 })
            setProgress(`Extracted ${deduped.length} unique questions.`)

            // Step 3: Validate answers
            setStage('validating')
            let matched = 0, mismatched = 0
            const BATCH_SIZE = 5
            for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
                const batch = deduped.slice(i, i + BATCH_SIZE)
                setProgress(`Validating Q${batch[0].number}-Q${batch[batch.length - 1].number}...`)
                try {
                    const validated = await validateBatch(batch)
                    for (const v of validated) {
                        const q = deduped.find(q => q.number === v.number)
                        if (q) {
                            q.gemini_answer = v.gemini_answer
                            if (!q.explanation || q.explanation === '') q.explanation = v.explanation
                            const orig = q.answer?.trim().toUpperCase()
                            const gemini = v.gemini_answer?.trim().toUpperCase()
                            if (orig === gemini) matched++
                            else mismatched++
                        }
                    }
                } catch (e) {
                    console.warn(`Validate batch failed:`, e.message)
                }
            }

            // Step 4: Detect context-missing
            setStage('detecting')
            let flagged = 0
            for (let i = 0; i < deduped.length; i += 20) {
                const batch = deduped.slice(i, i + 20)
                setProgress(`Checking context Q${batch[0].number}-Q${batch[batch.length - 1].number}...`)
                try {
                    const analyzed = await detectContextBatch(batch)
                    for (const v of analyzed) {
                        const q = deduped.find(q => q.number === v.number)
                        if (q && v.contextMissing === 'Y') {
                            q.contextMissing = true
                            q.contextReason = v.reason || 'References external context'
                            flagged++
                        } else if (q) {
                            q.contextMissing = false
                        }
                    }
                } catch (e) {
                    console.warn(`Context batch failed:`, e.message)
                }
            }

            setQuestions(deduped)
            setStats({ total: deduped.length, matched, mismatched, flagged })
            setStage('preview')
            setProgress('')

        } catch (e) {
            setError(e.message)
            setStage('error')
        }
    }

    async function handleUpload() {
        setStage('uploading')
        setError('')
        try {
            // Get existing question count to determine starting number
            setProgress('Loading existing questions...')
            const snap = await getDocs(query(collection(db, 'questions'), orderBy('number')))
            const existing = snap.docs.map(d => d.data())
            const maxNum = existing.reduce((max, q) => Math.max(max, q.number || 0), 0)

            // Check for duplicates against existing
            const existingTexts = new Set(existing.map(q => q.question.trim().toLowerCase()))
            const newQuestions = questions.filter(q => !existingTexts.has(q.question.trim().toLowerCase()))

            if (newQuestions.length === 0) {
                setError('All questions already exist in the database. No new questions to add.')
                setStage('preview')
                return
            }

            // Renumber and upload only MC questions
            const mcQuestions = newQuestions.filter(q => q.options && q.options.length > 0)
            mcQuestions.forEach((q, i) => { q.number = maxNum + i + 1 })

            setProgress(`Uploading ${mcQuestions.length} new MC questions...`)
            let uploaded = 0
            for (const q of mcQuestions) {
                q.event = eventSlug
                await setDoc(doc(db, 'questions', `q${q.number}`), q)
                uploaded++
                if (uploaded % 10 === 0) setProgress(`Uploaded ${uploaded}/${mcQuestions.length}...`)
            }

            setStats(prev => ({ ...prev, uploaded: mcQuestions.length, skippedDups: newQuestions.length - mcQuestions.length + (questions.length - newQuestions.length) }))
            setStage('done')
            if (onQuestionsUploaded) onQuestionsUploaded()
            setProgress('')
        } catch (e) {
            setError(e.message)
            setStage('error')
        }
    }

    function handleReset() {
        setStage('idle')
        setProgress('')
        setError('')
        setSourceName('')
        setEventSlug(DEFAULT_EVENT)
        setQuestions([])
        setStats(null)
        if (examRef.current) examRef.current.value = ''
        if (keyRef.current) keyRef.current.value = ''
    }

    const currentStage = STAGES.find(s => s.key === stage) || STAGES[0]
    const isProcessing = ['extracting', 'validating', 'detecting', 'uploading'].includes(stage)

    return (
        <div className="admin-panel">
            <div className="admin-header">
                <h2>📄 Upload Quiz PDFs</h2>
                <p className="admin-subtitle">Extract questions from Science Olympiad test PDFs and add them to the question bank.</p>
            </div>

            {/* Upload Form */}
            {(stage === 'idle' || stage === 'error') && (
                <div className="admin-form">
                    <div className="admin-field">
                        <label htmlFor="event-select">🎯 Event</label>
                        <select
                            id="event-select"
                            value={eventSlug}
                            onChange={e => setEventSlug(e.target.value)}
                            className="admin-input"
                        >
                            {EVENTS.map(ev => (
                                <option key={ev.slug} value={ev.slug}>{ev.icon} {ev.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="admin-field">
                        <label htmlFor="source-name">📝 Source Name</label>
                        <input
                            id="source-name"
                            type="text"
                            placeholder="e.g. MIT Invite 2026"
                            value={sourceName}
                            onChange={e => setSourceName(e.target.value)}
                            className="admin-input"
                        />
                    </div>
                    <div className="admin-field">
                        <label htmlFor="exam-pdf">📋 Exam PDF</label>
                        <input id="exam-pdf" type="file" accept=".pdf" ref={examRef} className="admin-file-input" />
                    </div>
                    <div className="admin-field">
                        <label htmlFor="key-pdf">🔑 Answer Key PDF</label>
                        <input id="key-pdf" type="file" accept=".pdf" ref={keyRef} className="admin-file-input" />
                    </div>
                    {error && <div className="admin-error">{error}</div>}
                    <button className="admin-btn primary-btn" onClick={handleProcess} disabled={!GEMINI_API_KEY}>
                        {GEMINI_API_KEY ? '🚀 Process PDFs' : '⚠️ Gemini API Key Missing'}
                    </button>
                </div>
            )}

            {/* Progress Indicator */}
            {isProcessing && (
                <div className="admin-progress">
                    <div className="admin-progress-stages">
                        {STAGES.filter(s => ['extracting', 'validating', 'detecting', 'uploading'].includes(s.key)).map(s => (
                            <div
                                key={s.key}
                                className={`admin-stage ${s.key === stage ? 'active' : STAGES.findIndex(x => x.key === stage) > STAGES.findIndex(x => x.key === s.key) ? 'done' : ''}`}
                            >
                                <span className="stage-icon">{s.icon}</span>
                                <span className="stage-label">{s.label.replace('...', '')}</span>
                            </div>
                        ))}
                    </div>
                    <div className="admin-spinner-row">
                        <div className="spinner" />
                        <span>{progress}</span>
                    </div>
                </div>
            )}

            {/* Preview */}
            {stage === 'preview' && (
                <div className="admin-preview">
                    <div className="admin-stats">
                        <div className="stat-card"><span className="stat-num">{stats.total}</span><span className="stat-label">Questions</span></div>
                        <div className="stat-card correct"><span className="stat-num">{stats.matched}</span><span className="stat-label">Validated ✅</span></div>
                        <div className="stat-card wrong"><span className="stat-num">{stats.mismatched}</span><span className="stat-label">Mismatched ⚠️</span></div>
                        <div className="stat-card"><span className="stat-num">{stats.flagged}</span><span className="stat-label">Context Missing 📎</span></div>
                    </div>

                    <div className="admin-question-list">
                        <h3>Extracted Questions</h3>
                        {questions.map(q => {
                            const mismatch = q.gemini_answer && q.answer &&
                                q.gemini_answer.trim().toUpperCase() !== q.answer.trim().toUpperCase()
                            return (
                                <div key={q.number} className={`admin-q-item ${mismatch ? 'mismatch' : ''} ${q.contextMissing ? 'context-missing' : ''}`}>
                                    <div className="admin-q-header">
                                        <span className="admin-q-num">Q{q.number}</span>
                                        <span className="admin-q-type">{q.type || 'MC'}</span>
                                        {mismatch && <span className="admin-q-flag">⚠️ Mismatch</span>}
                                        {q.contextMissing && <span className="admin-q-flag">📎 Context</span>}
                                    </div>
                                    <p className="admin-q-text">{q.question.length > 150 ? q.question.slice(0, 150) + '...' : q.question}</p>
                                    <div className="admin-q-answer">
                                        Answer: <strong>{q.answer}</strong>
                                        {q.gemini_answer && <span className="admin-q-gemini"> · Gemini: <strong>{q.gemini_answer}</strong></span>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="admin-actions">
                        <button className="admin-btn" onClick={handleReset}>← Start Over</button>
                        <button className="admin-btn primary-btn" onClick={handleUpload}>
                            📤 Add {questions.filter(q => q.options?.length > 0).length} MC Questions to Bank
                        </button>
                    </div>
                </div>
            )}

            {/* Done */}
            {stage === 'done' && (
                <div className="admin-done">
                    <div className="admin-done-icon">🎉</div>
                    <h3>Upload Complete!</h3>
                    <p>{stats.uploaded} new questions added to the question bank.</p>
                    {stats.skippedDups > 0 && <p className="admin-note">{stats.skippedDups} duplicates or non-MC questions were skipped.</p>}
                    <button className="admin-btn primary-btn" onClick={handleReset}>Upload More</button>
                </div>
            )}

            {/* Manage Question Banks */}
            <div className="admin-manage">
                <h3>🗑️ Manage Question Banks</h3>
                <div className="admin-event-list">
                    {EVENTS.map(e => {
                        const packs = packCounts[e.slug] || {}
                        const totalForEvent = Object.values(packs).reduce((s, n) => s + n, 0)
                        if (totalForEvent === 0) return (
                            <div key={e.slug} className="admin-event-row">
                                <div className="admin-event-info">
                                    <span className="admin-event-icon">{e.icon}</span>
                                    <span className="admin-event-name">{e.name}</span>
                                    <span className="admin-event-count">0 Qs</span>
                                </div>
                            </div>
                        )
                        return (
                            <details key={e.slug} className="admin-event-group">
                                <summary className="admin-event-row admin-event-summary">
                                    <div className="admin-event-info">
                                        <span className="admin-event-icon">{e.icon}</span>
                                        <span className="admin-event-name">{e.name}</span>
                                        <span className="admin-event-count">{totalForEvent} Qs</span>
                                    </div>
                                    <span className="admin-expand-hint">▸ {Object.keys(packs).length} packs</span>
                                </summary>
                                <div className="admin-pack-list">
                                    {Object.entries(packs).sort((a, b) => a[0].localeCompare(b[0])).map(([src, count]) => {
                                        const loadKey = `${e.slug}:${src}`
                                        return (
                                            <div key={src} className="admin-pack-row">
                                                <div className="admin-pack-info">
                                                    <span className="admin-pack-name">📦 {src}</span>
                                                    <span className="admin-event-count">{count} Qs</span>
                                                </div>
                                                <button
                                                    className="admin-delete-btn"
                                                    onClick={() => handleDeletePack(e.slug, src)}
                                                    disabled={deleteLoading === loadKey}
                                                >
                                                    {deleteLoading === loadKey ? '⏳...' : '🗑️ Delete'}
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            </details>
                        )
                    })}
                </div>
            </div>

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="confirm-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                        <div className="confirm-icon">⚠️</div>
                        <p className="confirm-message">{confirmModal.message}</p>
                        {confirmModal.subtitle && <p className="confirm-subtitle">{confirmModal.subtitle}</p>}
                        <div className="confirm-actions">
                            <button className="confirm-btn confirm-cancel" onClick={() => setConfirmModal(null)}>Cancel</button>
                            <button className="confirm-btn confirm-delete" onClick={confirmModal.onConfirm}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
