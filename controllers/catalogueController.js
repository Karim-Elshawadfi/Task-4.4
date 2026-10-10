// Req 18: create a course          Req 19: view the catalogue and each course's details
// Req 20: update a course          Req 21: delete a course
// Req 128: import many courses from a CSV (validate first, all-or-nothing, create or update by code)
// Each course: code, name, credit hours, type (core/elective/huma), faculty/major, recommended
// semester, offering season and prerequisites. Electives live in the same catalogue.
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Course = require('../models/Course');
const { validateCourse, normalizeCode, curriculumFor, findCycle, MAJORS, COURSE_TYPES, OFFERING_SEASONS } = require('../services/courseRules');
const { validateImport } = require('../services/courseImport');
const { HttpError } = require('../services/httpError');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byPlan = (a, b) => (a.recommended_semester ?? 99) - (b.recommended_semester ?? 99) || a.course_code.localeCompare(b.course_code);

async function findByCode(codeParam) {
  const code = normalizeCode(decodeURIComponent(codeParam));
  const course = await Course.findOne({ course_code: code }).lean();
  if (!course) throw new HttpError(404, `Course ${code} was not found`);
  return course;
}

/** Offerings (Req 22, another team member) that use this course; empty until that collection exists. */
async function offeringsUsing(course) {
  const db = mongoose.connection.readyState === 1 ? mongoose.connection.db : null;
  if (!db) return 0;
  return db.collection('course_offerings').countDocuments({ $or: [{ course_code: course.course_code }, { course_id: course._id }] });
}

// GET /api/catalogue/courses?search=&major=&type=&semester=&season=   (Req 19)
async function listCourses(req, res, next) {
  try {
    const q = req.query;
    const filter = {};
    if (q.search) {
      const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
      filter.$or = [{ course_code: rx }, { course_name: rx }];
    }
    if (q.major && MAJORS.includes(q.major)) filter.majors = q.major;
    if (q.type && COURSE_TYPES.includes(q.type)) filter.course_type = q.type;
    if (q.semester) filter.recommended_semester = Number(q.semester);
    if (q.season && OFFERING_SEASONS.includes(q.season)) filter.offering_season = q.season;
    const courses = (await Course.find(filter).lean()).sort(byPlan);
    res.json({ courses, total: courses.length });
  } catch (err) { next(err); }
}

// GET /api/catalogue/courses/:code   (Req 19) — :code like "CSEN%20301"
async function getCourse(req, res, next) {
  try {
    const course = await findByCode(req.params.code);
    const [prereqs, requiredBy] = await Promise.all([
      Course.find({ course_code: { $in: course.prerequisites || [] } }).lean(),
      Course.find({ prerequisites: course.course_code }).lean(),
    ]);
    const nameOf = new Map(prereqs.map((c) => [c.course_code, c.course_name]));
    res.json({
      course,
      prerequisiteDetails: (course.prerequisites || []).map((code) => ({ code, name: nameOf.get(code) || null })),
      requiredBy: requiredBy.sort(byPlan).map((c) => ({ code: c.course_code, name: c.course_name })),
    });
  } catch (err) { next(err); }
}

const knownCodes = async () => new Set((await Course.find({}).lean()).map((c) => c.course_code));

// POST /api/catalogue/courses   (Req 18)
async function createCourse(req, res, next) {
  try {
    const result = validateCourse(req.body, { knownCodes: await knownCodes() });
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });
    const v = result.value;
    if (await Course.findOne({ course_code: v.course_code }).lean()) {
      throw new HttpError(409, `${v.course_code} already exists`, { errors: { course_code: `${v.course_code} already exists in the catalogue` } });
    }
    const course = await Course.create({ _id: randomUUID(), ...v, curriculum: curriculumFor(v) });
    res.status(201).json({ message: `${v.course_code} was added to the catalogue`, course: course.toObject ? course.toObject() : course });
  } catch (err) { next(err); }
}

// PUT /api/catalogue/courses/:code   (Req 20) — the code itself cannot change (other records point to it)
async function updateCourse(req, res, next) {
  try {
    const existing = await findByCode(req.params.code);
    if (req.body.course_code && normalizeCode(req.body.course_code) !== existing.course_code) {
      throw new HttpError(400, 'The course code cannot be changed', { errors: { course_code: 'The course code cannot be changed. Delete the course and create it again with the new code.' } });
    }
    const merged = { ...existing, ...req.body, course_code: existing.course_code };
    const result = validateCourse(merged, { knownCodes: await knownCodes() });
    if (!result.ok) throw new HttpError(400, 'Please fix the highlighted fields', { errors: result.errors });
    const v = result.value;

    const graph = new Map((await Course.find({}).lean()).map((c) => [c.course_code, c.prerequisites || []]));
    graph.set(v.course_code, v.prerequisites);
    const cycle = findCycle(graph);
    if (cycle) throw new HttpError(400, 'Prerequisites form a loop', { errors: { prerequisites: `Prerequisites form a loop: ${cycle.join(' -> ')}` } });

    const course = await Course.findOneAndUpdate(
      { _id: existing._id },
      { $set: { ...v, curriculum: curriculumFor(v, existing) } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    res.json({ message: `${v.course_code} was updated`, course });
  } catch (err) { next(err); }
}

// DELETE /api/catalogue/courses/:code   (Req 21)
async function deleteCourse(req, res, next) {
  try {
    const course = await findByCode(req.params.code);
    const dependents = await Course.find({ prerequisites: course.course_code }).lean();
    if (dependents.length) {
      throw new HttpError(409, `${course.course_code} is a prerequisite of ${dependents.map((c) => c.course_code).sort().join(', ')}. Remove it from those courses first.`);
    }
    const offerings = await offeringsUsing(course);
    if (offerings) throw new HttpError(409, `${course.course_code} has ${offerings} course offering(s). Delete the offerings first.`);
    await Course.deleteOne({ _id: course._id });
    res.json({ message: `${course.course_code} was deleted from the catalogue` });
  } catch (err) { next(err); }
}

// POST /api/catalogue/courses/import   (Req 128)   body: { csv: "<file text>", dryRun: true|false }
// dryRun=true only validates and returns a preview. Nothing is written if any row is invalid.
async function importCourses(req, res, next) {
  try {
    const csv = req.body?.csv;
    if (typeof csv !== 'string' || !csv.trim()) throw new HttpError(400, 'Choose a CSV file to import');
    const existing = await Course.find({}).lean();
    const result = validateImport(csv, existing);
    if (!result.ok) {
      return res.status(422).json({
        message: `No courses were imported. Fix the ${result.errors.length} error(s) below and upload the file again.`,
        errors: result.errors,
      });
    }
    if (req.body.dryRun) {
      return res.json({ message: `The file is valid: ${result.created} new and ${result.updated} existing course(s)`, dryRun: true, ...result });
    }
    const byCode = new Map(existing.map((c) => [c.course_code, c]));
    await Course.bulkWrite(result.rows.map(({ row, action, ...v }) => ({
      updateOne: {
        filter: { course_code: v.course_code },
        update: { $set: { ...v, curriculum: curriculumFor(v, byCode.get(v.course_code)) }, $setOnInsert: { _id: randomUUID() } },
        upsert: true,
      },
    })));
    res.json({ message: `Imported ${result.rows.length} course(s): ${result.created} created, ${result.updated} updated`, created: result.created, updated: result.updated });
  } catch (err) { next(err); }
}

module.exports = { listCourses, getCourse, createCourse, updateCourse, deleteCourse, importCourses };
