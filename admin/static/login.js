(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var errorBox = document.getElementById('login-error');
  var submit = document.getElementById('login-submit');
  var password = document.getElementById('password');
  var toggle = document.getElementById('toggle-password');

  toggle.addEventListener('click', function () {
    var show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    var username = form.username.value.trim();
    if (!username || !password.value) { showError('Enter your username and password.'); return; }

    submit.disabled = true;
    submit.textContent = 'Signing in…';
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: username, password: password.value })
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (r.ok) { window.location.replace('/admin'); return; }
        showError(r.body.error || 'Sign in failed.');
        password.value = '';
        password.focus();
      })
      .catch(function () { showError('Could not reach the server. Check your connection and try again.'); })
      .then(function () { submit.disabled = false; submit.textContent = 'Sign in'; });
  });
})();
