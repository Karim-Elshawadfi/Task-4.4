// Browser page for Req 22-23, 25-30, served from /offerings.html.
// It calls the same API as the React components in components/Offerings/ and relies on the
// HttpOnly login cookie from Req 1, so it needs no build step and no token handling.
'use strict';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'];
const DAY_LABEL = { SATURDAY: 'Saturday', SUNDAY: 'Sunday', MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday' };
const TYPES = { LECTURE: 'Lecture', TUTORIAL: 'Tutorial', LAB: 'Lab' };
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** "HH:MM" -> minutes after midnight, or null. */
const toMinutes = (time) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// One stable colour per course code, so a course reads the same in the table, the picker and
// the weekly grid. The hue comes from the code itself, so it never shifts between pages.
// Every pair is kept dark-on-light for AA contrast.
const COURSE_COLOURS = [
  ['#4338ca', '#eef2ff', '#3730a3'], ['#0f766e', '#f0fdfa', '#115e59'],
  ['#b45309', '#fffbeb', '#92400e'], ['#be123c', '#fff1f2', '#9f1239'],
  ['#7e22ce', '#faf5ff', '#6b21a8'], ['#1d4ed8', '#eff6ff', '#1e40af'],
  ['#15803d', '#f0fdf4', '#166534'], ['#c2410c', '#fff7ed', '#9a3412'],
  ['#0369a1', '#f0f9ff', '#075985'], ['#4d7c0f', '#f7fee7', '#3f6212'],
];
function colourOf(code) {
  let hash = 0;
  for (const ch of String(code ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_COLOURS[hash % COURSE_COLOURS.length];
}
/** Paints an element with its course's colour through the --c custom properties. */
function paint(node, code) {
  const [line, wash, ink] = colourOf(code);
  node.style.setProperty('--c', line);
  node.style.setProperty('--c-wash', wash);
  node.style.setProperty('--c-ink', ink);
  return node;
}

/** The course code with its colour stripe. */
function codeTag(code) {
  const span = el('span', 'code mono', code);
  return paint(span, code);
}

/** Seats as a bar plus the numbers: how full a group is reads faster than two figures. */
function seats(taken, total) {
  const ratio = total ? taken / total : 0;
  const box = el('div', 'seats');
  const bar = el('div', 'seats-bar');
  const fill = el('div', `seats-fill${ratio >= 1 ? ' red' : ratio >= 0.9 ? ' amber' : ''}`);
  fill.style.width = `${Math.min(ratio * 100, 100)}%`;
  bar.appendChild(fill);
  box.appendChild(bar);
  box.appendChild(el('span', 'seats-n', `${taken}/${total}`));
  return box;
}

async function call(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const error = new Error(data.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.errors = data.errors || {};
    throw error;
  }
  return data;
}

let flashTimer;
function flash(text, kind = 'success') {
  const box = $('flash');
  box.innerHTML = '';
  clearTimeout(flashTimer);
  if (!text) return;
  const note = el('div', kind);
  note.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  note.appendChild(el('span', null, text));
  const close = el('button', 'flash-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.onclick = () => { box.innerHTML = ''; };
  note.appendChild(close);
  box.appendChild(note);
  // An error stays until it is read; a confirmation can fade.
  if (kind !== 'error') flashTimer = setTimeout(() => { box.innerHTML = ''; }, 6000);
}
const fail = (err) => {
  const extra = Array.isArray(err.errors?.clashes) && err.errors.clashes.length > 1 ? ` (${err.errors.clashes.length} clashes)` : '';
  const fields = Object.entries(err.errors || {})
    .filter(([k, v]) => k !== 'clashes' && typeof v === 'string')
    .map(([, v]) => v);
  flash(`${err.message}${extra}${fields.length ? ` — ${fields.join('; ')}` : ''}`, 'error');
};

const state = { role: null, user: null, termId: '', options: null, offerings: [], selected: null, slots: [], eligible: [], editing: null,
  tOptions: null, templates: [], tSelected: null, picked: new Map(), tEditing: null };

// ---------------------------------------------------------------- tabs and session

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    $('tab-offerings').hidden = tab.dataset.tab !== 'offerings';
    $('tab-templates').hidden = tab.dataset.tab !== 'templates';
    flash('');
    if (tab.dataset.tab === 'templates' && !state.tOptions) loadTemplateOptions();
  });
});

// The header says who you are and offers the one action that makes sense: sign out when you
// are signed in, sign in when you are not. Showing "Sign in" to someone already signed in
// only invites a pointless round trip through the login page.
/** Req 22-27 are the Administrator's; Req 28-30 are the Coordinator's. The server enforces
    this, and the page hides what the signed-in role cannot use so nothing looks broken. */
const canEditOfferings = () => state.role === 'ADMIN';
const canEditTemplates = () => state.role === 'COORDINATOR';

