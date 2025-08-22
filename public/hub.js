const params = new URLSearchParams(window.location.search);
const username = params.get('username');
const userId = params.get('userId');

if (username) {
  document.getElementById('user-name').textContent = username;
}

async function loadContacts() {
  if (!userId) return;
  const res = await fetch(`/contacts?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return;
  const contacts = await res.json();
  const list = document.getElementById('contact-list');
  list.innerHTML = '';
  contacts.forEach(({ username }) => {
    const li = document.createElement('li');
    li.textContent = username;
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
