import { QUESTION_DATA as DATA_MYTH } from './questions.js';
import { QUESTION_DATA_1330 as DATA_1330 } from './questions1330.js';
import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc } from './firebase-config.js';

// STATE
let currentUser = null;
let progress = {};
let queue = [];
let currentIdx = 0;
let mode = 'study';
let currentBank = 'myth'; // 'myth' or '1330'

const RANKS = [
    { n: "TIRO", req: 0, desc: "The Recruit. Your journey begins." },
    { n: "MILES", req: 10, desc: "The Soldier. Proven in battle." },
    { n: "DECURIO", req: 25, desc: "Leader of ten men." },
    { n: "CENTURIO", req: 50, desc: "Commander of a century." },
    { n: "PRAETOR", req: 75, desc: "General of the Legion." },
    { n: "IMPERATOR", req: 100, desc: "Emperor. Master of Rome." }
];

window.onload = () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            updateProfileUI(user);
            document.getElementById('login-overlay').style.display = 'none';
            await loadData();
        } else {
            document.getElementById('login-overlay').style.display = 'flex';
        }
    });

    document.getElementById('btn-login').onclick = () => signInWithPopup(auth, provider);
    document.getElementById('profile-card').onclick = doLogout;
    document.getElementById('btn-study').onclick = () => launchQuiz('study');
    document.getElementById('btn-battle').onclick = () => launchQuiz('battle');
    document.getElementById('btn-back').onclick = goHome;
    document.getElementById('flashcard').onclick = flipCard;
    document.getElementById('view-ranks').onclick = openRanks;
    document.getElementById('close-ranks').onclick = () => document.getElementById('ranks-overlay').style.display = 'none';

    // Bank Switcher
    const selector = document.getElementById('bank-selector');
    if (selector) selector.onchange = (e) => switchBank(e.target.value);

    // Theme Toggle
    document.getElementById('btn-theme').onclick = toggleTheme;

    // Load saved theme
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        document.getElementById('btn-theme').textContent = '☾';
    }
};

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    document.getElementById('btn-theme').textContent = isLight ? '☾' : '☀';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

function getActiveData() {
    return currentBank === '1330' ? DATA_1330 : DATA_MYTH;
}

function getProgressKey(id) {
    return `${currentBank}_${id}`;
}

async function switchBank(newBank) {
    currentBank = newBank;

    // Toggle Theme
    if (newBank === '1330') {
        document.body.classList.add('theme-1330');
    } else {
        document.body.classList.remove('theme-1330');
    }

    // Reset queue and UI for the new bank
    calcStats();
}

async function loadData() {
    if (!currentUser) return;
    const ref = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        progress = snap.data().progress || {};
        // Migration: If we have old keys (integers/numeric strings), assume they are 'myth'
        // This is a simple rigorous check once
        let changed = false;
        Object.keys(progress).forEach(k => {
            if (!k.includes('_')) {
                progress[`myth_${k}`] = progress[k];
                delete progress[k];
                changed = true;
            }
        });
        if (changed) updateDoc(ref, { progress });
    } else {
        await setDoc(ref, { progress: {} });
        progress = {};
    }
    calcStats();
}

function calcStats() {
    const data = getActiveData();
    const total = data.length;
    let nNew = 0, nLearn = 0, nMaster = 0;

    data.forEach(q => {
        const key = getProgressKey(q.id);
        const m = progress[key] || 0;
        if (m === 0) nNew++;
        else if (m < 3) nLearn++;
        else nMaster++;
    });

    document.getElementById('count-new').textContent = nNew;
    document.getElementById('count-learn').textContent = nLearn;
    document.getElementById('count-master').textContent = nMaster;

    document.getElementById('bar-new').style.width = (total ? (nNew / total * 100) : 0) + '%';
    document.getElementById('bar-learn').style.width = (total ? (nLearn / total * 100) : 0) + '%';
    document.getElementById('bar-master').style.width = (total ? (nMaster / total * 100) : 0) + '%';

    // Ranks based on TOTAL masteries across ALL banks? Or just current?
    // Let's do current bank for now, or maybe sum of all?
    // User requested switching banks, usually separate progress is better for clarity.
    // We already count 'nMaster' for current bank. Let's base rank on that for now.

    let rank = RANKS[0].n;
    for (let r of RANKS) if (nMaster >= r.req) rank = r.n;

    // Add icon/prefix
    const icon = currentBank === '1330' ? '📜' : '⚔️';
    document.getElementById('u-rank').textContent = `${icon} ${rank}`;
}

