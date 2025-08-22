const params = new URLSearchParams(window.location.search);
const username = params.get('username');
const userId = params.get('userId');

if (username) {
  document.getElementById('user-name').textContent = username;
}

let currentContactId = null;
let chatInterval = null;

async function loadContacts() {
  if (!userId) return;
  const res = await fetch(`/contacts?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return;
  const contacts = await res.json();
  const list = document.getElementById('contact-list');
  list.innerHTML = '';
  contacts.forEach(({ id, username }) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = username;
    span.addEventListener('click', () => openChat(id, username));
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.classList.add('delete-btn');
    btn.addEventListener('click', async () => {
      await fetch('/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, contactId: id }),
      });
      loadContacts();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function loadRequests() {
  if (!userId) return;
  const res = await fetch(`/contact-requests?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return;
  const requests = await res.json();
  const list = document.getElementById('request-list');
  list.innerHTML = '';
  requests.forEach(({ username, requesterId }) => {
    const li = document.createElement('li');
    li.textContent = username + ' ';
    const btn = document.createElement('button');
    btn.textContent = 'Accepter';
    btn.addEventListener('click', async () => {
      await fetch('/contacts/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, requesterId }),
      });
      loadContacts();
      loadRequests();
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
      body: JSON.stringify({ userId, contactUsername }),
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('contact-username').value = '';
      loadRequests();
    } else {
      alert(data.error);
    }
  });

loadContacts();
loadRequests();

async function openChat(id, username) {
  currentContactId = id;
  document.getElementById('chat-with').textContent = username;
  document.getElementById('chat-section').classList.remove('hidden');
  await loadMessages();
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(loadMessages, 3000);
}

async function loadMessages() {
  if (!currentContactId) return;
  const res = await fetch(
    `/messages?userId=${encodeURIComponent(userId)}&contactId=${encodeURIComponent(currentContactId)}`
  );
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
  if (!currentContactId) return;
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (!content) return;
  await fetch('/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId: userId, receiverId: currentContactId, content }),
  });
  input.value = '';
  loadMessages();
});
