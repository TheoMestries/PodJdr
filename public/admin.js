document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/';
});

let pnjUpdatesSource = null;

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
  initPnjLiveUpdates();
  loadShadowAccess();
  initAnnouncements();
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

function initPnjLiveUpdates() {
  if (typeof EventSource === 'undefined') {
    return;
  }
  if (pnjUpdatesSource) {
    pnjUpdatesSource.close();
  }
  pnjUpdatesSource = new EventSource('/admin/pnjs/stream');
  pnjUpdatesSource.addEventListener('pnj-update', () => {
    loadPnjs();
  });
  pnjUpdatesSource.addEventListener('error', () => {
    // Let the browser attempt automatic reconnection. Close if the stream ended.
    if (pnjUpdatesSource && pnjUpdatesSource.readyState === EventSource.CLOSED) {
      pnjUpdatesSource.close();
    }
  });
}

window.addEventListener('beforeunload', () => {
  if (pnjUpdatesSource) {
    pnjUpdatesSource.close();
    pnjUpdatesSource = null;
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

let announcementRecipients = [];

async function initAnnouncements() {
  await loadAnnouncementRecipients();
  setupAnnouncementForm();
}

async function loadAnnouncementRecipients() {
  const list = document.getElementById('announcement-recipient-list');
  if (!list) return;
  list.innerHTML = '<li>Chargement...</li>';

  try {
    const res = await fetch('/admin/users');
    if (!res.ok) {
      throw new Error('Impossible de charger les joueurs');
    }
    const users = await res.json();
    announcementRecipients = Array.isArray(users) ? users : [];
    renderAnnouncementRecipients();
  } catch (err) {
    console.error(err);
    list.innerHTML = '<li class="empty-entry">Erreur de chargement</li>';
  }
}

function renderAnnouncementRecipients() {
  const list = document.getElementById('announcement-recipient-list');
  if (!list) return;
  list.innerHTML = '';

  if (!announcementRecipients.length) {
    const li = document.createElement('li');
    li.classList.add('empty-entry');
    li.textContent = 'Aucun joueur disponible';
    list.appendChild(li);
    return;
  }

  announcementRecipients.forEach(({ id, username }) => {
    const li = document.createElement('li');
    li.classList.add('announcement-recipient');

    const label = document.createElement('label');
    label.classList.add('announcement-recipient-label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('announcement-checkbox');
    checkbox.value = id;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = username;

    label.appendChild(checkbox);
    label.appendChild(nameSpan);
    li.appendChild(label);
    list.appendChild(li);
  });
}

function setupAnnouncementForm() {
  const form = document.getElementById('announcement-form');
  const messageInput = document.getElementById('announcement-message');
  const signatureInput = document.getElementById('announcement-signature-input');
  const selectAllBtn = document.getElementById('announcement-select-all');
  const clearBtn = document.getElementById('announcement-clear');
  const feedbackEl = document.getElementById('announcement-feedback');

  if (
    !form ||
    !messageInput ||
    !selectAllBtn ||
    !clearBtn ||
    !feedbackEl ||
    !signatureInput
  ) {
    return;
  }

  selectAllBtn.addEventListener('click', () => {
    const checkboxes = form.querySelectorAll('.announcement-checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
    });
  });

  clearBtn.addEventListener('click', () => {
    const checkboxes = form.querySelectorAll('.announcement-checkbox');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = messageInput.value.trim();
    const selectedIds = Array.from(
      form.querySelectorAll('.announcement-checkbox:checked'),
      (checkbox) => parseInt(checkbox.value, 10)
    ).filter((value) => Number.isInteger(value));
    const signature = signatureInput.value.trim();

    if (!message) {
      setAnnouncementFeedback('Le message ne peut pas être vide.', true);
      return;
    }

    if (!selectedIds.length) {
      setAnnouncementFeedback('Sélectionnez au moins un joueur.', true);
      return;
    }

    try {
      const res = await fetch('/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          signature,
          userIds: selectedIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Impossible d'envoyer l'annonce");
      }

      setAnnouncementFeedback('Annonce envoyée avec succès.', false);
      messageInput.value = '';
      signatureInput.value = '';
      form.querySelectorAll('.announcement-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
      });
    } catch (err) {
      setAnnouncementFeedback(err.message, true);
    }
  });
}

function setAnnouncementFeedback(message, isError) {
  const feedbackEl = document.getElementById('announcement-feedback');
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.classList.toggle('error', !!isError);
  feedbackEl.classList.toggle('success', !isError);
  feedbackEl.classList.remove('hidden');
}

