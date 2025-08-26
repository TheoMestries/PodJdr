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
  data.forEach(({ username, dice }) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${username}</strong>`;
    const subList = document.createElement('ul');
    dice.forEach(({ sides, rolls, diceRolled, average, max }) => {
      const subLi = document.createElement('li');
      subLi.textContent = `d${sides} - Lancés: ${rolls}, Dés lancés: ${diceRolled}, Moyenne: ${average}, Max: ${max}`;
      subList.appendChild(subLi);
    });
    li.appendChild(subList);
    list.appendChild(li);
  });
}

init();
