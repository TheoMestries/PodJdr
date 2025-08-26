let currentPage = 1;
let totalPages = 1;
const limit = 10;

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

document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    loadStats();
  }
});

document.getElementById('next-btn').addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    loadStats();
  }
});

async function loadStats() {
  const res = await fetch(`/stats?page=${currentPage}&limit=${limit}`);
  if (!res.ok) return;
  const { stats, totalPages: tp } = await res.json();
  totalPages = tp;
  const tableBody = document.querySelector('#stats-table tbody');
  tableBody.innerHTML = '';
  stats.forEach(({ username, dice }) => {
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
  document.getElementById('page-info').textContent = `Page ${currentPage} / ${totalPages}`;
  document.getElementById('prev-btn').disabled = currentPage <= 1;
  document.getElementById('next-btn').disabled = currentPage >= totalPages;
}

init();
