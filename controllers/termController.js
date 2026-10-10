// Req 16: Administrator creates an academic term with its registration and advising-season dates
// Req 17: Administrator updates a term and its dates
// Dates: term start/end, teaching start/end, advising deadline, normal-student whole-schedule-swap
// deadline. Actions are blocked after their deadline through services/termRules.js.
const AcademicTerm = require('../models/AcademicTerm');
const { validateTerm, termStatus, getCurrentTerm } = require('../services/termRules');
const { HttpError } = require('../services/httpError');

const withStatus = (t) => ({ ...t, status: termStatus(t) });

// GET /api/terms
async function listTerms(req, res, next) {
  try {
    const terms = await AcademicTerm.find({}).lean();
    terms.sort((a, b) => new Date(b.term_start) - new Date(a.term_start));
    res.json({ terms: terms.map(withStatus) });
  } catch (err) { next(err); }
}

// GET /api/terms/current  -> the running term, else the next one (any logged-in user)
async function getCurrent(req, res, next) {
  try {
    const term = await getCurrentTerm();
    res.json({ term: term ? withStatus(term) : null });
  } catch (err) { next(err); }
}

// GET /api/terms/:id
async function getTerm(req, res, next) {
  try {
    const term = await AcademicTerm.findById(req.params.id).lean();
    if (!term) throw new HttpError(404, 'Academic term not found');
    res.json({ term: withStatus(term) });
  } catch (err) { next(err); }
}

async function assertNoDuplicate(value, ignoreId) {
  const other = await AcademicTerm.findOne({ academic_year: value.academic_year, season: value.season }).lean();
  if (other && other._id !== ignoreId) throw new HttpError(409, `${value.name} already exists`, { errors: { season: `${value.name} already exists` } });
}

// POST /api/terms   (Req 16)
async function createTerm(req, res, next) {
  try {
    const result = validateTerm(req.body);
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });
    await assertNoDuplicate(result.value);
    const term = await AcademicTerm.create(result.value);
    res.status(201).json({ message: `${result.value.name} was created`, term: withStatus(term.toObject ? term.toObject() : term) });
  } catch (err) { next(err); }
}

// PUT /api/terms/:id   (Req 17) — send only the fields that change, or all of them
async function updateTerm(req, res, next) {
  try {
    const existing = await AcademicTerm.findById(req.params.id).lean();
    if (!existing) throw new HttpError(404, 'Academic term not found');
    const result = validateTerm(req.body, existing);
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });
    await assertNoDuplicate(result.value, existing._id);
    const term = await AcademicTerm.findOneAndUpdate(
      { _id: existing._id }, { $set: result.value }, { returnDocument: 'after', runValidators: true }
    ).lean();
    res.json({ message: `${term.name} was updated`, term: withStatus(term) });
  } catch (err) { next(err); }
}

module.exports = { listTerms, getCurrent, getTerm, createTerm, updateTerm };
