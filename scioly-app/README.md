# SciOly Quiz – Designer Genes C

Practice quiz app for Science Olympiad Designer Genes event (Division C).

## Setup

```bash
npm install
npm run dev    # → http://localhost:3000
```

## Deployment

The app is deployed to Firebase Hosting:
🌐 **Live URL:** https://sci-oly-quiz.web.app

To re-deploy after making changes:
```bash
npm run build
cd .. && firebase deploy --only hosting
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

## Data Encryption

To protect the contents of `questions.json`, it is encrypted and sent to the repository as `questions.json.enc`. The plaintext file is ignored by `.gitignore`.

You will need the password, which should be placed in `src/data-pipeline/encryption_password.txt`.

All data extraction, merge, upload, and encryption scripts live in `src/data-pipeline/`.

### Decrypting

```bash
node src/data-pipeline/decrypt.mjs
```
This will generate `questions.json.decrypted`, which can be renamed or copied to `questions.json` for local development.

### Encrypting

If you modify `questions.json`, you must re-encrypt it before pushing:
```bash
node src/data-pipeline/encrypt.mjs
```
This will overwrite `questions.json.enc` with the new encrypted content.
