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

function getNumberColor(value, sides) {
  if (sides === 100) {
    if (value <= 10) {
      const intensity = Math.round(((11 - value) * 255) / 10);
      return `rgb(0, ${intensity}, 0)`;
    }
    if (value >= 90) {
      const intensity = Math.round(((value - 89) * 255) / 11);
      return `rgb(${intensity}, 0, 0)`;
    }
    return '';
  }
  if (value === 1) return 'red';
  if (value === sides) return 'green';
  return '';
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

document.getElementById('stats-btn').addEventListener('click', () => {
  window.location.href = 'stats.html';
});

function updateRemoveButtons() {
  const groups = document.querySelectorAll('.dice-group');
  groups.forEach((g) => {
    const btn = g.querySelector('.remove-dice');
    if (groups.length > 1) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });
}

function addRemoveListener(group) {
  const btn = group.querySelector('.remove-dice');
  btn.addEventListener('click', () => {
    const groups = document.querySelectorAll('.dice-group');
    if (groups.length > 1) {
      group.remove();
      updateRemoveButtons();
    }
  });
}

document.getElementById('add-dice').addEventListener('click', () => {
  const groups = document.getElementById('dice-groups');
  const first = groups.querySelector('.dice-group');
  const clone = first.cloneNode(true);
  clone.querySelector('.count').value = '1';
  clone.querySelector('.modifier').value = '0';
  addRemoveListener(clone);
  groups.appendChild(clone);
  updateRemoveButtons();
});

addRemoveListener(document.querySelector('.dice-group'));
updateRemoveButtons();

document.getElementById('roll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rollContainer = document.getElementById('current-roll');
    const totalContainer = document.getElementById('roll-total');
    rollContainer.innerHTML = '';
    rollContainer.classList.remove('hidden');
    totalContainer.textContent = '';
    totalContainer.classList.add('hidden');

  const groups = Array.from(document.querySelectorAll('.dice-group')).map((g) => ({
    count: parseInt(g.querySelector('.count').value, 10),
    sides: parseInt(g.querySelector('.sides').value, 10),
    modifier: parseInt(g.querySelector('.modifier').value, 10) || 0,
  }));

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
        body: JSON.stringify({ dice: groups }),
      });
      if (response.ok) {
        const data = await response.json();
        const flatResults = [];
        data.forEach((r) => {
          flatResults.push(...r.rolls.split(',').map((n) => n.trim()));
        });
        diceElems.forEach(({ svg, text, sides }, i) => {
          svg.classList.remove('rolling');
          const value = parseInt(flatResults[i], 10);
          text.textContent = value;
          const color = getNumberColor(value, sides);
          text.style.fill = color;
        });
          const totalContainer = document.getElementById('roll-total');
          totalContainer.innerHTML = '';
          data.forEach(({ dice, total }) => {
            const p = document.createElement('p');
            p.textContent = `${dice} = ${total}`;
            totalContainer.appendChild(p);
          });
          totalContainer.classList.remove('hidden');
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
    log.slice(-50).reverse().forEach(({ username, dice, result, rolls, modifier, total }) => {
    const li = document.createElement('li');

    const sidesMatch = dice.match(/d(\d+)/);
    const sides = sidesMatch ? parseInt(sidesMatch[1], 10) : null;

      let modifierVal = typeof modifier === 'number' ? modifier : 0;
      let modString = '';
      if (modifier === undefined) {
        let modMatch = result.match(/ ([+-]\d+) =/);
        modString = modMatch ? modMatch[1] : '';
        modifierVal = modMatch ? parseInt(modMatch[1], 10) : 0;
        if (!modMatch) {
          modMatch = dice.match(/ ([+-]\d+)$/);
          modString = modMatch ? modMatch[1] : '';
          modifierVal = modMatch ? parseInt(modMatch[1], 10) : 0;
        }
      } else if (modifierVal) {
        modString = modifierVal >= 0 ? `+${modifierVal}` : `${modifierVal}`;
      }


      let coloredResult = result;
      if (rolls && sides) {
        const rollValues = rolls.split(',').map((n) => parseInt(n.trim(), 10));
        const totalVal = typeof total === 'number' ? total : rollValues.reduce((sum, val) => sum + val, 0) + modifierVal;
        const separator = modifierVal ? ' + ' : ', ';
        const coloredRolls = rollValues
          .map((val) => {
            const color = getNumberColor(val, sides);
            return color ? `<span style="color:${color}">${val}</span>` : val;
          })
          .join(separator);

        coloredResult = modifierVal
          ? `${coloredRolls} ${modString} = ${totalVal}`
          : coloredRolls;
      }

    li.innerHTML = `${username} a lancé ${dice} : ${coloredResult}`;
    list.appendChild(li);
  });
}

init();
