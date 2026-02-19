import { readFileSync, writeFileSync } from 'fs';

// Load existing questions and add source field
const existing = JSON.parse(readFileSync('../../questions.json', 'utf-8'));
existing.forEach(q => { q.source = 'Designer Genes C'; });

// Load Purdue2026 questions
const purdue = JSON.parse(readFileSync('questions_purdue2026.json', 'utf-8'));

// Deduplicate Purdue questions by question text (there are duplicates across batches)
const seen = new Set();
const dedupedPurdue = [];
for (const q of purdue) {
    const key = q.question.trim().toLowerCase();
    if (!seen.has(key)) {
        seen.add(key);
        dedupedPurdue.push(q);
    }
}

console.log(`Existing questions: ${existing.length}`);
console.log(`Purdue2026 raw: ${purdue.length}`);
console.log(`Purdue2026 deduped: ${dedupedPurdue.length}`);

// Merge and renumber
const merged = [...existing, ...dedupedPurdue];
merged.forEach((q, i) => { q.number = i + 1; });

writeFileSync('../../questions.json', JSON.stringify(merged, null, 2));
console.log(`\nMerged total: ${merged.length} questions saved to questions.json`);

// Count MC vs free-response
const mc = merged.filter(q => q.options && q.options.length > 0);
const fr = merged.filter(q => !q.options || q.options.length === 0);
console.log(`  Multiple choice: ${mc.length}`);
console.log(`  Free response: ${fr.length}`);