function showSession(user) {
  state.user = user;
  state.role = user ? user.role : null;
  const action = $('session-action');
  action.hidden = false;
  if (user) {
    $('who').textContent = `${user.full_name} · ${user.role}`;
    action.textContent = 'Sign out';
    action.onclick = async () => {
      action.disabled = true;
      try { await call('POST', '/auth/logout', {}); } catch { /* the cookie may already be gone */ }
      window.location.href = '/';
    };
  } else {
    $('who').textContent = 'You are not signed in.';
    action.textContent = 'Go to sign in';
    action.onclick = () => { window.location.href = '/'; };
  }
}

/** Hides the controls this role may not use and explains the page is read-only for them. */
function applyRole() {
  const offeringsOwner = canEditOfferings();
  const templatesOwner = canEditTemplates();
  for (const id of ['o-new', 'o-publish-all', 'o-unpublish-all']) $(id).hidden = !offeringsOwner;
  $('t-new').hidden = !templatesOwner;

  const note = (boxId, owner, who, what) => {
    const box = $(boxId);
    box.innerHTML = '';
    if (owner || !state.role) return;
    box.appendChild(el('div', 'muted small',
      `You are signed in as ${state.role.toLowerCase()}. ${what} is the ${who}'s job, so this tab is read-only for you.`));
  };
  note('o-role-note', offeringsOwner, 'administrator', 'Creating, changing and publishing course offerings');
  note('t-role-note', templatesOwner, 'coordinator', 'Building standard schedules and assigning students');

  // Being signed out is known from the session itself, so say so straight away rather than
  // waiting for a request to come back 401 and inferring it from the failure.
  if (!state.role) showSignedOut();
}

/** Replaces the page body with a plain explanation when there is no session. */
function showSignedOut() {
  $('o-rows').innerHTML = '';
  $('o-stats').innerHTML = '';
  $('t-rows').innerHTML = '';
  $('o-details').innerHTML = '';
  const box = el('div', 'card state');
  box.appendChild(el('div', 'strong', 'Please sign in to see the course offerings'));
  box.appendChild(el('p', 'muted small', 'This page uses your GUC login. Sign in, then come back to this page.'));
  const go = el('button', 'btn', 'Go to sign in');
  go.type = 'button';
  go.onclick = () => { window.location.href = '/'; };
  box.appendChild(go);
  $('o-details').appendChild(box);
}

const session = call('GET', '/auth/me')
  .then((d) => showSession(d.user))
  .catch(() => showSession(null));

// ---------------------------------------------------------------- Req 22-27

function fillSelect(select, values, labelOf, valueOf, keepAll) {
  const current = select.value;
  select.innerHTML = '';
  if (keepAll) select.appendChild(new Option('All', ''));
  values.forEach((v) => select.appendChild(new Option(labelOf(v), valueOf(v))));
  select.value = current && [...select.options].some((o) => o.value === current) ? current : select.options[0]?.value ?? '';
}

/** Both tabs work on the same academic term, so changing it on one changes it on the other. */
function useTerm(termId) {
  state.termId = termId;
  for (const id of ['o-term', 't-term']) {
    if ([...$(id).options].some((o) => o.value === termId)) $(id).value = termId;
  }
}

async function loadOptions() {
  const termId = state.termId || $('o-term').value;
  state.options = await call('GET', `/offerings/options${termId ? `?term_id=${termId}` : ''}`);
  fillSelect($('o-term'), state.options.terms, (t) => t.name, (t) => t._id);
  useTerm(state.termId || $('o-term').value);
  fillSelect($('o-major'), state.options.majors, (m) => m, (m) => m, true);
  fillSelect($('o-semester'), SEMESTERS, (s) => s, (s) => s, true);
  fillSelect($('t-major'), state.options.majors, (m) => m, (m) => m, true);
  fillSelect($('t-semester'), SEMESTERS, (s) => s, (s) => s, true);
}

