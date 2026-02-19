import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
const API_KEY = envContent.match(/GEMINI_API_KEY=(.+)/)[1].trim();
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

const questions = JSON.parse(readFileSync(join(ROOT, 'questions.json'), 'utf-8'));
const missing = questions.filter(q => !q.gemini_answer);
console.log(`Retrying ${missing.length} questions without gemini_answer...\n`);

for (const q of missing) {
    const qText = q.question.length > 500 ? q.question.slice(0, 500) + '...' : q.question;
    let prompt = `You are a biology/genetics expert. Answer this question and give a brief explanation (under 100 words).

Q${q.number}: ${qText}`;
    if (q.options && q.options.length > 0) {
        prompt += '\nOptions: ' + q.options.map(o => o.length > 150 ? o.slice(0, 150) + '...' : o).join(' | ');
    }
    prompt += `\nProvided answer: ${q.answer}`;
    prompt += `\n\nOutput ONLY valid JSON (no markdown): {"number":${q.number},"gemini_answer":"<UPPERCASE letter or text>","explanation":"<under 100 words>"}`;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
            })
        });

        if (!res.ok) { console.log(`  ❌ Q${q.number}: API ${res.status}`); continue; }

        const data = await res.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) { console.log(`  ❌ Q${q.number}: no text`); continue; }
        if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

        const v = JSON.parse(text);
        q.gemini_answer = v.gemini_answer;
        q.explanation = v.explanation;
        console.log(`  ✅ Q${q.number}`);
    } catch (e) {
        console.log(`  ❌ Q${q.number}: ${e.message}`);
    }
}

writeFileSync(join(ROOT, 'questions.json'), JSON.stringify(questions, null, 2));
const stillMissing = questions.filter(q => !q.gemini_answer).length;
console.log(`\nDone. Still missing: ${stillMissing}`);
