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
  const list = document.getElementById('pnj-list');
  list.innerHTML = '';
  pnjs.forEach(({ id, name, description }) => {
    const li = document.createElement('li');
    li.textContent = `${name} - ${description || ''}`;
    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.classList.add('btn', 'delete-btn');
    btn.addEventListener('click', async () => {
      await fetch(`/admin/pnjs/${id}`, { method: 'DELETE' });
      loadPnjs();
    });
    li.appendChild(btn);
    list.appendChild(li);
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