async function loadOfferings() {
  const query = new URLSearchParams({ term_id: $('o-term').value });
  for (const [key, id] of [['search', 'o-search'], ['major', 'o-major'], ['semester', 'o-semester'], ['published', 'o-published']]) {
    if ($(id).value) query.set(key, $(id).value);
  }
  const data = await call('GET', `/offerings?${query}`);
  state.offerings = data.offerings;
  $('o-count').textContent = `${data.total} offering(s), ${data.published} published`;
  drawStats(data.offerings);

  const body = $('o-rows');
  body.innerHTML = '';
  for (const offering of data.offerings) {
    const row = el('tr');
    row.onclick = () => openOffering(offering._id);
    row.appendChild(cell([codeTag(offering.course_code), el('div', 'muted small', offering.course_name)]));
    row.appendChild(cell(offering.instructors.join(', ') || '—', 'small'));
    row.appendChild(cell(offering.eligible_groups.map((g) => pill(`${g.major} ${g.semester}`, 'grey'))));
    row.appendChild(cell(['LECTURE', 'TUTORIAL', 'LAB']
      .map((t) => [t, offering.groups.filter((g) => g.type === t).length])
      .filter(([, n]) => n)
      .map(([t, n]) => pill(`${n} ${TYPES[t].toLowerCase()}`, 'blue'))));
    row.appendChild(cell([seats(offering.total_assigned, offering.total_capacity)]));
    row.appendChild(cell([pill(offering.is_published ? 'Published' : 'Draft', offering.is_published ? 'green' : 'grey')]));
    const action = el('td');
    if (canEditOfferings()) {
      action.appendChild(button(offering.is_published ? 'Unpublish' : 'Publish', 'btn ghost small', async (e) => {
        e.stopPropagation();
        await run(() => call('PUT', `/offerings/${offering._id}/publication`, { published: !offering.is_published }));
      }));
    }
    row.appendChild(action);
    body.appendChild(row);
  }
  if (!data.offerings.length) body.appendChild(emptyRow(7, 'No offering matches these filters.'));
}

/** The four numbers that say how ready a term is, at the top of the offerings tab. */
function drawStats(offerings) {
  const box = $('o-stats');
  box.innerHTML = '';
  const slots = offerings.flatMap((o) => o.groups);
  const taken = slots.reduce((n, g) => n + g.assigned_count, 0);
  const total = slots.reduce((n, g) => n + g.max_capacity, 0);
  const figures = [
    [offerings.length, 'Offerings'],
    [`${offerings.filter((o) => o.is_published).length}/${offerings.length || 0}`, 'Published'],
    [slots.length, 'Lecture, tutorial & lab slots'],
    [`${taken}/${total}`, `Seats taken (${total ? Math.round((taken / total) * 100) : 0}%)`],
  ];
  for (const [n, label] of figures) {
    const card = el('div', 'stat');
    card.appendChild(el('div', 'stat-n', String(n)));
    card.appendChild(el('div', 'stat-l', label));
    box.appendChild(card);
  }
}

const pill = (text, tone) => el('span', `pill ${tone}`, text);
const cell = (content, className) => {
  const td = el('td', className);
  if (typeof content === 'string') td.textContent = content;
  else [].concat(content).forEach((n) => td.appendChild(n));
  return td;
};
const button = (text, className, onClick, disabled) => {
  const b = el('button', className, text);
  b.type = 'button';
  b.disabled = Boolean(disabled);
  b.onclick = onClick;
  return b;
};
const emptyRow = (span, text) => {
  const tr = el('tr');
  const td = cell(text, 'state');
  td.colSpan = span;
  tr.appendChild(td);
  return tr;
};

async function run(action, after) {
  try {
    const data = await action();
    flash(data.message || 'Done');
    await loadOptions();
    await loadOfferings();
    if (state.selected) await openOffering(state.selected._id, true);
    if (after) await after(data);
  } catch (err) { fail(err); }
}

