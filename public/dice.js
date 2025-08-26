let username = '';

function polygonPoints(sides) {

  const points = [];
  const angleStep = (2 * Math.PI) / sides;
  const offset = -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const x = 50 + 50 * Math.cos(offset + i * angleStep);
    const y = 50 + 50 * Math.sin(offset + i * angleStep);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
}

function getDiePoints(sides) {
  const shapes = {
    4: '50,0 0,100 100,100',
    6: '0,0 100,0 100,100 0,100',
    8: '50,0 100,50 50,100 0,50',
    10: '50,0 95,30 85,100 15,100 5,30',
    12: '25,0 75,0 100,50 75,100 25,100 0,50',
    20: '50,0 85,15 100,40 100,60 85,85 50,100 15,85 0,60 0,40 15,15',
  };
  return shapes[sides] || polygonPoints(sides);

}

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

function addRemoveListener(group) {
  const btn = group.querySelector('.remove-dice');
  btn.addEventListener('click', () => {
    const groups = document.querySelectorAll('.dice-group');
    if (groups.length > 1) {
      group.remove();
    }
  });
}

document.getElementById('add-dice').addEventListener('click', () => {
  const groups = document.getElementById('dice-groups');
  const first = groups.querySelector('.dice-group');
  const clone = first.cloneNode(true);
  clone.querySelector('.count').value = '1';
  addRemoveListener(clone);
  groups.appendChild(clone);
});

addRemoveListener(document.querySelector('.dice-group'));

document.getElementById('roll-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rollContainer = document.getElementById('current-roll');
  rollContainer.innerHTML = '';
  rollContainer.classList.remove('hidden');

  const groups = Array.from(document.querySelectorAll('.dice-group')).map((g) => ({
    count: parseInt(g.querySelector('.count').value, 10),
    sides: parseInt(g.querySelector('.sides').value, 10),
  }));
  const modifier =
    parseInt(document.getElementById('modifier').value, 10) || 0;

  const diceElems = [];
  const svgNS = 'http://www.w3.org/2000/svg';
  groups.forEach(({ count, sides }) => {
    for (let i = 0; i < count; i++) {
      const die = document.createElementNS(svgNS, 'svg');
      die.setAttribute('viewBox', '0 0 100 100');
      die.classList.add('die', 'rolling');

      const shape = document.createElementNS(svgNS, 'polygon');
      shape.setAttribute('points', getDiePoints(sides));
      shape.setAttribute('class', 'die-shape');
      die.appendChild(shape);

      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', '50');
      text.setAttribute('y', '55');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('class', 'die-number');
      text.textContent = '?';
      die.appendChild(text);

      rollContainer.appendChild(die);
      diceElems.push({ svg: die, text, sides });
    }
  });

  const animation = setInterval(() => {
    diceElems.forEach(({ sides, text }) => {
      text.textContent = Math.floor(Math.random() * sides) + 1;
    });
  }, 100);

  setTimeout(async () => {
    clearInterval(animation);
    try {
      const response = await fetch('/dice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dice: groups, modifier }),
      });
      if (response.ok) {
        const data = await response.json();
        const flatResults = [];
        data.forEach((r) => {
          flatResults.push(...r.rolls.split(',').map((n) => n.trim()));
        });
        diceElems.forEach(({ svg, text }, i) => {
          svg.classList.remove('rolling');
          text.textContent = flatResults[i];
        });
        loadLog();
      } else {
        rollContainer.classList.add('hidden');
      }
    } catch (err) {
      rollContainer.classList.add('hidden');
    }
  }, 1500);
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
