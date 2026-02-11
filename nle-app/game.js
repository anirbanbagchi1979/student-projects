import { QUESTION_DATA } from './questions.js';
import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc } from './firebase-config.js';

// STATE
let currentUser = null;
let progress = {};
let queue = [];
let currentIdx = 0;
let mode = 'study';

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
};

async function loadData() {
    if (!currentUser) return;
    const ref = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) progress = snap.data().progress || {};
    else { await setDoc(ref, { progress: {} }); progress = {}; }
    calcStats();
}

function calcStats() {
    const total = QUESTION_DATA.length;
    let nNew = 0, nLearn = 0, nMaster = 0;

    QUESTION_DATA.forEach(q => {
        const m = progress[q.id] || 0;
        if (m === 0) nNew++;
        else if (m < 3) nLearn++;
        else nMaster++;
    });

    document.getElementById('count-new').textContent = nNew;
    document.getElementById('count-learn').textContent = nLearn;
    document.getElementById('count-master').textContent = nMaster;

    document.getElementById('bar-new').style.width = (nNew / total * 100) + '%';
    document.getElementById('bar-learn').style.width = (nLearn / total * 100) + '%';
    document.getElementById('bar-master').style.width = (nMaster / total * 100) + '%';

    let rank = RANKS[0].n;
    for (let r of RANKS) if (nMaster >= r.req) rank = r.n;
    document.getElementById('u-rank').textContent = rank;
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

    const badge = document.getElementById('mode-badge');
    if (mode === 'battle') {
        badge.textContent = "BATTLE MODE";
        badge.style.color = "var(--gold)";
        badge.style.borderColor = "var(--gold)";
        queue = QUESTION_DATA.filter(q => (progress[q.id] || 0) < 3);
    } else {
        badge.textContent = "STUDY MODE";
        badge.style.color = "var(--cyan)";
        badge.style.borderColor = "var(--cyan)";
        queue = [...QUESTION_DATA];
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
    const m = progress[q.id] || 0;

    document.getElementById('q-cat').textContent = q.cat;
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
        document.getElementById('expl-box').innerHTML = `<strong>Fact:</strong> ${q.expl}`;

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

    if (idx === q.a) {
        btn.classList.add('correct');
        let m = progress[q.id] || 0;
        if (m < 3) {
            m++;
            progress[q.id] = m;
            updateDoc(doc(db, 'users', currentUser.uid), { progress: progress });

            const pips = document.getElementById('pips').children;
            if (m <= 3) pips[m - 1].classList.add('filled');

            if (m === 3) confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, colors: ['#FFD700', '#FFA500'] }); // Mastered specific celebration
        }

        // Immediate celebration for EVERY correct answer
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#00E676', '#FFD700'] });
        showFloatingFeedback(btn, "⚔️ VICTORIA!");

        nextBtn.style.background = 'var(--gold)';
        nextBtn.style.color = '#000';
        nextBtn.textContent = 'CONTINUE';
    } else {
        btn.classList.add('wrong');
        all[q.a].classList.add('correct');
        queue.push(q);
        nextBtn.style.background = '#444';
        nextBtn.style.color = '#fff';
        nextBtn.textContent = 'REVIEW LATER';
    }

    document.getElementById('expl-box').innerHTML = `<strong>Fact:</strong> ${q.expl}`;
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

function showFloatingFeedback(element, text) {
    const rect = element.getBoundingClientRect();
    const feedback = document.createElement('div');
    feedback.className = 'floating-feedback';
    feedback.textContent = text;

    // Calculate center of button
    const left = rect.left + (rect.width / 2) - 50; // Approximating centering, better to use CSS transform translate if width varies
    const top = rect.top;

    feedback.style.left = `${left}px`;
    feedback.style.top = `${top}px`;

    // Append to body to avoid clipping or relative positioning issues within container
    document.body.appendChild(feedback);

    // Remove after animation
    setTimeout(() => {
        feedback.remove();
    }, 1000);
}