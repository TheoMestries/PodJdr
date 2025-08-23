let username = '';

async function init() {
  const res = await fetch('/me');
  if (!res.ok) {
    window.location.href = '/';
    return;
  }
  const data = await res.json();
  username = data.username;
  loadLog();
  setInterval(loadLog, 3000);
}

document.getElementById('back-btn').addEventListener('click', () => {
  window.location.href = 'hub.html';
});

document.getElementById('roll-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const count = parseInt(document.getElementById('count').value, 10);
  const sides = parseInt(document.getElementById('sides').value, 10);
  const res = await fetch('/dice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, sides }),
  });
  if (res.ok) {
    document.getElementById('count').value = '1';
    loadLog();
  }
});

async function loadLog() {
  const res = await fetch('/dice');
  if (!res.ok) return;
  const log = await res.json();
  const list = document.getElementById('dice-log');
  list.innerHTML = '';
  log.slice(-50).reverse().forEach(({ username, dice, result }) => {
    const li = document.createElement('li');
    li.textContent = `${username} a lancé ${dice} : ${result}`;
    list.appendChild(li);
  });
}

init();
