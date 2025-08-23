const overlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const phases = [
  'Connexion au serveur...',
  'Analyse des identifiants...',
  "Récupération des informations sur l'individu...",
  'Validation des accès...',
  'Ouverture de la session...'
];
let phaseInterval;

function showLoading() {
  let index = 0;
  overlay.classList.remove('hidden');
  loadingText.textContent = phases[index];
  phaseInterval = setInterval(() => {
    index = (index + 1) % phases.length;
    loadingText.textContent = phases[index];
  }, 1000);
}

function hideLoading(finalMessage) {
  clearInterval(phaseInterval);
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

  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

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
