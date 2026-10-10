'use strict';
const $ = id => document.getElementById(id);
const views = ['login', 'forgot', 'reset', 'account'];

function show(view) {
  for (const name of views) $(`${name}-view`).hidden = name !== view;
  $('message').hidden = true;
  const target = $(`${view}-view`).querySelector('input,button');
  target?.focus();
}

function message(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
  $('message').hidden = false;
  $('message').focus();
}

async function api(endpoint, payload) {
  const response = await fetch(`/api/auth/${endpoint}`, {
    method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Please try again.');
  return data;
}

function account(user) {
  $('welcome-name').textContent = `Welcome, ${user.full_name}.`;
  $('account-email').textContent = user.guc_email;
  $('account-role').textContent = { STUDENT: 'Student', ADVISOR: 'Advisor', COORDINATOR: 'Coordinator', ADMIN: 'Administrator' }[user.role] || user.role;
  show('account');
}

function submit(formId, action) {
  $(formId).addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    $('message').hidden = true;
    try { await action(Object.fromEntries(new FormData(event.currentTarget))); }
    catch (error) { message(error instanceof TypeError ? 'Could not connect. Please try again.' : error.message, true); }
    finally { button.disabled = false; }
  });
}

submit('login-form', async data => {
  const result = await api('login', data);
  $('login-form').reset();
  account(result.user); // The browser uses the HttpOnly cookie; no token is stored in localStorage.
});
submit('forgot-form', async data => {
  const result = await api('forgot-password', data);
  $('verify-email').value = data.email;
  show('reset');
  message(result.message);
});
submit('reset-form', async data => {
  if (data.newPassword !== $('confirm-password').value) throw new Error('The passwords do not match.');
  const result = await api('reset-password', data);
  $('reset-form').reset();
  $('email').value = data.email;
  show('login');
  message(result.message);
});
$('forgot-link').addEventListener('click', () => { $('reset-email').value = $('email').value; show('forgot'); });
$('have-code').addEventListener('click', () => { $('verify-email').value = $('reset-email').value; show('reset'); });
document.querySelectorAll('.back-login').forEach(button => button.addEventListener('click', () => show('login')));
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try {
    await api('logout', {});
    $('account-email').textContent = '';
    $('account-role').textContent = '';
    show('login'); message('You have been logged out.');
  } catch (error) { message(error.message, true); }
  finally { $('logout').disabled = false; }
});
api('me').then(data => account(data.user)).catch(() => show('login'));