// --- RANKS MODAL LOGIC ---
function openRanks() {
    const totalMastered = parseInt(document.getElementById('count-master').textContent);
    const list = document.getElementById('rank-list-container');
    list.innerHTML = '';

    RANKS.forEach((r, idx) => {
        const isReached = totalMastered >= r.req;
        const isNext = !isReached && (idx === 0 || totalMastered >= RANKS[idx - 1].req);

        let statusClass = isReached ? 'active' : 'future';
        let icon = isReached ? '✓' : '🔒';
        if (isNext) { statusClass = 'next'; icon = '⚔️'; }

        list.innerHTML += `
        <div class="rank-item ${statusClass}" style="${isReached ? 'opacity:1; border-color:var(--gold);' : ''}">
            <div class="rank-icon">${icon}</div>
            <div class="rank-info">
                <h4>${r.n}</h4>
                <p>${r.desc} (Req: ${r.req} Mastered)</p>
            </div>
        </div>`;
    });

    const modalTitle = document.querySelector('.modal-title');
    modalTitle.textContent = currentBank === '1330' ? "Sentences: Cursus Honorum" : "Myth: Cursus Honorum";
    modalTitle.style.color = currentBank === '1330' ? "var(--gold)" : "var(--gold)"; // uses theme color

    document.getElementById('ranks-overlay').style.display = 'flex';
}

function updateProfileUI(u) {
    document.getElementById('u-name').textContent = u.displayName.split(' ')[0];
    document.getElementById('u-pic').src = u.photoURL;
}

function doLogout() {
    if (confirm("Log out?")) signOut(auth);
}

function goHome() {
    document.getElementById('quiz-view').style.display = 'none';
    document.getElementById('home-view').style.display = 'flex';
    calcStats();
}

function launchQuiz(selectedMode) {
    mode = selectedMode;
    document.getElementById('home-view').style.display = 'none';
    document.getElementById('quiz-view').style.display = 'flex';

    const data = getActiveData();
    const badge = document.getElementById('mode-badge');

    // Update badge with bank info
    const bankLabel = currentBank === '1330' ? 'SENTENCES' : 'MYTH';

    if (mode === 'battle') {
        badge.textContent = `${bankLabel} • BATTLE`;
        badge.style.color = "var(--gold)";
        badge.style.borderColor = "var(--gold)";
        queue = data.filter(q => (progress[getProgressKey(q.id)] || 0) < 3);
    } else {
        badge.textContent = `${bankLabel} • STUDY`;
        badge.style.color = "var(--cyan)";
        badge.style.borderColor = "var(--cyan)";
        queue = [...data];
    }

    queue.sort(() => Math.random() - 0.5);

    if (queue.length === 0) showEmpty();
    else {
        currentIdx = 0;
        document.getElementById('quiz-container').style.display = 'block';
        document.getElementById('empty-state').style.display = 'none';
        renderCard();
    }
}

