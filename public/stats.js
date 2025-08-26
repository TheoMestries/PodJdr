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
  const tableBody = document.querySelector('#stats-table tbody');
  tableBody.innerHTML = '';
  data.forEach(({ username, dice }) => {
    dice.forEach(({ sides, rolls, diceRolled, average, max }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${username}</td>
        <td>d${sides}</td>
        <td>${rolls}</td>
        <td>${diceRolled}</td>
        <td>${average}</td>
        <td>${max}</td>
      `;
      tableBody.appendChild(tr);
    });
  });
}

init();
