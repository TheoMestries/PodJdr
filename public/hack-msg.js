const identityCodeEl = document.getElementById('identity-code');
const identityLabelEl = document.getElementById('identity-label');
const identitySummaryEl = document.getElementById('shadow-identity');
const inboxList = document.getElementById('shadow-inbox');
const sentList = document.getElementById('shadow-sent');
const errorBox = document.getElementById('shadow-error');
const successBox = document.getElementById('shadow-success');
const form = document.getElementById('shadow-send-form');
const codeInput = document.getElementById('shadow-code');
const messageInput = document.getElementById('shadow-message');
const backBtn = document.getElementById('back-btn');

let refreshInterval = null;

function clearFeedback() {
  errorBox.classList.add('hidden');
  successBox.classList.add('hidden');
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
  successBox.classList.add('hidden');
}

function showSuccess(message) {
  successBox.textContent = message;
  successBox.classList.remove('hidden');
  errorBox.classList.add('hidden');
}

function formatTimestamp(value) {
  try {
    const date = new Date(value);
    return date.toLocaleString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (err) {
    return value;
  }
}

function renderEmpty(list, text) {
  const li = document.createElement('li');
  li.classList.add('shadow-entry', 'empty');
  li.textContent = text;
  list.appendChild(li);
}

function renderMessage(list, title, code, label, content, createdAt) {
  const li = document.createElement('li');
  li.classList.add('shadow-entry');

  const header = document.createElement('div');
  header.classList.add('shadow-entry-header');
  const prefix = document.createElement('span');
  prefix.textContent = `${title} `;
  const codeSpan = document.createElement('span');
  codeSpan.classList.add('shadow-code');
  codeSpan.textContent = code;
  header.appendChild(prefix);
  header.appendChild(codeSpan);
  if (label) {
    const labelSpan = document.createElement('span');
    labelSpan.classList.add('shadow-label');
    labelSpan.textContent = ` (${label})`;
    header.appendChild(labelSpan);
  }
  li.appendChild(header);

  const body = document.createElement('p');
  body.classList.add('shadow-entry-body');
  body.textContent = content;
  li.appendChild(body);

  const time = document.createElement('time');
  time.classList.add('shadow-entry-time');
  time.dateTime = createdAt;
  time.textContent = formatTimestamp(createdAt);
  li.appendChild(time);

  list.appendChild(li);
}

async function loadMessages() {
  try {
    const res = await fetch('/shadow/messages');
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    inboxList.innerHTML = '';
    sentList.innerHTML = '';

    if (!data.inbox.length) {
      renderEmpty(inboxList, 'Aucun message reçu pour le moment.');
    } else {
      data.inbox.forEach((msg) => {
        renderMessage(
          inboxList,
          'De',
          msg.senderCode,
          msg.senderLabel,
          msg.content,
          msg.createdAt
        );
      });
    }

    if (!data.sent.length) {
      renderEmpty(sentList, 'Vous n\'avez encore envoyé aucun message.');
    } else {
      data.sent.forEach((msg) => {
        renderMessage(
          sentList,
          'Vers',
          msg.receiverCode,
          msg.receiverLabel,
          msg.content,
          msg.createdAt
        );
      });
    }
  } catch (err) {
    console.error('Erreur lors du chargement du canal fantôme', err);
  }
}

async function initShadow() {
  try {
    const res = await fetch('/shadow/access');
    if (res.status === 401) {
      window.location.href = '/';
      return;
    }
    if (res.status === 403) {
      window.location.href = 'hub.html';
      return;
    }
    if (!res.ok) {
      showError('Impossible de vérifier les autorisations.');
      return;
    }
    const data = await res.json();
    identityCodeEl.textContent = data.code;
    identityLabelEl.textContent = data.identity;
    if (identitySummaryEl) {
      identitySummaryEl.textContent = `${data.identity} · ${data.code}`;
    }
    await loadMessages();
    refreshInterval = setInterval(loadMessages, 5000);
  } catch (err) {
    showError('Connexion au canal fantôme impossible.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFeedback();
  const code = codeInput.value.trim();
  const rawMessage = messageInput.value;
  const normalizedMessage = rawMessage.replace(/\r\n?/g, '\n');
  if (!code || !normalizedMessage.trim()) {
    showError('Code contact et message requis.');
    return;
  }

  try {
    const res = await fetch('/shadow/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactCode: code, content: normalizedMessage }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Transmission refusée.');
      return;
    }
    showSuccess('Transmission envoyée.');
    messageInput.value = '';
    await loadMessages();
  } catch (err) {
    showError('Erreur lors de l\'envoi de la transmission.');
  }
});

if (backBtn) {
  backBtn.addEventListener('click', () => {
    window.location.href = 'hub.html';
  });
}

window.addEventListener('beforeunload', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

initShadow();
