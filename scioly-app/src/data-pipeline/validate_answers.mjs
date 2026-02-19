import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
if (!apiKeyMatch) { console.error('GEMINI_API_KEY not found in .env'); process.exit(1); }
const API_KEY = apiKeyMatch[1].trim();
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

const questions = JSON.parse(readFileSync(join(ROOT, 'questions.json'), 'utf-8'));
console.log(`Total questions to validate: ${questions.length}\n`);

const BATCH_SIZE = 5;

async function validateBatch(batch, batchNum) {
    const questionsText = batch.map(q => {
        // Truncate very long question text
        const qText = q.question.length > 500 ? q.question.slice(0, 500) + '...' : q.question;
        let text = `Q${q.number}: ${qText}`;
        if (q.options && q.options.length > 0) {
            text += '\nOptions: ' + q.options.map(o => o.length > 150 ? o.slice(0, 150) + '...' : o).join(' | ');
        }
        text += `\nProvided answer: ${q.answer}`;
        return text;
    }).join('\n\n');

    const prompt = `You are a biology/genetics expert. For each question, provide YOUR answer and a brief explanation (under 100 words).

Output ONLY valid JSON array:
[{"number":<n>,"gemini_answer":"<letter or text>","explanation":"<under 100 words>"}]

Rules: For MC use UPPERCASE letter only. For free response give full text. Output ONLY JSON.

${questionsText}`;

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        })
    });

    if (!response.ok) {
        console.error(`  Batch ${batchNum} API error:`, response.status, (await response.text()).slice(0, 200));
        return null;
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { console.error(`  Batch ${batchNum}: no response text`); return null; }

    text = text.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    try {
        return JSON.parse(text);
    } catch (e) {
        writeFileSync(join(__dirname, `validate_raw_batch_${batchNum}.txt`), text);
        console.error(`  Batch ${batchNum} parse error: ${e.message}`);
        return null;
    }
}

// Process in batches
const results = new Map();
const totalBatches = Math.ceil(questions.length / BATCH_SIZE);

for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = questions.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (Q${batch[0].number}-Q${batch[batch.length - 1].number})...`);

    const validated = await validateBatch(batch, batchNum);
    if (validated) {
        for (const v of validated) {
            results.set(v.number, v);
        }
        console.log(`  ✅ Got ${validated.length} validations`);
    } else {
        console.log(`  ❌ Failed`);
    }
}

// Merge results back
let matched = 0, mismatched = 0, missing = 0;
for (const q of questions) {
    const v = results.get(q.number);
    if (v) {
        q.gemini_answer = v.gemini_answer;
        q.explanation = v.explanation;

        // Normalize for comparison
        const orig = q.answer.trim().toUpperCase();
        const gemini = v.gemini_answer.trim().toUpperCase();
        if (orig === gemini) {
            matched++;
        } else {
            mismatched++;
            console.log(`  ⚠️  Q${q.number}: original="${q.answer}" vs gemini="${v.gemini_answer}"`);
        }
    } else {
        missing++;
    }
}

writeFileSync(join(ROOT, 'questions.json'), JSON.stringify(questions, null, 2));
console.log(`\n=== Summary ===`);
console.log(`Total: ${questions.length}`);
console.log(`Matched: ${matched}`);
console.log(`Mismatched: ${mismatched}`);
console.log(`Missing: ${missing}`);
console.log(`\nSaved to questions.json`);
