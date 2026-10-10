// Req 128: validate a CSV of courses BEFORE anything is written.
// All-or-nothing: if any row is invalid, the caller imports nothing and shows the row errors.
// New codes are created, existing codes are updated (no duplicates).
const { parseCsv } = require('./csv');
const { validateCourse, normalizeCode, findCycle } = require('./courseRules');

const COLUMNS = [
  'course_code', 'course_name', 'credit_hours', 'course_type',
  'majors', 'recommended_semester', 'offering_season', 'prerequisites',
];
const COLUMN_LABELS = {
  course_code: 'course code', course_name: 'name', credit_hours: 'credit hours', course_type: 'course type',
  majors: 'faculty/major', recommended_semester: 'recommended semester', offering_season: 'offering season',
  prerequisites: 'prerequisites',
};
// Header spellings accepted for each column (compared after lower-casing and turning symbols into "_").
const ALIASES = {
  course_code: ['course_code', 'code', 'coursecode'],
  course_name: ['course_name', 'name', 'title', 'coursename'],
  credit_hours: ['credit_hours', 'credits', 'hours', 'credit_hrs', 'credithours'],
  course_type: ['course_type', 'type', 'coursetype'],
  majors: ['majors', 'major', 'faculty', 'faculty_major', 'faculty_majors'],
  recommended_semester: ['recommended_semester', 'semester', 'recommendedsemester'],
  offering_season: ['offering_season', 'season', 'offeringseason'],
  prerequisites: ['prerequisites', 'prerequisite', 'prereqs', 'prereq'],
};
const normHeader = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * @param {string} text  CSV file content
 * @param {object[]} existingCourses  current catalogue (lean documents)
 * @returns {{ok:boolean, errors:{row:number, column:string|null, message:string}[], rows:object[], created:number, updated:number}}
 */
function validateImport(text, existingCourses) {
  const errors = [];
  const fail = (row, column, message) => errors.push({ row, column, message });
  const { rows, unterminatedQuote } = parseCsv(text);
  const nonEmpty = rows.map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c.trim() !== ''));

  if (!nonEmpty.length) {
    fail(1, null, 'The file is empty');
    return { ok: false, errors, rows: [], created: 0, updated: 0 };
  }
  if (unterminatedQuote) fail(nonEmpty[nonEmpty.length - 1].line, null, 'A quoted value is never closed (missing ")');

  // ---- header / required columns
  const header = nonEmpty[0].cells.map(normHeader);
  const index = {};
  for (const col of COLUMNS) {
    const pos = header.findIndex((h) => ALIASES[col].includes(h));
    if (pos === -1) fail(1, col, `Missing required column "${COLUMN_LABELS[col]}"`);
    else index[col] = pos;
  }
  if (errors.length) return { ok: false, errors, rows: [], created: 0, updated: 0 };

  const dataRows = nonEmpty.slice(1);
  if (!dataRows.length) {
    fail(2, null, 'The file has a header but no course rows');
    return { ok: false, errors, rows: [], created: 0, updated: 0 };
  }

  // ---- rows
  const existingCodes = new Set(existingCourses.map((c) => c.course_code));
  const fileCodes = new Set(dataRows.map((r) => normalizeCode(r.cells[index.course_code])));
  const knownCodes = new Set([...existingCodes, ...fileCodes]);
  const seen = new Map();
  const valid = [];
  for (const { cells, line } of dataRows) {
    if (cells.length > header.length) fail(line, null, `Row has ${cells.length} values but the header has ${header.length} columns`);
    const raw = Object.fromEntries(COLUMNS.map((c) => [c, cells[index[c]] ?? '']));
    const res = validateCourse(raw, { knownCodes });
    if (!res.ok) {
      for (const [column, message] of Object.entries(res.errors)) fail(line, column, message);
      continue;
    }
    const code = res.value.course_code;
    if (seen.has(code)) {
      fail(line, 'course_code', `${code} is already on row ${seen.get(code)} of this file`);
      continue;
    }
    seen.set(code, line);
    valid.push({ line, value: res.value });
  }

  // ---- prerequisite cycles across the catalogue after the import
  if (!errors.length) {
    const graph = new Map(existingCourses.map((c) => [c.course_code, c.prerequisites || []]));
    for (const { value } of valid) graph.set(value.course_code, value.prerequisites);
    const cycle = findCycle(graph);
    if (cycle) {
      const line = valid.find((v) => cycle.includes(v.value.course_code))?.line ?? 2;
      fail(line, 'prerequisites', `Prerequisites form a loop: ${cycle.join(' -> ')}`);
    }
  }

  errors.sort((a, b) => a.row - b.row);
  const created = valid.filter((v) => !existingCodes.has(v.value.course_code)).length;
  return {
    ok: errors.length === 0,
    errors,
    rows: valid.map((v) => ({ row: v.line, ...v.value, action: existingCodes.has(v.value.course_code) ? 'update' : 'create' })),
    created,
    updated: valid.length - created,
  };
}

module.exports = { validateImport, COLUMNS, COLUMN_LABELS };
