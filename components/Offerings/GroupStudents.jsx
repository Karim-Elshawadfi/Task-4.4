// Req 30: assign or reassign normal students to a standard schedule group.
// The list shows every normal student of the group's major and semester, and which group
// they are in now, so a reassignment is one click. The processed schedule of a student
// comes from the published template of the group they end up in.
import React, { useEffect, useState } from 'react';
import api, { errorMessage } from './api';

export default function GroupStudents({ template, onChanged }) {
  const [candidates, setCandidates] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [skipped, setSkipped] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get(`/templates/${template._id}/candidates`)
      .then((r) => { setCandidates(r.data.candidates); setChosen(new Set()); })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, [template._id]);

  const toggle = (id) => () =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const assign = async () => {
    setBusy(true); setError(''); setMessage(''); setSkipped([]);
    try {
      const r = await api.post(`/templates/${template._id}/students`, { student_ids: [...chosen] });
      setMessage(r.data.message);
      setSkipped(r.data.skipped);
      load();
      onChanged?.(r.data.template);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (studentId) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await api.delete(`/templates/${template._id}/students/${studentId}`);
      setMessage(r.data.message);
      load();
      onChanged?.(r.data.template);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!candidates) return <p className="off-muted off-small">{error || 'Loading students…'}</p>;

  const inGroup = candidates.filter((c) => c.in_this_group);
  const others = candidates.filter((c) => !c.in_this_group);

  return (
    <div>
      <h4 className="off-title">Students in {template.label}</h4>
      {message && <div className="off-success">{message}</div>}
      {error && <div className="off-error">{error}</div>}
      {skipped.length > 0 && (
        <ul className="off-error off-list">
          {skipped.map((s) => <li key={s.student_id}>{s.reason}</li>)}
        </ul>
      )}

      {!template.is_published && (
        <p className="off-muted off-small">
          This standard schedule is still a draft. Publish it before assigning students.
        </p>
      )}

      <table className="off-table">
        <thead>
          <tr><th /><th>Student ID</th><th>Name</th><th>GUC email</th><th>Current group</th><th /></tr>
        </thead>
        <tbody>
          {inGroup.map((c) => (
            <tr key={c.student_id}>
              <td />
              <td className="off-mono">{c.guc_student_id}</td>
              <td>{c.full_name}</td>
              <td className="off-small off-muted">{c.guc_email}</td>
              <td><span className="off-pill off-pill-green">This group</span></td>
              <td>
                <button className="off-btn off-btn-danger off-btn-small" disabled={busy} onClick={() => remove(c.student_id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {others.map((c) => (
            <tr key={c.student_id}>
              <td>
                <input
                  type="checkbox" checked={chosen.has(c.student_id)} onChange={toggle(c.student_id)}
                  disabled={!template.is_published} aria-label={`Assign ${c.full_name}`}
                />
              </td>
              <td className="off-mono">{c.guc_student_id}</td>
              <td>
                {c.full_name}
                {c.account_status !== 'ACTIVE' && <span className="off-pill off-pill-grey">Deactivated</span>}
              </td>
              <td className="off-small off-muted">{c.guc_email}</td>
              <td>
                {c.current_group
                  ? <span className="off-pill off-pill-amber">Group {c.current_group}</span>
                  : <span className="off-muted off-small">Not assigned</span>}
              </td>
              <td />
            </tr>
          ))}
          {!candidates.length && (
            <tr><td colSpan="6" className="off-state">No normal student is in {template.major} semester {template.semester}.</td></tr>
          )}
        </tbody>
      </table>

      <div className="off-actions">
        <button className="off-btn" disabled={busy || !chosen.size || !template.is_published} onClick={assign}>
          {busy ? 'Working…' : `Assign ${chosen.size || ''} student(s) to this group`}
        </button>
      </div>
    </div>
  );
}
