// Command-prompt test of Person 6's endpoints (Req 22-23, 25-30) against the REAL server
// and database.
//   npm run mongo            (window 1, only if you have no MongoDB)
//   npm run seed:catalogue && npm run seed && npm run seed:offerings
//   npm run dev              (window 2)
//   npm run smoke:offerings  (window 3)
//
// It logs in as the seeded administrator and coordinator, works on a throwaway course
// offering and standard schedule in the current term, prints PASS/FAIL for each rule, and
// deletes everything it created, so the seeded data is left exactly as it was.
const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 5050}`;
const PASSWORD = process.env.SEED_PASSWORD || 'Password123!';
const SEMESTER = 10; // a semester the seed puts nobody in, so no real student is touched

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1; else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
};

async function call(method, url, token, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}
const why = (r) => `status ${r.status}${r.data?.message ? `: ${r.data.message}` : ''}`;

async function login(email) {
  const r = await call('POST', '/api/auth/login', null, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`Cannot log in as ${email} (${why(r)}). Run the seeds first.`);
  return r.data.token;
}

async function run() {
  console.log(`\nTesting ${BASE}\n`);
  const admin = await login('admin@guc.edu.eg');
  const coordinator = await login('coordinator@guc.edu.eg');

  const current = await call('GET', '/api/terms/current', admin);
  const term = current.data.term;
  if (!term) throw new Error('No academic term exists. Run "npm run seed:catalogue" first.');
  console.log(`Academic term: ${term.name}\n`);

  // A catalogue course that is not offered in this term yet, so nothing seeded is disturbed.
  const options = await call('GET', `/api/offerings/options?term_id=${term._id}`, admin);
  const free = options.data.courses.find((c) => !c.already_offered);
  if (!free) throw new Error('Every catalogue course is already offered in this term.');
  console.log(`Using the spare course ${free.course_code}\n`);

  const ROOM = 'SMOKE.1';
  const slot = (over = {}) => ({
    type: 'LECTURE', group_number: '1', day: 'THURSDAY', start_time: '17:00', end_time: '18:30',
    room: ROOM, max_capacity: 40, ...over,
  });
  const base = {
    term_id: term._id, course_code: free.course_code, instructors: ['Dr. Smoke Test'],
    eligible_groups: [{ major: 'CS', semester: SEMESTER }],
  };
  let offeringId, templateId;

  try {
    // ---------------------------------------------------------- Req 22
    console.log('--- Req 22: create a course offering and its slots ---');
    let r = await call('POST', '/api/offerings', admin, {
      ...base,
      groups: [slot(), slot({ type: 'TUTORIAL', group_number: 'T1', start_time: '18:45', end_time: '20:15', room: 'SMOKE.2', max_capacity: 20 })],
    });
    check('Req 22  administrator creates an offering with a lecture and a tutorial', r.status === 201 && r.data.offering?.groups?.length === 2, why(r));
    offeringId = r.data.offering?._id;
    check('Req 22  a new offering starts unpublished', r.data.offering?.is_published === false, why(r));
    check('Req 22  remaining capacity is calculated', r.data.offering?.groups?.[0]?.remaining_capacity === 40, why(r));

    r = await call('POST', '/api/offerings', admin, { ...base, groups: [] });
    check('Req 22  the same course cannot be offered twice in a term (409)', r.status === 409, why(r));

    r = await call('POST', '/api/offerings', coordinator, { ...base, groups: [] });
    check('Req 22  a coordinator may not create an offering (403)', r.status === 403, why(r));

    r = await call('POST', '/api/offerings', admin, {
      ...base, course_code: 'ZZZZ 999', groups: [slot({ room: 'SMOKE.9' })],
    });
    check('Req 22  a course outside the catalogue is refused (404)', r.status === 404, why(r));

    // ---------------------------------------------------------- Req 23
    console.log('\n--- Req 23: view the offerings of a term ---');
    r = await call('GET', `/api/offerings?term_id=${term._id}&search=${encodeURIComponent(free.course_code)}`, coordinator);
    check('Req 23  the new offering is in the term list', r.status === 200 && r.data.offerings.some((o) => o._id === offeringId), why(r));

    r = await call('GET', `/api/offerings/${offeringId}`, admin);
    check('Req 23  one offering opens with all of its slots', r.status === 200 && r.data.offering.groups.length === 2 && Boolean(r.data.term), why(r));

    r = await call('GET', `/api/offerings?term_id=${term._id}&published=true`, admin);
    check('Req 23  the draft is not in the published list', r.status === 200 && !r.data.offerings.some((o) => o._id === offeringId), why(r));

    // ---------------------------------------------------------- Req 25
    console.log('\n--- Req 25: update an offering or one of its slots ---');
    const stored = (await call('GET', `/api/offerings/${offeringId}`, admin)).data.offering;
    const lecture = stored.groups.find((g) => g.type === 'LECTURE');

    r = await call('PUT', `/api/offerings/${offeringId}`, admin, { ...base, instructors: ['Dr. Smoke Test', 'Dr. Second'], groups: stored.groups });
    check('Req 25  the instructors of an offering can be changed', r.status === 200 && r.data.offering.instructors.length === 2, why(r));

    r = await call('PUT', `/api/offerings/${offeringId}/slots/${lecture._id}`, admin, { ...slot(), max_capacity: 55 });
    check('Req 25  a slot capacity can be raised', r.status === 200 && r.data.offering.groups.find((g) => g._id === lecture._id).max_capacity === 55, why(r));

    r = await call('PUT', `/api/offerings/${offeringId}/slots/${lecture._id}`, admin, { ...slot(), day: 'FRIDAY' });
    check('Req 25  a day outside the teaching week is refused (400)', r.status === 400 && Boolean(r.data.errors?.day), why(r));

    r = await call('PUT', `/api/offerings/${offeringId}/slots/${lecture._id}`, admin, { ...slot(), room: 'SMOKE.2', start_time: '18:45', end_time: '20:15' });
    check('Req 25  moving a slot into a busy room is refused (409)', r.status === 409 && /already used/i.test(r.data.message || ''), why(r));

    r = await call('PUT', `/api/offerings/${offeringId}`, admin, { ...base, course_code: 'CSEN 102', groups: stored.groups });
    check('Req 25  the course of an offering cannot be swapped (400)', r.status === 400, why(r));

    // ---------------------------------------------------------- Req 27
    console.log('\n--- Req 27: publish or unpublish the offerings of a term ---');
    r = await call('PUT', `/api/offerings/${offeringId}/publication`, admin, { published: true });
    check('Req 27  the administrator publishes the offering', r.status === 200 && r.data.offering.is_published === true, why(r));

    r = await call('PUT', `/api/offerings/${offeringId}/publication`, coordinator, { published: false });
    check('Req 27  a coordinator may not publish (403)', r.status === 403, why(r));

    // ---------------------------------------------------------- Req 28
    console.log('\n--- Req 28: create a standard schedule ---');
    const published = (await call('GET', `/api/offerings/${offeringId}`, admin)).data.offering;
    const entries = [{ offering_id: offeringId, slot_ids: published.groups.map((g) => g._id) }];

    r = await call('POST', '/api/templates', coordinator, {
      term_id: term._id, major: 'CS', semester: SEMESTER, study_group: 'SMOKE', entries,
    });
    check('Req 28  the coordinator creates a standard schedule', r.status === 201 && r.data.template?.total_slots === 2, why(r));
    templateId = r.data.template?._id;
    check('Req 28  the weekly calendar keeps a row for every teaching day', r.data.template?.week?.length === 6, why(r));

    r = await call('POST', '/api/templates', admin, { term_id: term._id, major: 'CS', semester: SEMESTER, study_group: 'SMOKE2', entries });
    check('Req 28  an administrator may not build a standard schedule (403)', r.status === 403, why(r));

    r = await call('POST', '/api/templates', coordinator, { term_id: term._id, major: 'CS', semester: SEMESTER, study_group: 'SMOKE', entries });
    check('Req 28  the same major, semester and group cannot be used twice (409)', r.status === 409, why(r));

    r = await call('POST', '/api/templates', coordinator, {
      term_id: term._id, major: 'DMET', semester: SEMESTER, study_group: 'SMOKE3', entries,
    });
    check('Req 28  a course not offered to that major is refused (400)', r.status === 400 && /not offered to DMET/.test(r.data.errors?.entries || ''), why(r));

    // ---------------------------------------------------------- Req 29
    console.log('\n--- Req 29: update a standard schedule ---');
    r = await call('PUT', `/api/templates/${templateId}`, coordinator, {
      major: 'CS', semester: SEMESTER, study_group: 'SMOKE',
      entries: [{ offering_id: offeringId, slot_ids: [published.groups[0]._id] }],
    });
    check('Req 29  a course can be trimmed to one slot', r.status === 200 && r.data.template.total_slots === 1, why(r));

    // ---------------------------------------------------------- Req 30
    console.log('\n--- Req 30: assign normal students to a standard schedule group ---');
    r = await call('POST', `/api/templates/${templateId}/students`, coordinator, { student_ids: ['nobody'] });
    check('Req 30  a draft standard schedule takes no students (409)', r.status === 409 && /draft/i.test(r.data.message || ''), why(r));

    r = await call('PUT', `/api/templates/${templateId}/publication`, coordinator, { published: true });
    check('Req 30  the coordinator publishes the standard schedule', r.status === 200 && r.data.template.is_published === true, why(r));

    r = await call('GET', `/api/templates/${templateId}/candidates`, coordinator);
    check(`Req 30  the candidate list holds only normal CS semester ${SEMESTER} students`, r.status === 200 && Array.isArray(r.data.candidates), why(r));

    r = await call('POST', `/api/templates/${templateId}/students`, coordinator, { student_ids: ['no-such-student'] });
    check('Req 30  an unknown student is skipped with a reason', r.status === 200 && r.data.skipped?.length === 1, why(r));

    // ---------------------------------------------------------- Req 27 and 26 while in use
    console.log('\n--- Req 26 and 27: what is in use cannot be removed ---');
    r = await call('PUT', `/api/offerings/${offeringId}/publication`, admin, { published: false });
    check('Req 27  an offering in a published standard schedule cannot be unpublished (409)', r.status === 409, why(r));

    r = await call('DELETE', `/api/offerings/${offeringId}`, admin);
    check('Req 26  an offering a standard schedule uses cannot be deleted (409)', r.status === 409, why(r));

    r = await call('DELETE', `/api/offerings/${offeringId}/slots/${published.groups[0]._id}`, admin);
    check('Req 26  a slot a standard schedule uses cannot be deleted (409)', r.status === 409, why(r));
  } finally {
    // ---------------------------------------------------------- clean up
    console.log('\n--- Cleaning up what this test created ---');
    if (templateId) {
      const r = await call('DELETE', `/api/templates/${templateId}`, coordinator);
      check('Req 29  the test standard schedule is deleted', r.status === 200, why(r));
    }
    if (offeringId) {
      const r = await call('DELETE', `/api/offerings/${offeringId}`, admin);
      check('Req 26  the test offering is deleted once nothing uses it', r.status === 200, why(r));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
}

run().catch((e) => { console.error(`\n${e.message}\n`); process.exit(1); });
