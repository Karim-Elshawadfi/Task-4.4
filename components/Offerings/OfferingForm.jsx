// Req 22: create a course offering and its lecture, tutorial and lab slots
// Req 25: update an offering or one of its slots
//
// The same form does both. On an update the course and the term are shown but locked,
// because other records point at them.
import React, { useState } from 'react';
import api, { errorMessage, fieldErrors, DAYS, DAY_LABEL, TYPE_LABEL } from './api';

const MAJORS = ['CS', 'DMET'];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const EMPTY_SLOT = {
  type: 'LECTURE', group_number: '', day: 'SATURDAY',
  start_time: '08:15', end_time: '09:45', room: '', max_capacity: 60,
};

export default function OfferingForm({ term, options, offering, onSaved, onCancel }) {
  const editing = Boolean(offering);
  const [courseCode, setCourseCode] = useState(offering?.course_code ?? '');
  const [instructors, setInstructors] = useState((offering?.instructors ?? []).join(', '));
  const [eligible, setEligible] = useState(offering?.eligible_groups ?? [{ major: 'CS', semester: 3 }]);
  const [slots, setSlots] = useState(offering?.groups ?? []);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [clashes, setClashes] = useState([]);
  const [saving, setSaving] = useState(false);

  const setSlot = (index, key) => (e) =>
    setSlots((list) => list.map((s, i) => (i === index ? { ...s, [key]: e.target.value } : s)));

  const useGucSlot = (index) => (e) => {
    const chosen = options.gucSlots.find((s) => String(s.slot) === e.target.value);
    if (!chosen) return;
    setSlots((list) => list.map((s, i) => (i === index ? { ...s, start_time: chosen.start_time, end_time: chosen.end_time } : s)));
  };

  const toggleGroup = (major, semester) => () =>
    setEligible((list) => (list.some((g) => g.major === major && Number(g.semester) === semester)
      ? list.filter((g) => !(g.major === major && Number(g.semester) === semester))
      : [...list, { major, semester }]));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setError(''); setClashes([]);
    const body = {
      term_id: term._id,
      course_code: courseCode,
      instructors: instructors.split(/[;,]/).map((s) => s.trim()).filter(Boolean),
      eligible_groups: eligible,
      groups: slots.map((s) => ({ ...s, max_capacity: Number(s.max_capacity) })),
    };
    try {
      const r = editing ? await api.put(`/offerings/${offering._id}`, body) : await api.post('/offerings', body);
      onSaved(r.data.message, r.data.offering);
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors(fields);
      setClashes(Array.isArray(fields.clashes) ? fields.clashes : []);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="off-card" onSubmit={save} noValidate>
      <h3>{editing ? `Edit ${offering.course_code}` : 'New course offering'} — {term.name}</h3>
      {error && <div className="off-error">{error}</div>}
      {clashes.length > 1 && (
        <ul className="off-error off-list">{clashes.map((c) => <li key={c}>{c}</li>)}</ul>
      )}

      <div className="off-grid">
        <label className="off-field">Course
          {editing ? (
            <input className="off-input" value={`${offering.course_code} — ${offering.course_name}`} disabled />
          ) : (
            <select className="off-input" value={courseCode} onChange={(e) => setCourseCode(e.target.value)}>
              <option value="">Choose a course…</option>
              {options.courses.map((c) => (
                <option key={c.course_code} value={c.course_code} disabled={c.already_offered}>
                  {c.course_code} — {c.course_name}{c.already_offered ? ' (already offered)' : ''}
                </option>
              ))}
            </select>
          )}
          {errors.course_code && <span className="off-field-error">{errors.course_code}</span>}
        </label>

        <label className="off-field off-span-2">Instructor(s)
          <input
            className="off-input" value={instructors} placeholder="Dr. Amr Hassan, Dr. Mona Adel"
            onChange={(e) => setInstructors(e.target.value)}
          />
          {errors.instructors && <span className="off-field-error">{errors.instructors}</span>}
        </label>
      </div>

      <fieldset className="off-fieldset">
        <legend>Eligible major and semester groups</legend>
        <div className="off-eligible">
          {MAJORS.map((major) => (
            <div key={major}>
              <span className="off-strong">{major}</span>
              <div className="off-eligible-row">
                {SEMESTERS.map((semester) => {
                  const on = eligible.some((g) => g.major === major && Number(g.semester) === semester);
                  return (
                    <button
                      type="button" key={semester} onClick={toggleGroup(major, semester)}
                      className={`off-chip${on ? ' off-chip-on' : ''}`}
                      aria-pressed={on}
                    >{semester}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {errors.eligible_groups && <span className="off-field-error">{errors.eligible_groups}</span>}
      </fieldset>

      <h4 className="off-title">Lecture, tutorial and lab groups</h4>
      {errors.groups_duplicate && <div className="off-error">{errors.groups_duplicate}</div>}
      {!slots.length && <p className="off-muted off-small">No groups yet. An offering can be saved as a draft and published once its groups are in.</p>}

      <div className="off-table-wrap">
        {slots.length > 0 && (
          <table className="off-table">
            <thead>
              <tr>
                <th>Type</th><th>Group</th><th>Day</th><th>GUC slot</th>
                <th>Start</th><th>End</th><th>Room</th><th>Capacity</th><th>Seated</th><th />
              </tr>
            </thead>
            <tbody>
              {slots.map((slot, index) => {
                const rowErrors = errors.groups?.[index] ?? {};
                return (
                  <tr key={slot._id ?? index}>
                    <td>
                      <select className="off-input off-input-small" value={slot.type} onChange={setSlot(index, 'type')}>
                        {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {rowErrors.type && <span className="off-field-error">{rowErrors.type}</span>}
                    </td>
                    <td>
                      <input className="off-input off-input-tiny" value={slot.group_number} onChange={setSlot(index, 'group_number')} />
                      {rowErrors.group_number && <span className="off-field-error">{rowErrors.group_number}</span>}
                    </td>
                    <td>
                      <select className="off-input off-input-small" value={slot.day} onChange={setSlot(index, 'day')}>
                        {DAYS.map((d) => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
                      </select>
                      {rowErrors.day && <span className="off-field-error">{rowErrors.day}</span>}
                    </td>
                    <td>
                      <select className="off-input off-input-tiny" value="" onChange={useGucSlot(index)}>
                        <option value="">—</option>
                        {options.gucSlots.map((s) => <option key={s.slot} value={s.slot}>{s.slot}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="off-input off-input-tiny" type="time" value={slot.start_time} onChange={setSlot(index, 'start_time')} />
                      {rowErrors.start_time && <span className="off-field-error">{rowErrors.start_time}</span>}
                    </td>
                    <td>
                      <input className="off-input off-input-tiny" type="time" value={slot.end_time} onChange={setSlot(index, 'end_time')} />
                      {rowErrors.end_time && <span className="off-field-error">{rowErrors.end_time}</span>}
                    </td>
                    <td>
                      <input className="off-input off-input-small" list="off-rooms" value={slot.room} onChange={setSlot(index, 'room')} />
                      {rowErrors.room && <span className="off-field-error">{rowErrors.room}</span>}
                    </td>
                    <td>
                      <input className="off-input off-input-tiny" type="number" min="1" value={slot.max_capacity} onChange={setSlot(index, 'max_capacity')} />
                      {rowErrors.max_capacity && <span className="off-field-error">{rowErrors.max_capacity}</span>}
                    </td>
                    <td className="off-small off-muted">{slot.assigned_count ?? 0}</td>
                    <td>
                      <button
                        type="button" className="off-btn off-btn-danger off-btn-small"
                        disabled={Number(slot.assigned_count ?? 0) > 0}
                        title={Number(slot.assigned_count ?? 0) > 0 ? 'Students are assigned to this group' : 'Remove this group'}
                        onClick={() => setSlots((list) => list.filter((_, i) => i !== index))}
                      >Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <datalist id="off-rooms">{options.rooms.map((r) => <option key={r} value={r} />)}</datalist>

      <div className="off-actions off-actions-left">
        <button type="button" className="off-btn off-btn-ghost" onClick={() => setSlots((l) => [...l, { ...EMPTY_SLOT }])}>
          + Add a group
        </button>
      </div>

      <div className="off-actions">
        <button type="button" className="off-btn off-btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="off-btn" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create offering'}</button>
      </div>
    </form>
  );
}
