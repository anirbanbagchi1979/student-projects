import { readFileSync, writeFileSync } from 'fs';

const envContent = readFileSync('../../.env', 'utf-8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
if (!apiKeyMatch) { console.error('GEMINI_API_KEY not found in .env'); process.exit(1); }
const API_KEY = apiKeyMatch[1].trim();

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

const SOURCES = [
    {
        name: 'DubSO 2025',
        exam: 'input_quiz/DubSO 2025 DG Exam - Google Docs.pdf',
        key: 'input_quiz/DubSO 2025 DG Key - Google Docs.pdf',
        output: 'questions_dubso2025.json'
    },
    {
        name: 'Unity Invite',
        exam: 'input_quiz/Unity Invite - Designer Genes C TEST.pdf',
        key: 'input_quiz/Unity Invite - Designer Genes C ANSWER SHEET.pdf',
        output: 'questions_unity_invite.json'
    }
];

async function extractBatch(examData, keyData, source, startQ, endQ) {
    console.log(`  [${source}] Extracting questions ${startQ}-${endQ}...`);

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
[
  {
    "number": 1,
    "question": "Full question text here",
    "options": ["A) option text", "B) option text", "C) option text", "D) option text"],
    "answer": "B",
    "explanation": "Brief explanation if available from answer key, otherwise empty string",
    "source": "${source}"
  }
]

Rules:
- For multiple choice: include all options in "options" array, prefix each with the letter like "A) ..."
- For true/false: set options to ["A) True", "B) False"]
- For fill-in-the-blank or short answer: set options to empty array []
- "answer" should be the correct answer letter(s) or full text for non-multiple-choice
- Include any explanations from the answer key
- Always include "source": "${source}" in every object
- Output ONLY valid JSON, no markdown, no code blocks`
                    }
                ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error(`  API Error for ${source} Q${startQ}-${endQ}:`, response.status, err.slice(0, 200));
        return null;
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { console.error(`  No text for ${source} Q${startQ}-${endQ}`); return null; }

    text = text.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    try {
        const questions = JSON.parse(text);
        console.log(`    Got ${questions.length} questions`);
        return questions;
    } catch (e) {
        const fname = `questions_raw_${source.replace(/\s/g, '_')}_${startQ}_${endQ}.txt`;
        writeFileSync(fname, text);
        console.error(`    Parse error: ${e.message} (raw saved to ${fname})`);
        return null;
    }
}

for (const src of SOURCES) {
    console.log(`\n=== ${src.name} ===`);
    const examData = readFileSync(src.exam).toString('base64');
    const keyData = readFileSync(src.key).toString('base64');

    const batch1 = await extractBatch(examData, keyData, src.name, 1, 25);
    const batch2 = await extractBatch(examData, keyData, src.name, 26, 50);
    const batch3 = await extractBatch(examData, keyData, src.name, 51, 80);

    const all = [];
    if (batch1) all.push(...batch1);
    if (batch2) all.push(...batch2);
    if (batch3) all.push(...batch3);

    // Deduplicate
    const seen = new Set();
    const deduped = [];
    for (const q of all) {
        const key = q.question.trim().toLowerCase();
        if (!seen.has(key)) { seen.add(key); deduped.push(q); }
    }

    if (deduped.length > 0) {
        writeFileSync(src.output, JSON.stringify(deduped, null, 2));
        console.log(`  Saved ${deduped.length} unique questions to ${src.output}`);
    } else {
        console.error(`  Failed to extract any questions for ${src.name}`);
    }
}

console.log('\nDone!');
