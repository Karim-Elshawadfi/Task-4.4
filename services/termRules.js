// Req 16-17 rules for academic terms (pure functions, unit tested) + deadline helpers that
// other features use to block actions after a deadline.
const AcademicTerm = require('../models/AcademicTerm');

const SEASONS = ['WINTER', 'SPRING', 'SUMMER'];
const SEASON_LABEL = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer' };
const DATE_FIELDS = {
  term_start: 'Term start',
  term_end: 'Term end',
  teaching_start: 'Teaching start',
  teaching_end: 'Teaching end',
  advising_deadline: 'Advising deadline',
  swap_deadline: 'Whole-schedule swap deadline',
};

function parseDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined = invalid
}

/**
 * Validates a term from the form. For an update, pass the stored term as `existing`
 * so fields that were not sent keep their old values.
 * @returns {{ok: true, value: object} | {ok: false, errors: object}}  errors keyed by field
 */
function validateTerm(body = {}, existing = null) {
  const errors = {};
  const pick = (k) => (body[k] !== undefined ? body[k] : existing?.[k]);

  const academicYear = String(pick('academic_year') ?? '').trim();
  const m = academicYear.match(/^(\d{4})\/(\d{4})$/);
  if (!m) errors.academic_year = 'Use the format 2026/2027';
  else if (Number(m[2]) !== Number(m[1]) + 1) errors.academic_year = 'The second year must be the first year + 1';

  const season = String(pick('season') ?? '').toUpperCase();
  if (!SEASONS.includes(season)) errors.season = 'Choose Winter, Spring or Summer';

  const d = {};
  for (const [field, label] of Object.entries(DATE_FIELDS)) {
    const parsed = parseDate(pick(field));
    if (parsed === null) errors[field] = `${label} is required`;
    else if (parsed === undefined) errors[field] = `${label} is not a valid date`;
    else d[field] = parsed;
  }

  const has = (...f) => f.every((x) => d[x]);
  if (has('term_start', 'term_end') && d.term_start >= d.term_end) errors.term_end = 'Term end must be after term start';
  if (has('teaching_start', 'teaching_end') && d.teaching_start >= d.teaching_end) errors.teaching_end = 'Teaching end must be after teaching start';
  if (has('term_start', 'teaching_start') && d.teaching_start < d.term_start) errors.teaching_start = 'Teaching must start on or after the term start';
  if (has('term_end', 'teaching_end') && d.teaching_end > d.term_end) errors.teaching_end = 'Teaching must end on or before the term end';
  for (const f of ['advising_deadline', 'swap_deadline']) {
    if (has(f, 'term_start', 'term_end') && (d[f] < d.term_start || d[f] > d.term_end)) {
      errors[f] = `${DATE_FIELDS[f]} must be between the term start and end`;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { academic_year: academicYear, season, name: `${SEASON_LABEL[season]} ${academicYear}`, ...d },
  };
}

/** What is open/closed in a term at `now`. Other features use this to block late actions. */
function termStatus(term, now = new Date()) {
  const t = (k) => new Date(term[k]);
  return {
    phase: now < t('term_start') ? 'UPCOMING' : now > t('term_end') ? 'FINISHED' : 'RUNNING',
    teaching: now >= t('teaching_start') && now <= t('teaching_end'),
    advisingOpen: now <= t('advising_deadline'),
    swapOpen: now <= t('swap_deadline'),
  };
}

/** The term running now, else the next one to start, else null. */
async function getCurrentTerm(now = new Date()) {
  const terms = await AcademicTerm.find({}).lean();
  const running = terms.find((t) => new Date(t.term_start) <= now && now <= new Date(t.term_end));
  if (running) return running;
  return terms.filter((t) => new Date(t.term_start) > now).sort((a, b) => new Date(a.term_start) - new Date(b.term_start))[0] || null;
}

/**
 * For other features: throws a 403-style error if the deadline of the current term has passed.
 *   await assertBeforeDeadline('advising')   // Req 57, advising actions
 *   await assertBeforeDeadline('swap')       // Req 34-35, whole-schedule swap
 */
async function assertBeforeDeadline(kind, now = new Date()) {
  const term = await getCurrentTerm(now);
  if (!term) return null;
  const open = kind === 'swap' ? termStatus(term, now).swapOpen : termStatus(term, now).advisingOpen;
  if (!open) {
    const err = new Error(`The ${kind === 'swap' ? 'whole-schedule swap' : 'advising'} deadline for ${term.name} has passed`);
    err.status = 403;
    throw err;
  }
  return term;
}

module.exports = { SEASONS, SEASON_LABEL, DATE_FIELDS, validateTerm, termStatus, getCurrentTerm, assertBeforeDeadline };