async function openOffering(id, quiet) {
  let data;
  try { data = await call('GET', `/offerings/${id}`); } catch (err) { return fail(err); }
  state.selected = data.offering;
  const box = $('o-details');
  box.innerHTML = '';
  const card = el('div', 'card');

  const head = el('div', 'bar');
  head.appendChild(el('h3', 'grow', `${data.offering.course_code} — ${data.offering.course_name}`));
  if (canEditOfferings()) {
  head.appendChild(button('Edit', 'btn ghost small', () => startOfferingForm(data.offering)));
  head.appendChild(button('Delete offering', 'btn danger small', async () => {
    if (!confirm(`Delete the ${data.offering.course_code} offering?`)) return;
    try {
      const r = await call('DELETE', `/offerings/${data.offering._id}`);
      flash(r.message);
      state.selected = null;
      $('o-details').innerHTML = '';
      await loadOptions(); await loadOfferings();
    } catch (err) { fail(err); }
  }));
  }
  head.appendChild(button('Close', 'btn ghost small', () => { state.selected = null; box.innerHTML = ''; }));
  card.appendChild(head);

  card.appendChild(el('p', 'muted small',
    `${data.offering.season} ${data.offering.academic_year} · ${data.offering.instructors.join(', ') || 'no instructor yet'}` +
    ` · ${data.offering.total_assigned}/${data.offering.total_capacity} seats taken` +
    (data.usedBy.templates.length
      ? ` · used by ${data.usedBy.templates.map((t) => `${t.major} sem ${t.semester} group ${t.study_group}`).join(', ')}`
      : '')));

  const table = el('table', 'table');
  table.innerHTML = '<thead><tr><th>Type</th><th>Group</th><th>Day</th><th>Time</th><th>Room</th><th>Seats</th><th>Remaining</th><th></th></tr></thead>';
  const tbody = el('tbody');
  for (const slot of data.offering.groups) {
    const row = el('tr');
    row.appendChild(cell([pill(TYPES[slot.type], 'blue')]));
    row.appendChild(cell(slot.group_number, 'strong'));
    row.appendChild(cell(DAY_LABEL[slot.day]));
    row.appendChild(cell(`${slot.start_time}-${slot.end_time}`, 'mono'));
    row.appendChild(cell(slot.room, 'mono'));
    row.appendChild(cell([seats(slot.assigned_count, slot.max_capacity)]));
    row.appendChild(cell([pill(`${slot.remaining_capacity} left`, slot.remaining_capacity ? 'green' : 'red')]));
    row.appendChild(cell(canEditOfferings() ? [button('Delete', 'btn danger small', async () => {
      if (!confirm(`Delete ${TYPES[slot.type]} ${slot.group_number}?`)) return;
      await run(() => call('DELETE', `/offerings/${data.offering._id}/slots/${slot._id}`));
    }, slot.assigned_count > 0)] : []));
    tbody.appendChild(row);
  }
  if (!data.offering.groups.length) tbody.appendChild(emptyRow(8, 'This offering has no groups yet.'));
  table.appendChild(tbody);
  card.appendChild(table);
  card.appendChild(week(
    data.offering.groups.map((g) => ({ ...g, course_code: data.offering.course_code })),
    { labelBy: 'group', offLabel: '', emptyText: 'This offering has no groups yet' }
  ));
  box.appendChild(card);
  if (!quiet) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * The weekly timetable, drawn the way the good scheduling tools draw it: a real time axis down
 * the side, one column per teaching day, and each class a block positioned and sized by its
 * actual start and end. The shape of the week is readable before any label is.
 * Classes that overlap (two tutorial groups at once) are laid out side by side.
 */
function week(slots, options = {}) {
  // `labelBy: 'group'` is for one course's own week, where every block is the same course and
  // the group number is the useful headline. `offLabel` is '' there too: a course simply does
  // not meet that day, which is not the same as a study group's day off.
  const { ghosts = [], emptyText = 'Nothing scheduled yet', labelBy = 'course', offLabel = 'day off' } = options;
  const all = [...slots, ...ghosts];
  const wrap = el('div', 'tt-wrap');
  const grid = el('div', 'tt');

  // The grid spans whole hours around whatever is scheduled, with a sensible default.
  const starts = all.map((s) => toMinutes(s.start_time)).filter((n) => n != null);
  const ends = all.map((s) => toMinutes(s.end_time)).filter((n) => n != null);
  const from = Math.floor(Math.min(8 * 60, ...(starts.length ? starts : [8 * 60])) / 60) * 60;
  const to = Math.ceil(Math.max(17 * 60, ...(ends.length ? ends : [17 * 60])) / 60) * 60;
  const hours = Math.max((to - from) / 60, 1);
  const HOUR_PX = 54; // keep in step with --hour in offerings.css
  const y = (minutes) => ((minutes - from) / 60) * HOUR_PX;

  grid.appendChild(el('div', 'tt-head corner'));
  const used = new Set(slots.map((s) => s.day));
  for (const day of DAYS) {
    const head = el('div', `tt-head${used.has(day) ? '' : ' off'}`, DAY_LABEL[day].slice(0, 3));
    head.title = DAY_LABEL[day];
    grid.appendChild(head);
  }

  const gutter = el('div', 'tt-gutter');
  for (let h = 0; h < hours; h += 1) {
    const row = el('div', 'tt-hour');
    row.appendChild(el('span', null, String(Math.floor((from + h * 60) / 60)).padStart(2, '0') + ':00'));
    gutter.appendChild(row);
  }
  grid.appendChild(gutter);

  for (const day of DAYS) {
    const column = el('div', `tt-col${used.has(day) ? '' : ' off'}`);
    column.style.height = `${hours * HOUR_PX}px`;
    const ofDay = all
      .filter((s) => s.day === day)
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    if (!ofDay.length) {
      column.appendChild(el('div', 'tt-empty', used.size ? offLabel : ''));
    }
    for (const [slot, lane, lanes] of layout(ofDay)) {
      const start = toMinutes(slot.start_time);
      const end = toMinutes(slot.end_time);
      const box = el('div', `tt-ev${slot.__ghost ? ' ghost' : ''}`);
      paint(box, slot.course_code);
      box.style.top = `${y(start) + 1}px`;
      box.style.height = `${Math.max(y(end) - y(start) - 2, 20)}px`;
      box.style.left = `${(lane / lanes) * 100}%`;
      box.style.width = `calc(${100 / lanes}% - 3px)`;
      box.title = `${slot.course_code} · ${TYPES[slot.type]} ${slot.group_number}
${DAY_LABEL[day]} ${slot.start_time}-${slot.end_time} · ${slot.room}`;
      const headline = labelBy === 'group' ? `${TYPES[slot.type]} ${slot.group_number}` : slot.course_code;
      const detail = labelBy === 'group' ? slot.room : `${TYPES[slot.type]} ${slot.group_number}`;
      box.appendChild(el('b', null, headline));
      box.appendChild(el('i', null, detail));
      if (y(end) - y(start) > 44 && labelBy !== 'group') box.appendChild(el('i', null, slot.room));
      column.appendChild(box);
    }
    grid.appendChild(column);
  }

  wrap.appendChild(grid);
  if (!slots.length) {
    const note = el('div', 'state small', emptyText);
    wrap.appendChild(note);
  }
  return wrap;
}

/** Puts overlapping classes side by side: returns [slot, lane, laneCount] for each. */
function layout(ofDay) {
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const slot of cluster) {
      let lane = lanes.findIndex((end) => end <= toMinutes(slot.start_time));
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = toMinutes(slot.end_time);
      out.push([slot, lane, 0]);
    }
    const count = lanes.length;
    for (let i = out.length - cluster.length; i < out.length; i += 1) out[i][2] = count;
    cluster = [];
    clusterEnd = -1;
  };
  for (const slot of ofDay) {
    if (cluster.length && toMinutes(slot.start_time) >= clusterEnd) flush();
    cluster.push(slot);
    clusterEnd = Math.max(clusterEnd, toMinutes(slot.end_time));
  }
  if (cluster.length) flush();
  return out;
}

