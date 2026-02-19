# SciOly Quiz – Designer Genes C

Practice quiz app for Science Olympiad Designer Genes event (Division C).

## Setup

```bash
npm install
npm run dev    # → http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys:
- `VITE_FIREBASE_*` — Firebase project config
- `GEMINI_API_KEY` — For question extraction

## Firestore Rules

Go to: [Firebase Console → Firestore → Rules](https://console.firebase.google.com/u/0/project/sci-oly-quiz/firestore/databases/-default-/rules)

### 🔓 Temporary Open (for uploading data)

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

### 🔒 Production (restricted to authorized users)

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

> ⚠️ Remember to switch back to **Production** rules after uploading data!
