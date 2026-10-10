// Req 18 (create) and Req 20 (update) form. The course code cannot change when editing.
import React, { useState } from 'react';
import api, { errorMessage, fieldErrors } from './api';

const EMPTY = {
  course_code: '', course_name: '', credit_hours: '', course_type: 'CORE', majors: ['CS', 'DMET'],
  recommended_semester: '', offering_season: 'WINTER', prerequisites: [],
};

export default function CourseForm({ course, allCourses, onSaved, onCancel }) {
  const editing = Boolean(course);
  const [form, setForm] = useState(editing ? { ...EMPTY, ...course } : EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [prereqSearch, setPrereqSearch] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleMajor = (m) => setForm((f) => ({ ...f, majors: f.majors.includes(m) ? f.majors.filter((x) => x !== m) : [...f.majors, m] }));
  const togglePrereq = (code) => setForm((f) => ({
    ...f, prerequisites: f.prerequisites.includes(code) ? f.prerequisites.filter((x) => x !== code) : [...f.prerequisites, code],
  }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setError('');
    const body = { ...form, credit_hours: Number(form.credit_hours), recommended_semester: Number(form.recommended_semester) };
    delete body._id; delete body.curriculum; delete body.created_at; delete body.updated_at; delete body.__v;
    try {
      const r = editing
        ? await api.put(`/catalogue/courses/${encodeURIComponent(course.course_code)}`, body)
        : await api.post('/catalogue/courses', body);
      onSaved(r.data.message, r.data.course);
    } catch (err) {
      setErrors(fieldErrors(err)); setError(errorMessage(err));
    } finally { setSaving(false); }
  };

  const options = allCourses
    .filter((c) => c.course_code !== form.course_code)
    .filter((c) => !prereqSearch || `${c.course_code} ${c.course_name}`.toLowerCase().includes(prereqSearch.toLowerCase()));
  const Err = ({ k }) => (errors[k] ? <span className="cat-field-error">{errors[k]}</span> : null);

  return (
    <form className="cat-card" onSubmit={save} noValidate>
      <h3>{editing ? `Edit ${course.course_code}` : 'Add a course'}</h3>
      {error && <div className="cat-error">{error}</div>}
      <div className="cat-grid">
        <label className="cat-field">Course code
          <input className="cat-input" value={form.course_code} onChange={set('course_code')} disabled={editing} placeholder="CSEN 301" />
          {editing && <span className="cat-muted cat-small">The code cannot be changed</span>}<Err k="course_code" />
        </label>
        <label className="cat-field cat-span-2">Course name
          <input className="cat-input" value={form.course_name} onChange={set('course_name')} maxLength={100} placeholder="Data Structures and Algorithms" /><Err k="course_name" />
        </label>
        <label className="cat-field">Credit hours
          <input className="cat-input" type="number" min="1" max="12" value={form.credit_hours} onChange={set('credit_hours')} /><Err k="credit_hours" />
        </label>
        <label className="cat-field">Course type
          <select className="cat-input" value={form.course_type} onChange={set('course_type')}>
            <option value="CORE">Core</option><option value="ELECTIVE">Elective</option><option value="HUMA">Humanities (huma)</option>
          </select><Err k="course_type" />
        </label>
        <fieldset className="cat-field cat-fieldset">
          <legend>Faculty / major</legend>
          {['CS', 'DMET'].map((m) => (
            <label key={m} className="cat-check"><input type="checkbox" checked={form.majors.includes(m)} onChange={() => toggleMajor(m)} /> {m === 'CS' ? 'MET (CS)' : 'DMET'}</label>
          ))}
          <Err k="majors" />
        </fieldset>
        <label className="cat-field">Recommended semester
          <select className="cat-input" value={form.recommended_semester} onChange={set('recommended_semester')}>
            <option value="">Choose…</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>Semester {s}</option>)}
          </select><Err k="recommended_semester" />
        </label>
        <label className="cat-field">Offering season
          <select className="cat-input" value={form.offering_season} onChange={set('offering_season')}>
            <option value="WINTER">Winter</option><option value="SPRING">Spring</option><option value="SUMMER">Summer</option><option value="BOTH">Winter & Spring</option>
          </select><Err k="offering_season" />
        </label>
      </div>

      <div className="cat-field">
        <span>Prerequisites {form.prerequisites.length > 0 && <span className="cat-muted">({form.prerequisites.join(', ')})</span>}</span>
        <input className="cat-input" placeholder="Filter courses…" value={prereqSearch} onChange={(e) => setPrereqSearch(e.target.value)} />
        <div className="cat-prereq-box">
          {options.map((c) => (
            <label key={c.course_code} className="cat-check">
              <input type="checkbox" checked={form.prerequisites.includes(c.course_code)} onChange={() => togglePrereq(c.course_code)} />
              <span className="cat-mono">{c.course_code}</span> {c.course_name}
            </label>
          ))}
          {options.length === 0 && <span className="cat-muted">No courses match.</span>}
        </div>
        <Err k="prerequisites" />
      </div>

      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="cat-btn" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add course'}</button>
      </div>
    </form>
  );
}