// ---- the offering form (Req 22 create, Req 25 update)

function startOfferingForm(offering) {
  state.editing = offering || null;
  state.slots = offering ? offering.groups.map((g) => ({ ...g })) : [];
  state.eligible = offering ? offering.eligible_groups.map((g) => ({ ...g })) : [{ major: 'CS', semester: 3 }];
  $('o-form').hidden = false;
  $('o-form-title').textContent = offering ? `Edit ${offering.course_code}` : 'New course offering';
  $('f-instructors').value = offering ? offering.instructors.join(', ') : '';

  const select = $('f-course');
  select.innerHTML = '';
  select.disabled = Boolean(offering);
  if (offering) {
    select.appendChild(new Option(`${offering.course_code} — ${offering.course_name}`, offering.course_code));
  } else {
    select.appendChild(new Option('Choose a course…', ''));
    for (const course of state.options.courses) {
      const option = new Option(`${course.course_code} — ${course.course_name}${course.already_offered ? ' (already offered)' : ''}`, course.course_code);
      option.disabled = course.already_offered;
      select.appendChild(option);
    }
  }
  drawEligible();
  drawSlots();
  $('o-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function drawEligible() {
  const box = $('f-eligible');
  box.innerHTML = '';
  for (const major of state.options.majors) {
    const row = el('div', 'chip-row');
    row.appendChild(el('span', 'strong small', major));
    for (const semester of SEMESTERS) {
      const on = state.eligible.some((g) => g.major === major && Number(g.semester) === semester);
      row.appendChild(button(String(semester), `chip${on ? ' on' : ''}`, () => {
        state.eligible = on
          ? state.eligible.filter((g) => !(g.major === major && Number(g.semester) === semester))
          : [...state.eligible, { major, semester }];
        drawEligible();
      }));
    }
    box.appendChild(row);
  }
}

function drawSlots() {
  const body = $('f-slots');
  body.innerHTML = '';
  state.slots.forEach((slot, index) => {
    const row = el('tr');
    const field = (key, type, width) => {
      const input = el('input');
      input.type = type;
      input.value = slot[key] ?? '';
      input.className = width || '';
      input.oninput = () => { state.slots[index][key] = input.value; };
      return cell([input]);
    };
    const choice = (key, values, labelOf) => {
      const select = el('select');
      values.forEach((v) => select.appendChild(new Option(labelOf(v), v)));
      select.value = slot[key];
      select.onchange = () => { state.slots[index][key] = select.value; };
      return cell([select]);
    };
    row.appendChild(choice('type', Object.keys(TYPES), (t) => TYPES[t]));
    row.appendChild(field('group_number', 'text', 'tiny'));
    row.appendChild(choice('day', DAYS, (d) => DAY_LABEL[d]));
    row.appendChild(field('start_time', 'time', 'tiny'));
    row.appendChild(field('end_time', 'time', 'tiny'));
    row.appendChild(field('room', 'text', 'tiny'));
    row.appendChild(field('max_capacity', 'number', 'tiny'));
    row.appendChild(cell(String(slot.assigned_count ?? 0), 'small muted'));
    row.appendChild(cell([button('Remove', 'btn danger small', () => {
      state.slots.splice(index, 1);
      drawSlots();
    }, Number(slot.assigned_count ?? 0) > 0)]));
    body.appendChild(row);
  });
  if (!state.slots.length) body.appendChild(emptyRow(9, 'No groups yet. Save as a draft, then add groups before publishing.'));
}

$('f-add-slot').onclick = () => {
  state.slots.push({ type: 'LECTURE', group_number: '', day: 'SATURDAY', start_time: '08:15', end_time: '09:45', room: '', max_capacity: 60, assigned_count: 0 });
  drawSlots();
};
$('f-cancel').onclick = () => { $('o-form').hidden = true; state.editing = null; };
$('o-new').onclick = () => startOfferingForm(null);

$('o-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    term_id: $('o-term').value,
    course_code: $('f-course').value,
    instructors: $('f-instructors').value.split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    eligible_groups: state.eligible,
    groups: state.slots.map((s) => ({ ...s, max_capacity: Number(s.max_capacity) })),
  };
  try {
    const data = state.editing
      ? await call('PUT', `/offerings/${state.editing._id}`, body)
      : await call('POST', '/offerings', body);
    flash(data.message);
    $('o-form').hidden = true;
    state.editing = null;
    await loadOptions();
    await loadOfferings();
    await openOffering(data.offering._id, true);
  } catch (err) { fail(err); }
};

