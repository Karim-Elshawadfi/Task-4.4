// Tests for the browser page at /offerings.html (public/offerings.js) in jsdom.
// node --test tests/offerings.page.test.js
//
// These exist because the API tests passed while the page itself was broken: it offered
// Administrator-only buttons to a Coordinator and then hid the refusal in a banner that was
// scrolled out of view. Every case below is one of those real faults, so a regression fails
// here instead of in front of a user.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', 'public');
const HTML = fs.readFileSync(path.join(ROOT, 'offerings.html'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'offerings.js'), 'utf8');

const TERM = { _id: 'term-1', name: 'Winter 2026/2027', academic_year: '2026/2027', season: 'WINTER' };
const slot = (over = {}) => ({
  _id: 'slot-1', type: 'LECTURE', group_number: '1', day: 'MONDAY',
  start_time: '10:00', end_time: '11:30', room: 'H1',
  max_capacity: 60, assigned_count: 10, remaining_capacity: 50, ...over,
});
const OFFERING = {
  _id: 'off-1', course_code: 'CSEN 301', course_name: 'Data Structures', season: 'WINTER',
  academic_year: '2026/2027', instructors: ['Dr. Amr Hassan'], is_published: true,
  eligible_groups: [{ major: 'CS', semester: 3 }], groups: [slot()],
  total_capacity: 60, total_assigned: 10,
};

/**
 * Boots the page in jsdom with a stubbed API.
 * @param {object|null} user  the signed-in user, or null for a signed-out session
 * @param {object} overrides  extra route handlers, keyed by "METHOD /path"
 */
async function loadPage(user, overrides = {}) {
  const calls = [];
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'http://localhost:5050/offerings.html' });
  const { window } = dom;

  window.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const key = `${method} ${url.replace(/\?.*$/, '')}`;
    calls.push({ method, url, body: options.body ? JSON.parse(options.body) : undefined });

    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (key in overrides) return reply(...overrides[key]);
    if (key === 'GET /api/auth/me') {
      return user ? reply(200, { user }) : reply(401, { message: 'Please log in.' });
    }
    // Every other route is behind Person 1's `protect`, so a signed-out page gets 401 from
    // all of them, exactly as the real server answers.
    if (!user) return reply(401, { message: 'Please log in.' });
    if (key === 'GET /api/terms/current') return reply(200, { term: TERM });
    if (key === 'GET /api/offerings/options') {
      return reply(200, { terms: [TERM], courses: [], days: [], groupTypes: [], gucSlots: [], majors: ['CS', 'DMET'], rooms: [] });
    }
    if (key === 'GET /api/offerings') return reply(200, { offerings: [OFFERING], total: 1, published: 1 });
    if (key === 'GET /api/templates/options') return reply(200, { terms: [TERM], majors: ['CS', 'DMET'], offerings: [] });
    if (key === 'GET /api/templates') return reply(200, { templates: [], total: 0 });
    return reply(404, { message: `unstubbed ${key}` });
  };
  window.confirm = () => true;

  window.eval(SCRIPT);
  // Let the start-up chain (session -> current term -> options -> offerings) settle.
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 0));

  const $ = (id) => window.document.getElementById(id);
  return { window, document: window.document, $, calls };
}

const ADMIN = { full_name: 'Ahmed Saeed', role: 'ADMIN' };
const COORDINATOR = { full_name: 'Rania Lotfy', role: 'COORDINATOR' };

// ---------------------------------------------------------------- the session header

test('signed in: the header names you and offers to sign out, not to sign in again', async () => {
  const { $ } = await loadPage(ADMIN);
  assert.match($('who').textContent, /Ahmed Saeed/);
  assert.match($('who').textContent, /ADMIN/);
  assert.equal($('session-action').hidden, false);
  assert.equal($('session-action').textContent, 'Sign out');
});

test('signed out: the header offers the sign-in page', async () => {
  const { $ } = await loadPage(null);
  assert.match($('who').textContent, /not signed in/i);
  assert.equal($('session-action').textContent, 'Go to sign in');
});

test('signed out: the page says to sign in instead of showing an empty table', async () => {
  const { $ } = await loadPage(null);
  assert.match($('o-details').textContent, /sign in/i);
  assert.equal($('o-rows').children.length, 0, 'no rows are left looking like an empty term');
});

// ---------------------------------------------------------------- Req 22-27 are the administrator's

