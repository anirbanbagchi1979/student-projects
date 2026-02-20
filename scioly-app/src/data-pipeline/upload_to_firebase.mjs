import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const API_KEY = process.env.VITE_FIREBASE_API_KEY;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'sci-oly-quiz';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const questions = JSON.parse(readFileSync(join(ROOT, 'questions.json'), 'utf-8'));
// Filter to only MC questions
const mcQuestions = questions.filter(q => q.options && q.options.length > 0);

console.log(`Uploading ${mcQuestions.length} multiple choice questions to Firestore...\n`);

// Convert a JS value to Firestore Value format
function toFirestoreValue(val) {
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(val)) fields[k] = toFirestoreValue(v);
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
}

for (const q of mcQuestions) {
    const docId = `q${q.number}`;
    const fields = {};
    for (const [k, v] of Object.entries(q)) {
        fields[k] = toFirestoreValue(v);
    }

    const url = `${FIRESTORE_URL}/questions/${docId}?key=${API_KEY}`;

    try {
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error(`❌ Q${q.number}: ${res.status} - ${err}`);
        } else {
            console.log(`✅ Q${q.number} uploaded`);
        }
    } catch (e) {
        console.error(`❌ Q${q.number}: ${e.message}`);
    }
}

console.log('\nDone!');
