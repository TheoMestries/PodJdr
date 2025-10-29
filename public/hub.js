let username = '';
let userId = null;
let isPnj = false;

let currentContactId = null;
let chatInterval = null;
let currentContactIsPnj = false;
let announcementQueue = [];
let announcementPollingInterval = null;
let announcementAckInFlight = false;

const announcementOverlay = document.getElementById('announcement-overlay');
const announcementMessageEl = document.getElementById('announcement-message');
const announcementSignatureEl = document.getElementById('announcement-signature');
const announcementCloseBtn = document.getElementById('announcement-close-btn');
let activeAnnouncement = null;

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/';
});

document.getElementById('dice-btn').addEventListener('click', () => {
  window.location.href = 'dice.html';
});

const exitBtn = document.getElementById('exit-pnj-btn');
if (exitBtn) {
  exitBtn.addEventListener('click', async () => {
    await fetch('/admin/stop-impersonating', { method: 'POST' });
    window.location.href = '/admin.html';
  });
}

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const mobileQuery = window.matchMedia('(max-width: 900px)');
const topBar = document.querySelector('.top-bar');

function updateTopBarHeight() {
  if (!topBar) return;
  document.documentElement.style.setProperty('--top-bar-height', `${topBar.offsetHeight}px`);
}

updateTopBarHeight();
window.addEventListener('resize', updateTopBarHeight);

function setSidebarState(open) {
  if (!sidebar) return;
  const isMobile = mobileQuery.matches;
  sidebar.classList.toggle('open', open && isMobile);
  if (sidebarBackdrop) {
    const showBackdrop = open && isMobile;
    sidebarBackdrop.classList.toggle('hidden', !showBackdrop);
    sidebarBackdrop.setAttribute('aria-hidden', showBackdrop ? 'false' : 'true');
  }
  if (sidebarToggle) {
    sidebarToggle.setAttribute('aria-expanded', open && isMobile ? 'true' : 'false');
  }
  if (isMobile) {
    document.body.classList.toggle('sidebar-open', open);
  } else {
    document.body.classList.remove('sidebar-open');
  }
  updateTopBarHeight();
}

function closeSidebar() {
  setSidebarState(false);
}

function toggleSidebar() {
  if (!sidebar) return;
  const shouldOpen = !sidebar.classList.contains('open');
  setSidebarState(shouldOpen);
}

if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', toggleSidebar);
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeSidebar);
}

const handleMobileChange = (event) => {
  if (!event.matches) {
    closeSidebar();
  }
  updateTopBarHeight();
};

if (mobileQuery.addEventListener) {
  mobileQuery.addEventListener('change', handleMobileChange);
} else if (mobileQuery.addListener) {
  mobileQuery.addListener(handleMobileChange);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeSidebar();
  }
});

closeSidebar();

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
  if (data.isImpersonating && exitBtn) {
    exitBtn.classList.remove('hidden');
  }
  document.getElementById('user-name').textContent = username;
  loadContacts();
  loadRequests();
  loadPending();
  if (data.userId) {
    startAnnouncementPolling();
  }
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
  closeSidebar();
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

if (announcementCloseBtn) {
  announcementCloseBtn.addEventListener('click', acknowledgeCurrentAnnouncement);
}

function startAnnouncementPolling() {
  if (!announcementOverlay) return;
  fetchAnnouncements();
  if (announcementPollingInterval) {
    clearInterval(announcementPollingInterval);
  }
  announcementPollingInterval = setInterval(fetchAnnouncements, 5000);
}

async function fetchAnnouncements() {
  if (!announcementOverlay) return;
  try {
    const res = await fetch('/announcements/unread');
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    const knownIds = new Set(
      [activeAnnouncement, ...announcementQueue]
        .filter(Boolean)
        .map((announcement) => announcement.id)
    );

    data.forEach((announcement) => {
      if (
        !knownIds.has(announcement.id) &&
        typeof announcement.message === 'string' &&
        announcement.message.trim().length
      ) {
        announcementQueue.push({
          ...announcement,
          message: announcement.message.trim(),
          signature:
            typeof announcement.signature === 'string'
              ? announcement.signature.trim()
              : '',
        });
        knownIds.add(announcement.id);
      }
    });

    if (!activeAnnouncement) {
      showNextAnnouncement();
    }
  } catch (err) {
    console.error('Erreur lors du chargement des annonces', err);
  }
}