$('o-publish-all').onclick = () => run(() => call('PUT', '/offerings/publication', { term_id: $('o-term').value, published: true }));
$('o-unpublish-all').onclick = () => run(() => call('PUT', '/offerings/publication', { term_id: $('o-term').value, published: false }));
$('o-term').onchange = async () => {
  useTerm($('o-term').value);
  state.selected = null; state.tSelected = null;
  $('o-details').innerHTML = ''; $('t-details').innerHTML = '';
  await loadOptions();
  await loadOfferings();
  if (state.tOptions) await loadTemplateOptions();
};
['o-major', 'o-semester', 'o-published'].forEach((id) => { $(id).onchange = loadOfferings; });
let searchTimer;
$('o-search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadOfferings, 250); };

// ---------------------------------------------------------------- Req 28-30

async function loadTemplateOptions() {
  const termId = state.termId || $('t-term').value;
  state.tOptions = await call('GET', `/templates/options${termId ? `?term_id=${termId}` : ''}`);
  fillSelect($('t-term'), state.tOptions.terms, (t) => t.name, (t) => t._id);
  useTerm(state.termId || $('t-term').value);
  fillSelect($('tf-major'), state.tOptions.majors, (m) => m, (m) => m);
  fillSelect($('tf-semester'), SEMESTERS, (s) => s, (s) => s);
  await loadTemplates();
}

async function loadTemplates() {
  const query = new URLSearchParams({ term_id: $('t-term').value });
  if ($('t-major').value) query.set('major', $('t-major').value);
  if ($('t-semester').value) query.set('semester', $('t-semester').value);
  const data = await call('GET', `/templates?${query}`);
  state.templates = data.templates;

  const body = $('t-rows');
  body.innerHTML = '';
  for (const template of data.templates) {
    const row = el('tr');
    row.onclick = () => openTemplate(template._id);
    row.appendChild(cell(template.label, 'strong'));
    row.appendChild(cell(template.courses.map((c) => codeTag(c.course_code))));
    row.appendChild(cell(String(template.total_slots)));
    row.appendChild(cell(String(template.students)));
    row.appendChild(cell([pill(template.is_published ? 'Published' : 'Draft', template.is_published ? 'green' : 'grey')]));
    row.appendChild(cell(canEditTemplates() ? [button(template.is_published ? 'Unpublish' : 'Publish', 'btn ghost small', async (e) => {
      e.stopPropagation();
      try {
        const r = await call('PUT', `/templates/${template._id}/publication`, { published: !template.is_published });
        flash(r.message);
        await loadTemplates();
        if (state.tSelected?._id === template._id) await openTemplate(template._id, true);
      } catch (err) { fail(err); }
    })] : []));
    body.appendChild(row);
  }
  if (!data.templates.length) body.appendChild(emptyRow(6, 'No standard schedule in this term yet.'));
}

async function openTemplate(id, quiet) {
  let data;
  try { data = await call('GET', `/templates/${id}`); } catch (err) { return fail(err); }
  state.tSelected = data.template;
  const box = $('t-details');
  box.innerHTML = '';
  const card = el('div', 'card');

  const head = el('div', 'bar');
  head.appendChild(el('h3', 'grow', data.template.label));
  if (canEditTemplates()) {
  head.appendChild(button('Edit', 'btn ghost small', () => startTemplateForm(data.template)));
  head.appendChild(button('Delete', 'btn danger small', async () => {
    if (!confirm(`Delete the standard schedule of ${data.template.label}?`)) return;
    try {
      const r = await call('DELETE', `/templates/${data.template._id}`);
      flash(r.message);
      state.tSelected = null;
      box.innerHTML = '';
      await loadTemplates();
    } catch (err) { fail(err); }
  }));
  }
  head.appendChild(button('Close', 'btn ghost small', () => { state.tSelected = null; box.innerHTML = ''; }));
  card.appendChild(head);

  card.appendChild(el('p', 'muted small',
    `${data.template.courses.length} course(s) · ${data.template.total_slots} slot(s) · ${data.template.students} student(s)`));
  for (const warning of data.template.warnings || []) card.appendChild(el('div', 'error', warning));
  card.appendChild(week(data.template.week.flatMap((d) => d.slots)));

  // Req 30: who is in the group, and who may join it.
  card.appendChild(el('h4', null, 'Students in this group'));
  if (!data.template.is_published) card.appendChild(el('p', 'muted small', 'This standard schedule is a draft. Publish it before assigning students.'));
  let candidates = [];
  try { candidates = (await call('GET', `/templates/${id}/candidates`)).candidates; } catch (err) { fail(err); }

  const chosen = new Set();
  const table = el('table', 'table');
  table.innerHTML = '<thead><tr><th></th><th>Student ID</th><th>Name</th><th>Current group</th><th></th></tr></thead>';
  const tbody = el('tbody');
  for (const c of candidates) {
    const row = el('tr');
    if (c.in_this_group) {
      row.appendChild(cell(''));
    } else {
      const box2 = el('input');
      box2.type = 'checkbox';
      box2.disabled = !data.template.is_published || !canEditTemplates();
      box2.onchange = () => { if (box2.checked) chosen.add(c.student_id); else chosen.delete(c.student_id); };
      row.appendChild(cell([box2]));
    }
    row.appendChild(cell(c.guc_student_id, 'mono'));
    row.appendChild(cell(c.full_name));
    row.appendChild(cell([c.in_this_group
      ? pill('This group', 'green')
      : c.current_group ? pill(`Group ${c.current_group}`, 'amber') : el('span', 'muted small', 'Not assigned')]));
    row.appendChild(cell(c.in_this_group && canEditTemplates()
      ? [button('Remove', 'btn danger small', async () => {
        try {
          const r = await call('DELETE', `/templates/${id}/students/${c.student_id}`);
          flash(r.message);
          await loadTemplates();
          await openTemplate(id, true);
        } catch (err) { fail(err); }
      })]
      : []));
    tbody.appendChild(row);
  }
  if (!candidates.length) tbody.appendChild(emptyRow(5, `No normal student is in ${data.template.major} semester ${data.template.semester}.`));
  table.appendChild(tbody);
  card.appendChild(table);

  const assignBar = el('div', 'bar right');
  if (canEditTemplates()) {
  assignBar.appendChild(button('Assign the ticked students to this group', 'btn', async () => {
    if (!chosen.size) return flash('Tick at least one student', 'error');
    try {
      const r = await call('POST', `/templates/${id}/students`, { student_ids: [...chosen] });
      flash(r.message + (r.skipped.length ? ` — ${r.skipped.map((s) => s.reason).join('; ')}` : ''), r.skipped.length ? 'error' : 'success');
      await loadTemplates();
      await openTemplate(id, true);
    } catch (err) { fail(err); }
  }, !data.template.is_published));
  }
  card.appendChild(assignBar);

  box.appendChild(card);
  if (!quiet) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- the standard schedule form (Req 28 create, Req 29 update)

function startTemplateForm(template) {
  state.tEditing = template || null;
  state.picked = new Map();
  for (const entry of template?.entries ?? []) state.picked.set(entry.offering_id, new Set(entry.slot_ids));
  $('t-form').hidden = false;
  $('t-form-title').textContent = template ? `Edit ${template.label}` : 'New standard schedule';
  $('tf-major').value = template?.major ?? state.tOptions.majors[0];
  $('tf-semester').value = template?.semester ?? 1;
  $('tf-group').value = template?.study_group ?? '1';
  drawPicker();
  $('t-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function drawPicker() {
  const major = $('tf-major').value;
  const semester = Number($('tf-semester').value);
  const box = $('tf-picker');
  box.innerHTML = '';
  drawPreview();
  const available = state.tOptions.offerings.filter((o) =>
    o.eligible_groups.some((g) => g.major === major && Number(g.semester) === semester));
  if (!available.length) {
    box.appendChild(el('p', 'muted small', `No published offering is open to ${major} semester ${semester}. The administrator has to publish them first.`));
    return;
  }
  for (const offering of available) {
    const slots = state.picked.get(offering._id) ?? new Set();
    const card = el('div', `pick${slots.size ? ' has' : ''}`);
    const head = el('div', 'bar head');
    head.appendChild(codeTag(offering.course_code));
    head.appendChild(el('span', 'muted small grow', offering.course_name));
    const count = pill(slots.size ? `${slots.size} chosen` : '', 'blue');
    count.hidden = !slots.size;
    head.appendChild(count);
    card.appendChild(head);
    for (const slot of offering.groups) {
      const on = slots.has(slot._id);
      const full = slot.remaining_capacity <= 0 && !on;
      const label = el('label', `check${on ? ' on' : ''}${full ? ' full' : ''}`);
      const input = el('input');
      input.type = 'checkbox';
      input.checked = on;
      // Update in place rather than rebuilding the list: the checkbox keeps focus and the
      // page does not jump, which matters when a coordinator is ticking a dozen groups.
      input.onchange = () => {
        const set = new Set(state.picked.get(offering._id) ?? []);
        if (input.checked) set.add(slot._id); else set.delete(slot._id);
        if (set.size) state.picked.set(offering._id, set); else state.picked.delete(offering._id);
        label.classList.toggle('on', input.checked);
        card.classList.toggle('has', set.size > 0);
        count.textContent = set.size ? `${set.size} chosen` : '';
        count.hidden = !set.size;
        drawPreview();
      };
      label.appendChild(input);
      label.appendChild(pill(`${TYPES[slot.type]} ${slot.group_number}`, 'blue'));
      label.appendChild(el('span', 'small', `${DAY_LABEL[slot.day]} ${slot.start_time}-${slot.end_time} · ${slot.room}`));
      label.appendChild(pill(`${slot.remaining_capacity} left`, slot.remaining_capacity ? 'green' : 'red'));
      card.appendChild(label);
    }
    box.appendChild(card);
  }
}

/** Shows the week the ticked slots make, before the coordinator saves it (Req 28/29). */
function drawPreview() {
  const box = $('tf-preview');
  box.innerHTML = '';
  const chosen = [];
  for (const [offeringId, ids] of state.picked.entries()) {
    const offering = state.tOptions.offerings.find((o) => o._id === offeringId);
    if (!offering) continue;
    for (const slot of offering.groups) {
      if (ids.has(slot._id)) chosen.push({ ...slot, course_code: offering.course_code });
    }
  }
  box.appendChild(week(chosen, { emptyText: 'Tick some groups to see the week take shape' }));

  // Warn about a clash here too, so it is not a surprise at save time.
  const clashes = [];
  for (let i = 0; i < chosen.length; i += 1) {
    for (let j = i + 1; j < chosen.length; j += 1) {
      const a = chosen[i];
      const b = chosen[j];
      if (a.day === b.day && toMinutes(a.start_time) < toMinutes(b.end_time) && toMinutes(b.start_time) < toMinutes(a.end_time)) {
        clashes.push(`${a.course_code} ${TYPES[a.type]} ${a.group_number} clashes with ${b.course_code} ${TYPES[b.type]} ${b.group_number}`);
      }
    }
  }
  if (clashes.length) {
    const warn = el('div', 'error');
    warn.appendChild(el('div', 'strong', `${clashes.length} clash(es) — this cannot be saved yet`));
    const list = el('ul');
    for (const c of clashes) list.appendChild(el('li', null, c));
    warn.appendChild(list);
    box.appendChild(warn);
  }
}

$('tf-major').onchange = drawPicker;
$('tf-semester').onchange = drawPicker;
$('tf-cancel').onclick = () => { $('t-form').hidden = true; state.tEditing = null; };
$('t-new').onclick = () => startTemplateForm(null);
$('t-term').onchange = async () => {
  useTerm($('t-term').value);
  state.selected = null; state.tSelected = null;
  $('o-details').innerHTML = ''; $('t-details').innerHTML = '';
  await loadTemplateOptions();
  await loadOptions();
  await loadOfferings();
};
$('t-major').onchange = loadTemplates;
$('t-semester').onchange = loadTemplates;

$('t-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = {
    term_id: $('t-term').value,
    major: $('tf-major').value,
    semester: Number($('tf-semester').value),
    study_group: $('tf-group').value,
    entries: [...state.picked.entries()].map(([offering_id, slots]) => ({ offering_id, slot_ids: [...slots] })),
  };
  try {
    const data = state.tEditing
      ? await call('PUT', `/templates/${state.tEditing._id}`, body)
      : await call('POST', '/templates', body);
    flash(data.message);
    $('t-form').hidden = true;
    state.tEditing = null;
    await loadTemplateOptions();
    await openTemplate(data.template._id, true);
  } catch (err) { fail(err); }
};

// ---------------------------------------------------------------- start

// Wait for the session before the first render, so the page knows which buttons this role
// may actually use, then start on the term that is running now rather than the newest one.
session
  .then(() => call('GET', '/terms/current'))
  .then((d) => { state.termId = d.term?._id || ''; })
  .catch(() => {})
  .then(applyRole)
  .then(loadOptions)
  .then(loadOfferings)
  .catch((err) => {
    // A session that expires between loading the page and loading the data lands here.
    // An empty table with a toast above it reads like a term with no offerings, which is a
    // different problem entirely, so say plainly what happened.
    if (err.status === 401) showSignedOut();
    else flash(err.message, 'error');
  });
