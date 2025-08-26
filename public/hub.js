let username = '';
let userId = null;
let isPnj = false;

let currentContactId = null;
let chatInterval = null;

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/';
});

document.getElementById('dice-btn').addEventListener('click', () => {
  window.location.href = 'dice.html';
});

async function init() {
  const res = await fetch('/me');
  if (!res.ok) {
    window.location.href = '/';
    return;
  }
  const data = await res.json();
  username = data.username;
  userId = data.userId || data.pnjId;
  isPnj = data.isPnj;
  document.getElementById('user-name').textContent = username;
  loadContacts();
  if (!isPnj) {
    loadRequests();
  } else {
    document.getElementById('request-list').previousElementSibling.classList.add('hidden');
    document.getElementById('request-list').classList.add('hidden');
  }
}

async function loadContacts() {
  const res = await fetch('/contacts');
  if (!res.ok) return;
  const contacts = await res.json();
  const list = document.getElementById('contact-list');
  list.innerHTML = '';
  contacts.forEach(({ id, username }) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = username;
    if (!isPnj) {
      span.addEventListener('click', () => openChat(id, username));
    }
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.classList.add('btn', 'delete-btn');
    btn.addEventListener('click', async () => {
      await fetch('/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: id }),
      });
      loadContacts();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function loadRequests() {
  const res = await fetch('/contact-requests');
  if (!res.ok) return;
  const requests = await res.json();
  const list = document.getElementById('request-list');
  list.innerHTML = '';
  requests.forEach(({ username, requesterId }) => {
    const li = document.createElement('li');
    li.textContent = username + ' ';
    const btn = document.createElement('button');
    btn.textContent = 'Accepter';
    btn.classList.add('btn');
    btn.addEventListener('click', async () => {
      await fetch('/contacts/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId }),
      });
      loadContacts();
      if (!isPnj) loadRequests();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

document
  .getElementById('add-contact-form')
  .addEventListener('submit', async (e) => {
    e.preventDefault();
    const contactUsername = document.getElementById('contact-username').value;
    const res = await fetch('/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactUsername }),
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('contact-username').value = '';
      loadContacts();
      if (!isPnj) {
        loadRequests();
      }
    } else {
      alert(data.error);
    }
  });

async function openChat(id, username) {
  if (isPnj) return;
  currentContactId = id;
  document.getElementById('chat-with').textContent = username;
  document.getElementById('chat-section').classList.remove('hidden');
  await loadMessages();
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(loadMessages, 3000);
}

async function loadMessages() {
  if (!currentContactId || isPnj) return;
  const res = await fetch(`/messages?contactId=${encodeURIComponent(currentContactId)}`);
  if (!res.ok) return;
  const messages = await res.json();
  const list = document.getElementById('message-list');
  list.innerHTML = '';
  messages.forEach(({ sender_id, content }) => {
    const li = document.createElement('li');
    li.textContent = content;
    li.classList.add('message');
    if (sender_id == userId) {
      li.classList.add('sent');
    } else {
      li.classList.add('received');
    }
    list.appendChild(li);
  });
  list.scrollTop = list.scrollHeight;
}

document.getElementById('message-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentContactId || isPnj) return;
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (!content) return;
  await fetch('/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiverId: currentContactId, content }),
  });
  input.value = '';
  loadMessages();
});

init();