test('an administrator gets the publish, create and edit controls', async () => {
  const { $, document } = await loadPage(ADMIN);
  assert.equal($('o-new').hidden, false);
  assert.equal($('o-publish-all').hidden, false);
  assert.equal($('o-unpublish-all').hidden, false);
  const rowButtons = [...document.querySelectorAll('#o-rows button')].map((b) => b.textContent);
  assert.deepEqual(rowButtons, ['Unpublish'], 'the published offering can be unpublished');
  assert.equal($('o-role-note').textContent, '', 'nothing to apologise for');
});

test('a coordinator gets no offering controls at all, and is told why', async () => {
  const { $, document } = await loadPage(COORDINATOR);
  assert.equal($('o-new').hidden, true);
  assert.equal($('o-publish-all').hidden, true);
  assert.equal($('o-unpublish-all').hidden, true);
  assert.equal(document.querySelectorAll('#o-rows button').length, 0,
    'a coordinator is never offered a button the API will answer 403 to');
  assert.match($('o-role-note').textContent, /read-only/i);
  assert.match($('o-role-note').textContent, /administrator/i);
});

test('a coordinator still sees the offerings themselves', async () => {
  const { document } = await loadPage(COORDINATOR);
  assert.match(document.getElementById('o-rows').textContent, /CSEN 301/,
    'read-only is not the same as blank');
});

// ---------------------------------------------------------------- Req 28-30 are the coordinator's

test('the standard schedules tab is the coordinator\'s, and read-only for an administrator', async () => {
  const asCoordinator = await loadPage(COORDINATOR);
  assert.equal(asCoordinator.$('t-new').hidden, false);
  assert.equal(asCoordinator.$('t-role-note').textContent, '');

  const asAdmin = await loadPage(ADMIN);
  assert.equal(asAdmin.$('t-new').hidden, true);
  assert.match(asAdmin.$('t-role-note').textContent, /coordinator/i);
});

// ---------------------------------------------------------------- feedback must be seen

test('a refusal from the API is shown, and an error stays until it is dismissed', async () => {
  const { $, document, window } = await loadPage(ADMIN, {
    'PUT /api/offerings/off-1/publication': [409, { message: 'CSEN 301 cannot be unpublished: 2 student(s) already have a processed schedule that uses it' }],
  });

  document.querySelector('#o-rows button').click();
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 0));

  assert.match($('flash').textContent, /cannot be unpublished/);
  assert.match($('flash').textContent, /2 student/);
  assert.ok($('flash').querySelector('.error'), 'shown as an error, not a success');
  assert.equal($('flash').querySelector('[role="alert"]') !== null, true, 'announced to a screen reader');

  // It must not quietly disappear before it has been read.
  await new Promise((r) => setTimeout(r, 50));
  assert.match($('flash').textContent, /cannot be unpublished/);

  $('flash').querySelector('.flash-x').click();
  assert.equal($('flash').textContent, '', 'and it can be dismissed');
  void window;
});

test('a successful publish reports what happened', async () => {
  const { $, document } = await loadPage(ADMIN, {
    'PUT /api/offerings/off-1/publication': [200, { message: 'CSEN 301 is now unpublished and will not appear in new schedules', offering: { ...OFFERING, is_published: false } }],
  });
  document.querySelector('#o-rows button').click();
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 0));
  assert.match($('flash').textContent, /now unpublished/);
  assert.ok($('flash').querySelector('.success'));
});

test('the publish button sends the opposite of the current state', async () => {
  const { document, calls } = await loadPage(ADMIN, {
    'PUT /api/offerings/off-1/publication': [200, { message: 'done', offering: OFFERING }],
  });
  document.querySelector('#o-rows button').click();
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 0));
  const sent = calls.find((c) => c.method === 'PUT' && c.url.includes('/publication'));
  assert.deepEqual(sent.body, { published: false }, 'a published offering is asked to unpublish');
});

// ---------------------------------------------------------------- what the page renders

test('the summary cards count the term', async () => {
  const { $ } = await loadPage(ADMIN);
  const text = $('o-stats').textContent;
  assert.match(text, /Offerings/);
  assert.match(text, /Published/);
  assert.match(text, /10\/60/, 'seats taken across the term');
});

test('the course code carries its own stable colour everywhere', async () => {
  const first = await loadPage(ADMIN);
  const second = await loadPage(ADMIN);
  const colourOf = (page) => page.document.querySelector('#o-rows .code').style.getPropertyValue('--c');
  assert.ok(colourOf(first), 'a colour is set from the course code');
  assert.equal(colourOf(first), colourOf(second), 'the same course is the same colour every time');
});

test('the page never shows requirement numbers to the user', async () => {
  const { document } = await loadPage(ADMIN);
  assert.doesNotMatch(document.body.textContent, /Req(uirement)?s? \d/i,
    'assignment jargon belongs in the integration notes, not in the product');
});
