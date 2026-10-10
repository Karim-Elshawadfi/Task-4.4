// Advising Student — Req 57: submit or update scheduling preferences (until the advising deadline).
// Advisor / Coordinator — Req 58: pass `studentId` to see a student's latest preferences, in priority order.
import React, { useEffect, useState } from 'react';
import api, { errorMessage, formatDateTime } from '../Catalogue/api';

const TYPES = {
  PREFERRED_DAY: 'Preferred day', AVOIDED_DAY: 'Avoided day', DAY_OFF: 'Desired day off',
  PREFERRED_TIME_RANGE: 'Preferred time range (09:00-12:00)', AVOIDED_TIME_RANGE: 'Avoided time range (09:00-12:00)',
  PREFERRED_GROUP: 'Preferred group', NOTE: 'Note',
};

export default function StudentPreferences({ studentId }) {
  const readOnly = Boolean(studentId); // an advisor/coordinator looks, the student edits
  const [rows, setRows] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const apply = (data) => { setRows(data.preferences); setLastUpdated(data.last_updated); };
  useEffect(() => {
    api.get(readOnly ? `/academic/preferences/${studentId}` : '/academic/preferences').then((r) => apply(r.data))
      .catch((err) => setError(errorMessage(err)));
  }, [studentId]);

  const change = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    setMessage(''); setError('');
    try {
      const { data } = await api.put('/academic/preferences', {
        preferences: rows.map((r, i) => ({ type: r.type, value: r.value, priority: Number(r.priority) || i + 1 })),
      });
      apply(data);
      setMessage('Preferences saved. They are not guaranteed and cannot override academic or scheduling rules.');
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="student-preferences">
      <h3>Scheduling preferences</h3>
      {lastUpdated && <p>Last updated {formatDateTime(lastUpdated)}</p>}
      {readOnly && rows.length === 0 && !error && <p>This student has not submitted any preferences.</p>}
      {rows.map((r, i) => (
        <div key={i} className="preference-row">
          {readOnly ? <span>{r.priority}. {TYPES[r.type]}: {r.value}</span> : (
            <>
              <input type="number" min="1" value={r.priority} onChange={(e) => change(i, { priority: e.target.value })} />
              <select value={r.type} onChange={(e) => change(i, { type: e.target.value })}>
                {Object.entries(TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <input value={r.value} onChange={(e) => change(i, { value: e.target.value })} />
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
            </>
          )}
        </div>
      ))}
      {!readOnly && (
        <>
          <button type="button" onClick={() => setRows([...rows, { type: 'PREFERRED_DAY', value: '', priority: rows.length + 1 }])}>Add preference</button>
          <button type="button" onClick={save}>Save</button>
        </>
      )}
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
