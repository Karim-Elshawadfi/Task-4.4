// Req 18-21 and 128: one set of rules for a course, used by the form (create/update) AND the
// CSV import, so both accept and reject exactly the same values. Pure functions -> unit tested.
const COURSE_TYPES = ['CORE', 'ELECTIVE', 'HUMA'];
const OFFERING_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'BOTH'];
const MAJORS = ['CS', 'DMET'];
const CODE_RX = /^[A-Z]{2,5}[pt]? \d{3,4}$/; // CSEN 301, HUMA 1001, CHEMp 102, PHYSt 301

/**
 * "csen301" -> "CSEN 301", "CHEMp102" -> "CHEMp 102", " de  101 " -> "DE 101".
 * A lowercase p/t right before the number is kept (lab "p" / theory "t" courses in the curriculum).
 */
function normalizeCode(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, '');
  const m = s.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return String(raw ?? '').trim();
  let letters = m[1];
  const keepSuffix = /[A-Z][pt]$/.test(letters); // "CHEMp" but not "chemp"
  letters = keepSuffix ? letters.slice(0, -1).toUpperCase() + letters.slice(-1) : letters.toUpperCase();
  return `${letters} ${m[2]}`;
}

const splitList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[;,|]/)).map((x) => String(x).trim()).filter(Boolean);

function parseMajors(v) {
  const parts = Array.isArray(v) ? v : String(v ?? '').split(/[;,|/&\s]+/);
  const list = parts.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  if (list.includes('BOTH') || list.includes('ALL')) return [...MAJORS];
  return [...new Set(list)];
}

const isWholeNumber = (v) => v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v));

/**
 * @param {object} raw   course fields as sent by the form or read from a CSV row
 * @param {object} ctx
 * @param {Set<string>} ctx.knownCodes  codes that exist (DB + other CSV rows), for prerequisites
 * @returns {{ok:true, value:object} | {ok:false, errors:object}}  errors keyed by field name
 */
function validateCourse(raw = {}, { knownCodes = new Set() } = {}) {
  const errors = {};
  const code = normalizeCode(raw.course_code);
  if (!code) errors.course_code = 'Course code is required';
  else if (!CODE_RX.test(code)) errors.course_code = `"${raw.course_code}" is not a valid code (e.g. CSEN 301)`;

  const name = String(raw.course_name ?? '').trim();
  if (!name) errors.course_name = 'Course name is required';
  else if (name.length > 100) errors.course_name = 'Course name must be at most 100 characters';

  const hours = Number(raw.credit_hours);
  if (!isWholeNumber(raw.credit_hours) || hours < 1 || hours > 12) errors.credit_hours = 'Credit hours must be a whole number from 1 to 12';

  const type = String(raw.course_type ?? '').trim().toUpperCase();
  if (!COURSE_TYPES.includes(type)) errors.course_type = 'Course type must be core, elective or huma';

  const majors = parseMajors(raw.majors ?? raw.major);
  if (!majors.length) errors.majors = 'Choose at least one major (CS, DMET or both)';
  else if (majors.some((m) => !MAJORS.includes(m))) errors.majors = `Unknown major: ${majors.filter((m) => !MAJORS.includes(m)).join(', ')}`;

  const semester = Number(raw.recommended_semester);
  if (!isWholeNumber(raw.recommended_semester) || semester < 1 || semester > 10) {
    errors.recommended_semester = 'Recommended semester must be a whole number from 1 to 10';
  }

  let season = String(raw.offering_season ?? '').trim().toUpperCase();
  if (['WINTER & SPRING', 'WINTER AND SPRING', 'ANY'].includes(season)) season = 'BOTH';
  if (!OFFERING_SEASONS.includes(season)) errors.offering_season = 'Offering season must be winter, spring, summer or both';

  const prerequisites = [...new Set(splitList(raw.prerequisites).map(normalizeCode))];
  const badFormat = prerequisites.filter((p) => !CODE_RX.test(p));
  const unknown = prerequisites.filter((p) => CODE_RX.test(p) && p !== code && !knownCodes.has(p));
  if (badFormat.length) errors.prerequisites = `Invalid prerequisite code(s): ${badFormat.join(', ')}`;
  else if (prerequisites.includes(code)) errors.prerequisites = 'A course cannot be its own prerequisite';
  else if (unknown.length) errors.prerequisites = `Prerequisite(s) not in the catalogue: ${unknown.join(', ')}`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      course_code: code,
      course_name: name,
      credit_hours: hours,
      course_type: type,
      majors: MAJORS.filter((m) => majors.includes(m)),
      recommended_semester: semester,
      offering_season: season,
      prerequisites,
    },
  };
}

/** Study-plan placement used by the academic-history pages: one entry per major (none for electives). */
function curriculumFor(value, existing) {
  if (value.course_type === 'ELECTIVE') return [];
  // Keep a special per-major plan (e.g. DMET 502: sem 5 DMET, sem 7 CS) when majors and semester did not change.
  if (existing?.curriculum?.length) {
    const sameMajors = [...new Set(existing.curriculum.map((c) => c.major))].sort().join() === [...value.majors].sort().join();
    const sameSemester = Math.min(...existing.curriculum.map((c) => c.semester)) === value.recommended_semester;
    if (sameMajors && sameSemester) return existing.curriculum;
  }
  return value.majors.map((major) => ({ major, semester: value.recommended_semester }));
}

/** Returns a prerequisite cycle as a list of codes (e.g. [A, B, A]) or null. graph: Map code -> [prereq codes] */
function findCycle(graph) {
  const state = new Map(); // 1 = visiting, 2 = done
  const stack = [];
  const visit = (code) => {
    if (state.get(code) === 2) return null;
    if (state.get(code) === 1) return [...stack.slice(stack.indexOf(code)), code];
    state.set(code, 1);
    stack.push(code);
    for (const p of graph.get(code) || []) {
      const cycle = visit(p);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(code, 2);
    return null;
  };
  for (const code of graph.keys()) {
    const cycle = visit(code);
    if (cycle) return cycle;
  }
  return null;
}

const firstError = (errors) => Object.values(errors)[0];

module.exports = {
  COURSE_TYPES, OFFERING_SEASONS, MAJORS, CODE_RX,
  normalizeCode, parseMajors, validateCourse, curriculumFor, findCycle, firstError,
};
