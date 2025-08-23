const overlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const progressBar = document.getElementById('progress-bar');
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

document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  showLoading();

  const delayMs = phases.length * 1000;
  const [res] = await Promise.all([
    fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    new Promise((resolve) => setTimeout(resolve, delayMs)),
  ]);

  const data = await res.json();
  if (res.ok) {
    const { userId } = data;
    hideLoading('Connexion réussie');
    setTimeout(() => {
      window.location.href = `hub.html?username=${encodeURIComponent(username)}&userId=${encodeURIComponent(userId)}`;
    }, 800);
  } else {
    hideLoading();
    alert(data.error);
  }
});
