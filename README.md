# Legionary: Command (NLE Quiz App)

A gamified Latin learning application designed for National Latin Exam preparation.

## Features

### 🎮 Game Modes
-   **⚔️ Myth & Culture:** Test your knowledge of Roman gods, geography, and daily life.
-   **📜 Sentence Completions:** Practice Latin sentences (based on NLE 1330 syllabus).

### 🛡️ Core Mechanics
-   **Study Mode:** Flip flashcards to learn at your own pace.
-   **Battle Mode:** Test your skills to earn ranks.
-   **Cursus Honorum:** Rank up from *Tiro* (Recruit) to *Imperator* (Emperor).
-   **Separate Progress:** Ranks and mastery are tracked separately for each mission.

### 🎨 Visuals
-   **Dynamic Themes:**
    -   *Myth:* Gold & Cyan theme.
    -   *Sentences:* Crimson & Violet theme.
-   **Dark/Light Mode:** Toggle between day and night modes.
-   **Responsive Design:** Works on mobile and desktop.

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/anirbanbagchi1979/student-projects.git
    cd student-projects/nle-app
    ```

2.  **Firebase Configuration:**
    -   Copy `nle-app/firebase-config.example.js` to `nle-app/firebase-config.js`.
    -   Replace the placeholder values with your actual Firebase project keys.

3.  **Run Locally:**
    You need a local server to serve modules correctly.
    ```bash
    # using python
    python3 -m http.server 8080
    
    # or using npm/vite if configured
    # npx vite
    ```
    Open `http://localhost:8080/nle-app/index.html`.

## Deployment (Netlify)

This project is configured for Netlify deployment.

**Environment Variables Required:**
Go to **Site Settings > Environment Variables** and add:
-   `FIREBASE_API_KEY`
-   `FIREBASE_AUTH_DOMAIN`
-   `FIREBASE_PROJECT_ID`
-   `FIREBASE_STORAGE_BUCKET`
-   `FIREBASE_MESSAGING_SENDER_ID`
-   `FIREBASE_APP_ID`

The `generate-config.js` script automatically creates the configuration file during the build process.

## Tech Stack
-   **Frontend:** Vanilla HTML, CSS, JavaScript (ES6 Modules).
-   **Backend:** Firebase (Authentication & Cloud Firestore).
-   **Effects:** Canvas Confetti.
