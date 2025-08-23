const errorBox = document.getElementById('error-box');

function showMessage(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function hideMessage() {
  errorBox.classList.add('hidden');
}

document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const res = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  showMessage(data.message || data.error);
});
