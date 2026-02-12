/**
 * Loads HTML fragments into the DOM.
 */

export async function loadComponent(containerId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
        const html = await response.text();
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = html;
        } else {
            console.error(`Container #${containerId} not found for ${filePath}`);
        }
    } catch (error) {
        console.error(error);
    }
}

export async function initUI() {
    await Promise.all([
        loadComponent('login-container', 'views/login.html'),
        loadComponent('ranks-container', 'views/ranks.html'),
        loadComponent('header-container', 'views/components/header.html'),
        loadComponent('home-container', 'views/home.html'),
        loadComponent('browse-container-wrapper', 'views/browse.html'),
        loadComponent('quiz-container-wrapper', 'views/quiz.html')
    ]);
}
