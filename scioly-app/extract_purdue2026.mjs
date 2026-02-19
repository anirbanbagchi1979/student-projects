import { readFileSync, writeFileSync } from 'fs';

// Load API key from .env
const envContent = readFileSync('.env', 'utf-8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
if (!apiKeyMatch) { console.error('GEMINI_API_KEY not found in .env'); process.exit(1); }
const API_KEY = apiKeyMatch[1].trim();

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

// Read Purdue2026 PDFs as base64
const examPdf = readFileSync('input_quiz/Purdue2026_DesignerGenesC_Exam.pdf').toString('base64');
const answerKeyPdf = readFileSync('input_quiz/Purdue2026_DesignerGenesC_AnswerKey.pdf').toString('base64');

const SOURCE = 'Purdue2026';

async function extractBatch(startQ, endQ) {
    console.log(`Extracting questions ${startQ}-${endQ}...`);

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: examPdf
                        }
                    },
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: answerKeyPdf
                        }
                    },
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
    "source": "${SOURCE}"
  }
]

Rules:
- For multiple choice: include all options in "options" array
- For true/false: set options to ["True", "False"]
- For fill-in-the-blank or short answer: set options to empty array []
- "answer" should be the correct answer letter(s) or full text for non-multiple-choice
- Include any explanations from the answer key
- Always include "source": "${SOURCE}" in every object
- Output ONLY valid JSON, no markdown, no code blocks`
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 65536
            }
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error(`API Error for Q${startQ}-${endQ}:`, response.status, err);
        return null;
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        console.error(`No text for Q${startQ}-${endQ}:`, JSON.stringify(data, null, 2));
        return null;
    }

    // Clean up markdown formatting
    text = text.trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
        const questions = JSON.parse(text);
        console.log(`  Got ${questions.length} questions from batch ${startQ}-${endQ}`);
        return questions;
    } catch (e) {
        writeFileSync(`questions_raw_purdue_${startQ}_${endQ}.txt`, text);
        console.error(`  Parse error for Q${startQ}-${endQ}: ${e.message}`);
        console.error(`  Raw saved to questions_raw_purdue_${startQ}_${endQ}.txt`);
        return null;
    }
}

console.log('Sending Purdue2026 PDFs to Gemini API in batches...\n');

const batch1 = await extractBatch(1, 25);
const batch2 = await extractBatch(26, 50);
const batch3 = await extractBatch(51, 80);

const allQuestions = [];
if (batch1) allQuestions.push(...batch1);
if (batch2) allQuestions.push(...batch2);
if (batch3) allQuestions.push(...batch3);

if (allQuestions.length > 0) {
    writeFileSync('questions_purdue2026.json', JSON.stringify(allQuestions, null, 2));
    console.log(`\nTotal: ${allQuestions.length} questions extracted and saved to questions_purdue2026.json`);
} else {
    console.error('\nFailed to extract any questions.');
}
