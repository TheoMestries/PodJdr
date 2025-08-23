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
  const rollContainer = document.getElementById('current-roll');
  rollContainer.innerHTML = '';
  rollContainer.classList.remove('hidden');

  const diceElems = [];
  for (let i = 0; i < count; i++) {
    const die = document.createElement('div');
    die.className = 'die rolling';
    die.textContent = '?';
    rollContainer.appendChild(die);
    diceElems.push(die);
  }

  const animation = setInterval(() => {
    diceElems.forEach((die) => {
      die.textContent = Math.floor(Math.random() * sides) + 1;
    });
  }, 100);

  try {
    const response = await fetch('/dice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, sides }),
    });
    if (response.ok) {
      const data = await response.json();
      clearInterval(animation);
      const results = data.result.split(',').map((n) => n.trim());
      diceElems.forEach((die, i) => {
        die.classList.remove('rolling');
        die.textContent = results[i];
      });
      document.getElementById('count').value = '1';
      loadLog();
    } else {
      clearInterval(animation);
      rollContainer.classList.add('hidden');
    }
  } catch (err) {
    clearInterval(animation);
    rollContainer.classList.add('hidden');
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
