async function init() {
  const res = await fetch('/me');
  if (!res.ok) {
    window.location.href = '/';
    return;
  }
  loadStats();
}

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = 'dice.html';
});

async function loadStats() {
  const res = await fetch('/stats');
  if (!res.ok) return;
  const data = await res.json();
  const list = document.getElementById('stats-list');
  list.innerHTML = '';
  data.forEach(({ username, rolls, diceRolled, average, max }) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${username}</strong> - Lancés: ${rolls}, Dés lancés: ${diceRolled}, Moyenne: ${average}, Max: ${max}`;
    list.appendChild(li);
  });
}

init();
