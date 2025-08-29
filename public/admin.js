document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/';
});

async function init() {
  const res = await fetch('/me');
  if (!res.ok) {
    window.location.href = '/';
    return;
  }
  const data = await res.json();
  if (!data.isAdmin) {
    window.location.href = '/';
    return;
  }
  loadPnjs();
}

async function loadPnjs() {
  const res = await fetch('/admin/pnjs');
  if (!res.ok) return;
  const pnjs = await res.json();
  const tbody = document.querySelector('#pnj-table tbody');
  tbody.innerHTML = '';
  pnjs.forEach(({ id, name, description, pending_requests, unread_messages }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `\n      <td>${name}</td>\n      <td>${description || ''}</td>\n      <td>${pending_requests}</td>\n      <td>${unread_messages}</td>\n      <td>\n        <button class="btn impersonate-btn">👁️</button>\n        <button class="btn delete-btn">🗑️</button>\n      </td>`;
    tr.querySelector('.impersonate-btn').addEventListener('click', async () => {
      await fetch(`/admin/pnjs/${id}/impersonate`, { method: 'POST' });
      window.location.href = '/hub.html';
    });
    tr.querySelector('.delete-btn').addEventListener('click', async () => {
      await fetch(`/admin/pnjs/${id}`, { method: 'DELETE' });
      loadPnjs();
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('pnj-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('pnj-name').value;
  const description = document.getElementById('pnj-description').value;
  const res = await fetch('/admin/pnjs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (res.ok) {
    document.getElementById('pnj-name').value = '';
    document.getElementById('pnj-description').value = '';
    loadPnjs();
  }
});

init();

