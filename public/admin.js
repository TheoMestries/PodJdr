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
  loadShadowAccess();
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

async function loadShadowAccess() {
  const res = await fetch('/admin/shadow-access');
  if (!res.ok) return;
  const { users, pnjs } = await res.json();
  renderShadowList(
    document.getElementById('shadow-user-list'),
    users,
    'username'
  );
  renderShadowList(document.getElementById('shadow-pnj-list'), pnjs, 'name');
}

function renderShadowList(listEl, items, labelKey) {
  listEl.innerHTML = '';
  if (!items || !items.length) {
    const li = document.createElement('li');
    li.textContent = 'Aucun accès enregistré';
    li.classList.add('empty-entry');
    listEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    const label = item[labelKey] || '';
    const sourceLabel = item.source === 'env' ? ' (env)' : '';
    li.textContent = `${label}${sourceLabel}`;
    listEl.appendChild(li);
  });
}

document.getElementById('shadow-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('shadow-user-name');
  const username = input.value.trim();
  if (!username) return;
  const res = await fetch('/admin/shadow-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'user', identifier: username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "Impossible d'accorder l'accès");
    return;
  }
  input.value = '';
  loadShadowAccess();
});

document.getElementById('shadow-pnj-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('shadow-pnj-name');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch('/admin/shadow-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'pnj', identifier: name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "Impossible d'accorder l'accès");
    return;
  }
  input.value = '';
  loadShadowAccess();
});

init();

