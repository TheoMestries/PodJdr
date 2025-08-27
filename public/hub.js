let username = '';
let userId = null;
let isPnj = false;

let currentContactId = null;
let chatInterval = null;
let currentContactIsPnj = false;

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
  loadRequests();
  loadPending();
}

async function loadContacts() {
  const res = await fetch('/contacts');
  if (!res.ok) return;
  const contacts = await res.json();
  const list = document.getElementById('contact-list');
  list.innerHTML = '';
  contacts.forEach(({ id, username, is_pnj, unread_count }) => {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('contact-name');
    nameSpan.textContent = username;
    nameSpan.addEventListener('click', () => openChat(id, username, !!is_pnj));

    if (unread_count) {
      const badge = document.createElement('span');
      badge.classList.add('badge');
      badge.textContent = unread_count;
      nameSpan.appendChild(badge);
    }

    li.appendChild(nameSpan);

    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.classList.add('btn', 'delete-btn');
    btn.addEventListener('click', async () => {
      await fetch('/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: id, isPnj: !!is_pnj }),
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
    requests.forEach(({ username, requesterId, is_pnj }) => {
      const li = document.createElement('li');
      li.textContent = username + ' ';
      const btn = document.createElement('button');
      btn.textContent = 'Accepter';
      btn.classList.add('btn');
      btn.addEventListener('click', async () => {
        await fetch('/contacts/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId, isPnj: !!is_pnj }),
        });
        loadContacts();
        loadRequests();
        loadPending();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

async function loadPending() {
  const res = await fetch('/pending-requests');
  if (!res.ok) return;
  const pending = await res.json();
  const list = document.getElementById('pending-list');
  list.innerHTML = '';
  pending.forEach(({ username }) => {
    const li = document.createElement('li');
    li.textContent = username;
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
        loadRequests();
        loadPending();
      } else {
        alert(data.error);
      }
    });

async function openChat(id, username, contactIsPnj) {
  currentContactId = id;
  currentContactIsPnj = contactIsPnj;
  document.getElementById('chat-with').textContent = username;
  document.getElementById('chat-section').classList.remove('hidden');
  const placeholder = document.getElementById('placeholder');
  if (placeholder) placeholder.classList.add('hidden');
  await loadMessages();
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(loadMessages, 3000);
}

async function loadMessages() {
  if (!currentContactId) return;
  const res = await fetch(`/messages?contactId=${encodeURIComponent(currentContactId)}&isPnj=${currentContactIsPnj ? 1 : 0}`);
  if (!res.ok) return;
  const messages = await res.json();
  const list = document.getElementById('message-list');
  list.innerHTML = '';
  messages.forEach(({ sender_user_id, sender_pnj_id, content, is_read }) => {
    const li = document.createElement('li');
    li.classList.add('message');
    const text = document.createElement('div');
    text.textContent = content;
    li.appendChild(text);
    const senderId = sender_user_id || sender_pnj_id;
    if (senderId == userId) {
      li.classList.add('sent');
      const status = document.createElement('span');
      status.classList.add('status');
      status.textContent = is_read ? 'Lu' : 'Non lu';
      li.appendChild(status);
    } else {
      li.classList.add('received');
      if (!is_read) li.classList.add('unread');
    }
    list.appendChild(li);
  });
  list.scrollTop = list.scrollHeight;
  loadContacts();
}

  document.getElementById('message-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentContactId) return;
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content) return;
    await fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId: currentContactId, content, isReceiverPnj: currentContactIsPnj }),
    });
    input.value = '';
    loadMessages();
  });

  init();