function showNextAnnouncement() {
  if (activeAnnouncement || !announcementQueue.length || !announcementOverlay) {
    return;
  }
  const nextAnnouncement = announcementQueue.shift();
  if (!nextAnnouncement) return;
  activeAnnouncement = nextAnnouncement;
  displayAnnouncement(nextAnnouncement);
}

function adjustAnnouncementLayout(messageLength) {
  if (!announcementMessageEl) return;
  announcementMessageEl.style.fontSize = '';
  announcementMessageEl.classList.remove(
    'announcement-message--long',
    'announcement-message--very-long',
    'announcement-message--extreme'
  );

  if (messageLength > 1400) {
    announcementMessageEl.classList.add('announcement-message--extreme');
  } else if (messageLength > 900) {
    announcementMessageEl.classList.add('announcement-message--very-long');
  } else if (messageLength > 500) {
    announcementMessageEl.classList.add('announcement-message--long');
  }
}

function displayAnnouncement(announcement) {
  if (!announcementOverlay || !announcementMessageEl || !announcementCloseBtn) {
    return;
  }
  const message = (announcement.message || '').trim();
  if (!message) {
    hideAnnouncementOverlay();
    activeAnnouncement = null;
    showNextAnnouncement();
    return;
  }

  announcementMessageEl.textContent = message;
  adjustAnnouncementLayout(message.length);

  if (announcementSignatureEl) {
    const signatureText = (announcement.signature || '').trim();
    if (signatureText) {
      announcementSignatureEl.textContent = `— ${signatureText}`;
      announcementSignatureEl.classList.remove('hidden');
    } else {
      announcementSignatureEl.textContent = '';
      announcementSignatureEl.classList.add('hidden');
    }
  }
  announcementOverlay.classList.remove('hidden');
  announcementCloseBtn.disabled = false;
  if (typeof announcementCloseBtn.focus === 'function') {
    try {
      announcementCloseBtn.focus({ preventScroll: true });
    } catch (err) {
      announcementCloseBtn.focus();
    }
  }
}

async function acknowledgeCurrentAnnouncement() {
  if (announcementAckInFlight) {
    return;
  }

  const announcementToAcknowledge = activeAnnouncement;
  if (!announcementToAcknowledge) {
    hideAnnouncementOverlay();
    return;
  }

  announcementAckInFlight = true;
  if (announcementCloseBtn) {
    announcementCloseBtn.disabled = true;
  }

  hideAnnouncementOverlay();
  activeAnnouncement = null;
  showNextAnnouncement();

  try {
    const res = await fetch(`/announcements/${announcementToAcknowledge.id}/read`, {
      method: 'POST',
    });
    if (!res.ok && res.status !== 404) {
      throw new Error('Réponse serveur invalide');
    }
  } catch (err) {
    console.error('Erreur lors de la confirmation de l\'annonce', err);
    announcementQueue.unshift(announcementToAcknowledge);
    if (!activeAnnouncement) {
      showNextAnnouncement();
    }
  } finally {
    announcementAckInFlight = false;
    if (announcementCloseBtn) {
      announcementCloseBtn.disabled = false;
    }
  }
}

function hideAnnouncementOverlay() {
  if (!announcementOverlay) return;
  announcementOverlay.classList.add('hidden');
  if (announcementMessageEl) {
    announcementMessageEl.textContent = '';
    announcementMessageEl.classList.remove(
      'announcement-message--long',
      'announcement-message--very-long',
      'announcement-message--extreme'
    );
  }
  if (announcementSignatureEl) {
    announcementSignatureEl.textContent = '';
    announcementSignatureEl.classList.add('hidden');
  }
}

window.addEventListener('beforeunload', () => {
  if (announcementPollingInterval) {
    clearInterval(announcementPollingInterval);
  }
});
