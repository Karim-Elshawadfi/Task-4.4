// Req 28: create a standard schedule template for normal students by major, semester and study group
// Req 29: update a standard schedule template
//
// The coordinator picks a course, then ticks the lecture, tutorial and lab groups this
// study group attends. Only published offerings (Req 27) can be chosen, and the API
// refuses a pick that puts the group in two places at once.
import React, { useMemo, useState } from 'react';
import api, { errorMessage, fieldErrors, DAY_LABEL, TYPE_LABEL, TYPE_TONE, timeText, capacityTone } from './api';

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function TemplateForm({ term, options, template, onSaved, onCancel }) {
  const editing = Boolean(template);
  const [major, setMajor] = useState(template?.major ?? 'CS');
  const [semester, setSemester] = useState(template?.semester ?? 1);
  const [studyGroup, setStudyGroup] = useState(template?.study_group ?? '1');
  const [picked, setPicked] = useState(() => {
    const start = new Map();
    for (const entry of template?.entries ?? []) start.set(entry.offering_id, new Set(entry.slot_ids));
    return start;
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Only the courses this major and semester may take (Req 22: eligible major/semester groups).
  const available = useMemo(
    () => options.offerings.filter((o) => o.eligible_groups.some((g) => g.major === major && Number(g.semester) === Number(semester))),
    [options.offerings, major, semester]
  );

  const toggleSlot = (offeringId, slotId) => () =>
    setPicked((current) => {
      const next = new Map(current);
      const slots = new Set(next.get(offeringId) ?? []);
      if (slots.has(slotId)) slots.delete(slotId); else slots.add(slotId);
      if (slots.size) next.set(offeringId, slots); else next.delete(offeringId);
      return next;
    });

  const chosenCount = [...picked.values()].reduce((n, s) => n + s.size, 0);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setError('');
    const body = {
      term_id: term._id, major, semester: Number(semester), study_group: studyGroup,
      entries: [...picked.entries()].map(([offering_id, slots]) => ({ offering_id, slot_ids: [...slots] })),
    };
    try {
      const r = editing ? await api.put(`/templates/${template._id}`, body) : await api.post('/templates', body);
      onSaved(r.data.message, r.data.template);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="off-card" onSubmit={save} noValidate>
      <h3>{editing ? `Edit ${template.label}` : 'New standard schedule'} — {term.name}</h3>
      {error && <div className="off-error">{error}</div>}
      {errors.entries && <div className="off-error">{errors.entries}</div>}

      <div className="off-grid">
        <label className="off-field">Major
          <select className="off-input" value={major} onChange={(e) => setMajor(e.target.value)}>
            {options.majors.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {errors.major && <span className="off-field-error">{errors.major}</span>}
        </label>
        <label className="off-field">Semester
          <select className="off-input" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.semester && <span className="off-field-error">{errors.semester}</span>}
        </label>
        <label className="off-field">Study group
          <input className="off-input" value={studyGroup} onChange={(e) => setStudyGroup(e.target.value)} placeholder="1" />
          {errors.study_group && <span className="off-field-error">{errors.study_group}</span>}
        </label>
      </div>

      <h4 className="off-title">Courses and groups for {major} semester {semester}</h4>
      {!available.length && (
        <p className="off-muted off-small">
          No published offering is open to {major} semester {semester} in {term.name}.
          The administrator has to publish them first (Req 27).
        </p>
      )}

      {available.map((offering) => {
        const slots = picked.get(offering._id) ?? new Set();
        return (
          <div className="off-pick" key={offering._id}>
            <div className="off-pick-head">
              <span className="off-mono off-strong">{offering.course_code}</span>
              <span className="off-small off-muted">{offering.course_name}</span>
              {slots.size > 0 && <span className="off-pill off-pill-blue">{slots.size} chosen</span>}
            </div>
            <div className="off-pick-slots">
              {offering.groups.map((slot) => (
                <label className={`off-check${slots.has(slot._id) ? ' off-check-on' : ''}`} key={slot._id}>
                  <input type="checkbox" checked={slots.has(slot._id)} onChange={toggleSlot(offering._id, slot._id)} />
                  <span className={`off-pill off-pill-${TYPE_TONE[slot.type]}`}>{TYPE_LABEL[slot.type]} {slot.group_number}</span>
                  <span className="off-small">{DAY_LABEL[slot.day]} {timeText(slot)} · {slot.room}</span>
                  <span className={`off-pill off-pill-${capacityTone(slot)}`}>{slot.remaining_capacity} left</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div className="off-actions">
        <span className="off-small off-muted off-grow">{chosenCount} slot(s) chosen</span>
        <button type="button" className="off-btn off-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="off-btn" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create standard schedule'}</button>
      </div>
    </form>
  );
}
