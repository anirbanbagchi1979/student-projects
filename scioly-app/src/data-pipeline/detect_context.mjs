/**
 * Detect questions that reference external context (pedigrees, diagrams,
 * prior questions, figures, tables, etc.) that isn't included in the question text.
 *
 * Uses Gemini to analyze each question and flag context-dependent ones.
 */
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
console.log(`Total questions to analyze: ${questions.length}\n`);

const BATCH_SIZE = 20;

async function analyzeBatch(batch, batchNum) {
    const questionsText = batch.map(q => {
        let text = `Q${q.number}: ${q.question}`;
        if (q.options && q.options.length > 0) {
            text += '\nOptions: ' + q.options.join(' | ');
        }
        return text;
    }).join('\n\n');

    const prompt = `You are analyzing quiz questions for a study app. Your job is to identify questions that CANNOT be answered without additional external context that is missing from the question text.

A question has MISSING CONTEXT if it:
- References a pedigree, diagram, figure, table, chart, graph, or image that is not provided
- References "the cross above", "the following data", "the pedigree", etc.
- References a specific individual by number (e.g., "individual 4", "individual III-2") without providing the full pedigree
- Refers to prior questions for context (e.g., "based on the scenario in question 5")
- References experimental results or data that are not included in the question text
- Says "shown below/above" or "from the following" but the referenced material is not present
- References a gel, karyotype, or lab result image

A question does NOT have missing context if:
- It is fully self-contained and can be answered from the question text alone
- It describes a scenario completely within the text (even if long)
- It references general biology knowledge

For each question, output ONLY:
- "Y" if context IS missing (cannot be answered standalone)
- "N" if context is NOT missing (fully self-contained)

Output ONLY valid JSON array:
[{"number":<n>,"contextMissing":"Y" or "N","reason":"<brief reason if Y, empty if N>"}]

Questions:
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
        writeFileSync(join(__dirname, `context_raw_batch_${batchNum}.txt`), text);
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

    const analyzed = await analyzeBatch(batch, batchNum);
    if (analyzed) {
        for (const v of analyzed) {
            results.set(v.number, v);
        }
        const flagged = analyzed.filter(v => v.contextMissing === 'Y').length;
        console.log(`  ✅ Got ${analyzed.length} results, ${flagged} flagged as context-missing`);
    } else {
        console.log(`  ❌ Failed`);
    }

    // Rate limit
    if (batchNum < totalBatches) {
        await new Promise(r => setTimeout(r, 2000));
    }
}

// Merge results back into questions
let flaggedCount = 0;
for (const q of questions) {
    const v = results.get(q.number);
    if (v && v.contextMissing === 'Y') {
        q.contextMissing = true;
        q.contextReason = v.reason || 'References external context not included in question';
        flaggedCount++;
    } else {
        q.contextMissing = false;
    }
}

writeFileSync(join(ROOT, 'questions.json'), JSON.stringify(questions, null, 2));
console.log(`\n=== Summary ===`);
console.log(`Total: ${questions.length}`);
console.log(`Context missing: ${flaggedCount}`);
console.log(`Self-contained: ${questions.length - flaggedCount}`);
console.log(`\nSaved to questions.json`);
