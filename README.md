# Student Projects

## Projects

### 1. Legionary: Command (NLE Quiz App)
A gamified Latin learning application designed for National Latin Exam preparation.
- **Location:** `nle-app/`
- **Stack:** Vanilla HTML/CSS/JS, Firebase
- [Setup Instructions →](nle-app/README.md)

### 2. SciOly Quiz – Designer Genes C
Practice quiz for Science Olympiad Designer Genes event.
- **Location:** Root (`src/`, `index.html`)
- **Stack:** React + Vite, Firebase Auth + Firestore
- **Run:** `npm run dev` → `http://localhost:3000`

#### Firestore Rules
See [README section](README.md#firestore-rules) or copy from below:

<details>
<summary>🔓 Temporary Open (for uploading data)</summary>

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
</details>

<details>
<summary>🔒 Production (restricted to authorized users)</summary>

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email in [
          'anirban.bagchi@gmail.com',
          'aarush.bagchi@gmail.com'
        ];
    }
  }
}
```
</details>

> ⚠️ Remember to switch back to **Production** rules after uploading data!
