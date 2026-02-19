import { readFileSync, writeFileSync } from 'fs';

// Load existing questions (already has Designer Genes C + Purdue2026 with source field)
const existing = JSON.parse(readFileSync('questions.json', 'utf-8'));

// Load new sources
const dubso = JSON.parse(readFileSync('questions_dubso2025.json', 'utf-8'));
const unity = JSON.parse(readFileSync('questions_unity_invite.json', 'utf-8'));

console.log(`Existing questions: ${existing.length}`);
console.log(`DubSO 2025: ${dubso.length}`);
console.log(`Unity Invite: ${unity.length}`);

// Merge and renumber
const merged = [...existing, ...dubso, ...unity];
merged.forEach((q, i) => { q.number = i + 1; });

writeFileSync('questions.json', JSON.stringify(merged, null, 2));
console.log(`\nMerged total: ${merged.length} questions saved to questions.json`);

// Stats
const mc = merged.filter(q => q.options && q.options.length > 0);
const fr = merged.filter(q => !q.options || q.options.length === 0);
console.log(`  Multiple choice: ${mc.length}`);
console.log(`  Free response: ${fr.length}`);

// Per-source breakdown 
const sources = {};
for (const q of merged) {
    const s = q.source || 'Unknown';
    sources[s] = (sources[s] || 0) + 1;
}
console.log('\nBy source:');
for (const [s, c] of Object.entries(sources)) {
    console.log(`  ${s}: ${c}`);
}
