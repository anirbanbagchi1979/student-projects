# Student Projects

| App | Description |
|---|---|
| [`nle-app/`](nle-app/) | Legionary: Command – NLE Quiz App |
| [`scioly-app/`](scioly-app/) | SciOly Grind – Designer Genes C |

---

## SciOly Grind 🧬⚡

A gamified, mobile-first quiz app for Science Olympiad **Designer Genes C** built with React + Firebase.

**Live:** [https://sci-oly-quiz.web.app](https://sci-oly-quiz.web.app)

### Features

#### 🧠 Quiz Modes
- **Grind** — Spaced repetition practice. Wrong answers resurface after a 1-4 question cooldown
- **Blitz** — Timed 60-second-per-question test mode
- **Review** — Browse all questions with answers visible, filter by correct/wrong/all

#### 📊 Mastery System (Memrise-style)
6-level cumulative mastery that persists across sessions:

| Level | Name | Icon | Review Interval | Decays After |
|---|---|---|---|---|
| 0 | New | ⬜ | — | — |
| 1 | Learning | 🌱 | 4 hours | 1 day |
| 2 | Familiar | 🌿 | 1 day | 3 days |
| 3 | Review | 🌳 | 3 days | 7 days |
| 4 | Strong | 💪 | 7 days | 14 days |
| 5 | Mastered | 🌟 | 30 days | 30 days |

- Correct → level up. Wrong → level drops, comes back for review
- Time decay: items "wilt" if not reviewed within their threshold
- Only MC + non-context-missing questions count toward mastery total

#### 🔥 Daily Streaks
- Consecutive days of practice tracked with 🔥 counter in header
- **Streak Shields** (🛡️) earned by mastering 5 questions in one session — protects streak if you miss a day
- Dashboard shows current streak, best streak, and shield count

#### 🏆 Achievement Badges (16 Trophies)
| Badge | Name | Requirement |
|---|---|---|
| 🩸 | First Blood | Answer 1 question |
| 🚀 | Getting Started | Answer 10 questions |
| 5️⃣ | Half Century | Answer 50 questions |
| 💯 | Century | Answer 100 questions |
| 🎯 | Perfect 10 | 10 in a row correct |
| ⚡ | Unstoppable | 20 in a row correct |
| 🌟 | First Mastery | Master 1 question |
| 📚 | Scholar | Master 10 questions |
| 🧠 | Expert | Master 50 questions |
| 👑 | Grandmaster | Master all questions |
| 🔄 | Comeback Kid | Master a question you got wrong 3+ times |
| 🔥 | On Fire | 3-day streak |
| ⚔️ | Week Warrior | 7-day streak |
| 🏆 | Dedicated | 30-day streak |
| ⚔️ | Source Slayer | Master all from one source |
| 🛡️ | Shield Bearer | Earn a streak shield |

Toast notification slides in on new achievement unlocked.

#### 💯 Competitive Scoreboard
- Leaderboard showing all users' mastery progress
- Ranked by mastered question count with 🥇🥈🥉 medals
- Your row highlighted with a purple glow

#### 📎 Context-Missing Detection
- Gemini API analyzes all questions and flags ones referencing external context (pedigrees, diagrams, figures) not included in the question text
- 82/268 questions flagged with amber "Context Missing" banner
- Toggle filter to show/hide them (hidden by default)

#### 🤖 Gemini Answer Validation
- Every question validated by Gemini for answer correctness
- "Gemini Disagrees" warning shown when Gemini's answer differs from the provided answer
- Properly handles shuffled answer options

#### 🔀 Randomization
- Question order randomized (test/review modes)
- Answer option order shuffled per question with stable seed
- Correctness preserved through letter mapping

### Tech Stack
- **Frontend:** React (Vite), Vanilla CSS, mobile-first design
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **Auth:** Google Sign-In restricted to allowlisted emails
- **AI:** Gemini API (answer validation, context detection)
- **Data:** 268 questions from 4 sources (Designer Genes C tests)

### Project Structure
```
scioly-app/
├── src/
│   ├── components/
│   │   ├── QuizApp.jsx        # Main app logic
│   │   ├── QuestionCard.jsx   # Question display with shuffled options
│   │   ├── Dashboard.jsx      # Hub with stats, badges, scoreboard
│   │   ├── ResultsScreen.jsx  # Test/review results
│   │   └── LoginScreen.jsx    # Google Sign-In
│   ├── contexts/
│   │   └── AuthContext.jsx    # Auth with email allowlist
│   ├── lib/
│   │   ├── firebase.js        # Firebase config
│   │   ├── mastery.js         # 6-level mastery, decay, spaced rep
│   │   └── gamification.js    # Streaks, badges, achievements
│   └── data-pipeline/
│       ├── extract_*.mjs      # Question extraction scripts
│       ├── validate_answers.mjs # Gemini answer validation
│       ├── detect_context.mjs # Gemini context-missing detection
│       └── upload_to_firebase.mjs
├── questions.json             # All questions with metadata
└── index.html
```

### Firestore Security Rules
```
match /questions/{doc} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /mastery/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId;
}
```
