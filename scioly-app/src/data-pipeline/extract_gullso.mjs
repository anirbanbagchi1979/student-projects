import { readFileSync, writeFileSync } from 'fs';

const envContent = readFileSync('../../.env', 'utf-8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
if (!apiKeyMatch) { console.error('GEMINI_API_KEY not found in .env'); process.exit(1); }
const API_KEY = apiKeyMatch[1].trim();

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

const examData = readFileSync('../../input_quiz/GullSO 2026 Designer Genes C TEST.pdf').toString('base64');
const keyData = readFileSync('../../input_quiz/GullSO 2026 Designer Genes C KEY.pdf').toString('base64');
const SOURCE = 'GullSO 2026';

async function extractBatch(startQ, endQ) {
    console.log(`Extracting questions ${startQ}-${endQ}...`);
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inlineData: { mimeType: 'application/pdf', data: examData } },
                    { inlineData: { mimeType: 'application/pdf', data: keyData } },
                    {
                        text: `You are given two PDFs: a Science Olympiad "Designer Genes" test and its answer key.
Extract ONLY questions ${startQ} through ${endQ} from the test and match them with the correct answers from the answer key.
Output the result as a JSON array with this exact format:
[{"number":1,"question":"Full question text","options":["A) option","B) option","C) option","D) option"],"answer":"B","explanation":"","source":"${SOURCE}"}]
Rules:
- For multiple choice: include all options prefixed with letter like "A) ..."
- For fill-in-the-blank or short answer: set options to []
- "answer" should be the correct answer letter(s) or full text for non-MC
- Always include "source": "${SOURCE}"
- Output ONLY valid JSON, no markdown, no code blocks` }
                ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
        })
    });
    if (!response.ok) { console.error(`API Error:`, response.status, (await response.text()).slice(0, 200)); return null; }
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { console.error(`No text for Q${startQ}-${endQ}`); return null; }
    text = text.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    try { const q = JSON.parse(text); console.log(`  Got ${q.length} questions`); return q; }
    catch (e) { writeFileSync(`questions_raw_gullso_${startQ}_${endQ}.txt`, text); console.error(`  Parse error: ${e.message}`); return null; }
}

console.log(`=== ${SOURCE} ===`);
const b1 = await extractBatch(1, 25);
const b2 = await extractBatch(26, 50);
const b3 = await extractBatch(51, 80);

const all = [...(b1 || []), ...(b2 || []), ...(b3 || [])];
const seen = new Set(); const deduped = [];
for (const q of all) { const k = q.question.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); deduped.push(q); } }

if (deduped.length > 0) {
    writeFileSync('questions_gullso2026.json', JSON.stringify(deduped, null, 2));
    console.log(`Saved ${deduped.length} unique questions (from ${all.length} raw)`);
} else { console.error('Failed to extract any questions.'); }
