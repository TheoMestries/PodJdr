const params = new URLSearchParams(window.location.search);
const username = params.get('username');

if (username) {
  document.getElementById('user-name').textContent = username;
}
