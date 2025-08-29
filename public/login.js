const overlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const progressBar = document.getElementById('progress-bar');
const errorBox = document.getElementById('error-box');
const phases = [
  'Connexion au serveur...',
  'Analyse des identifiants...',
  "Récupération des informations de l\'individu...",
  "Vérification de l'historique...",
  'Cryptage des données...',
  'Validation des accès...',
  'Ouverture de la session...'
];
let phaseInterval;
let progressInterval;

function showLoading() {
  let index = 0;
  overlay.classList.remove('hidden');
  loadingText.textContent = phases[index];
  progressBar.style.width = '0%';

  phaseInterval = setInterval(() => {
    index = (index + 1) % phases.length;
    loadingText.textContent = phases[index];
  }, 1000);

  const totalDuration = phases.length * 1000;
  const step = 100;
  const increment = 100 / (totalDuration / step);
  progressInterval = setInterval(() => {
    const current = parseFloat(progressBar.style.width) || 0;
    const next = Math.min(current + increment, 100);
    progressBar.style.width = `${next}%`;
    if (next >= 100) {
      clearInterval(progressInterval);
    }
  }, step);
}

function hideLoading(finalMessage) {
  clearInterval(phaseInterval);
  clearInterval(progressInterval);
  progressBar.style.width = '100%';
  if (finalMessage) {
    loadingText.textContent = finalMessage;
    setTimeout(() => overlay.classList.add('hidden'), 800);
  } else {
    overlay.classList.add('hidden');
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function hideError() {
  errorBox.classList.add('hidden');
}

document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (res.ok) {
      if (data.isAdmin) {
        window.location.href = 'admin.html';
        return;
      }
      showLoading();
      const delayMs = phases.length * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      hideLoading('Connexion réussie');
      setTimeout(() => {
        window.location.href = 'hub.html';
      }, 800);
    } else {
      showError(data.error);
    }
  } catch (err) {
    showError('Erreur de connexion');
  }
});