function renderCard() {
    if (currentIdx >= queue.length) {
        if (mode === 'battle') { showEmpty(); return; }
        else currentIdx = 0;
    }

    const q = queue[currentIdx];
    const key = getProgressKey(q.id);
    const m = progress[key] || 0;

    // Fallback for missing category/explanation
    const cat = q.cat || (currentBank === '1330' ? 'Sentence Completions' : 'General');
    const expl = q.expl || "No extra notes for this question.";

    document.getElementById('q-cat').textContent = cat;
    const pips = document.getElementById('pips').children;
    for (let i = 0; i < 3; i++) pips[i].className = i < m ? 'pip filled' : 'pip';

    document.getElementById('expl-box').style.display = 'none';
    const nextBtn = document.getElementById('next-btn');
    nextBtn.style.display = 'none';

    if (mode === 'study') {
        document.getElementById('ui-battle').style.display = 'none';
        document.getElementById('ui-study').style.display = 'block';

        document.getElementById('flashcard').classList.remove('flipped');
        document.getElementById('q-text-study').textContent = q.q;
        document.getElementById('a-text-study').textContent = q.o[q.a];
        document.getElementById('expl-box').innerHTML = `<strong>Fact:</strong> ${expl}`;

        nextBtn.style.display = 'block';
        nextBtn.style.background = 'var(--cyan)';
        nextBtn.style.color = '#000';
        nextBtn.textContent = 'NEXT CARD';
        nextBtn.onclick = () => { currentIdx++; renderCard(); };

    } else {
        document.getElementById('ui-study').style.display = 'none';
        document.getElementById('ui-battle').style.display = 'block';

        document.getElementById('q-text-battle').textContent = q.q;
        const div = document.getElementById('battle-opts');
        div.innerHTML = '';

        q.o.forEach((opt, i) => {
            const b = document.createElement('button');
            b.className = 'opt-btn';
            b.textContent = opt;
            b.onclick = () => handleBattle(i, b, q);
            div.appendChild(b);
        });
    }
}

function handleBattle(idx, btn, q) {
    const all = document.querySelectorAll('.opt-btn');
    all.forEach(b => b.disabled = true);
    const nextBtn = document.getElementById('next-btn');

    const key = getProgressKey(q.id);
    const expl = q.expl || "Correct!";

    if (idx === q.a) {
        btn.classList.add('correct');
        let m = progress[key] || 0;
        if (m < 3) {
            m++;
            progress[key] = m;
            updateDoc(doc(db, 'users', currentUser.uid), { progress: progress });

            const pips = document.getElementById('pips').children;
            if (m <= 3) pips[m - 1].classList.add('filled');

            if (m === 3) confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, colors: ['#FFD700', '#FFA500'] }); 
        }

        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#00E676', '#FFD700'] });
        showFloatingFeedback(btn, "⚔️ VICTORIA!");

        nextBtn.style.background = 'var(--gold)';
        nextBtn.style.color = '#000';
        nextBtn.textContent = 'CONTINUE';
    } else {
        btn.classList.add('wrong');
        btn.classList.add('shake');
        showFloatingFeedback(btn, "❌ DO NOT FALTER!", true);
        setTimeout(() => btn.classList.remove('shake'), 500);

        all[q.a].classList.add('correct');
        queue.push(q);
        nextBtn.style.background = '#444';
        nextBtn.style.color = '#fff';
        nextBtn.textContent = 'REVIEW LATER';
    }

    document.getElementById('expl-box').innerHTML = `<strong>Fact:</strong> ${expl}`;
    document.getElementById('expl-box').style.display = 'block';
    nextBtn.style.display = 'block';
    nextBtn.onclick = () => { currentIdx++; renderCard(); };
}

function flipCard() {
    const el = document.getElementById('flashcard');
    if (el.classList.contains('flipped')) {
        el.classList.remove('flipped');
        document.getElementById('expl-box').style.display = 'none';
    } else {
        el.classList.add('flipped');
        document.getElementById('expl-box').style.display = 'block';
    }
}

function showEmpty() {
    document.getElementById('quiz-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('next-btn').style.display = 'none';
}

function showFloatingFeedback(element, text, isNegative = false) {
    const rect = element.getBoundingClientRect();
    const feedback = document.createElement('div');
    feedback.className = isNegative ? 'floating-feedback negative' : 'floating-feedback';
    feedback.textContent = text;
    const left = rect.left + (rect.width / 2) - 50; 
    const top = rect.top;
    feedback.style.left = `${left}px`;
    feedback.style.top = `${top}px`;
    document.body.appendChild(feedback);
    setTimeout(() => { feedback.remove(); }, 1000);
}