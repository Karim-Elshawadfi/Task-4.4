// Req 16: create an academic term with its registration and advising-season dates
// Req 17: update a term and its dates
import React, { useEffect, useState } from 'react';
import api, { errorMessage, fieldErrors, formatDay, formatDateTime, fromInput, toDateInput, toDateTimeInput, SEASON_LABEL } from './api';
import './catalogue.css';

const DATE_FIELDS = [
  { key: 'term_start', label: 'Term start', type: 'date' },
  { key: 'term_end', label: 'Term end', type: 'date' },
  { key: 'teaching_start', label: 'Teaching start', type: 'date' },
  { key: 'teaching_end', label: 'Teaching end', type: 'date' },
  { key: 'advising_deadline', label: 'Advising deadline', type: 'datetime-local' },
  { key: 'swap_deadline', label: 'Whole-schedule swap deadline (normal students)', type: 'datetime-local' },
];
const thisYear = new Date().getFullYear();
const EMPTY = { academic_year: `${thisYear}/${thisYear + 1}`, season: 'WINTER', ...Object.fromEntries(DATE_FIELDS.map((f) => [f.key, ''])) };

const PHASE = { RUNNING: ['Running', 'green'], UPCOMING: ['Upcoming', 'blue'], FINISHED: ['Finished', 'grey'] };
const Pill = ({ children, tone }) => <span className={`cat-pill cat-pill-${tone}`}>{children}</span>;

export default function TermsPage() {
  const [terms, setTerms] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, 'new' or a term id
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/terms').then((r) => setTerms(r.data.terms)).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setErrors({}); setMessage(''); setEditing('new'); };
  const openEdit = (t) => {
    setForm({
      academic_year: t.academic_year,
      season: t.season,
      ...Object.fromEntries(DATE_FIELDS.map((f) => [f.key, f.type === 'date' ? toDateInput(t[f.key]) : toDateTimeInput(t[f.key])])),
    });
    setErrors({}); setMessage(''); setEditing(t._id);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setMessage(''); setError('');
    const body = { academic_year: form.academic_year, season: form.season };
    DATE_FIELDS.forEach((f) => { body[f.key] = fromInput(form[f.key]); });
    try {
      const r = editing === 'new' ? await api.post('/terms', body) : await api.put(`/terms/${editing}`, body);
      setMessage(r.data.message); setEditing(null); load();
    } catch (err) {
      setErrors(fieldErrors(err)); setError(errorMessage(err));
    } finally { setSaving(false); }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="cat-page">
      <div className="cat-header">
        <div>
          <h2>Academic Terms</h2>
          <p className="cat-muted">Registration and advising-season dates. Actions are blocked after their deadline.</p>
        </div>
        {!editing && <button className="cat-btn" onClick={openNew}>+ New term</button>}
      </div>
      {message && <div className="cat-success">{message}</div>}
      {error && !editing && <div className="cat-error">{error}</div>}

      {editing && (
        <form className="cat-card" onSubmit={save} noValidate>
          <h3>{editing === 'new' ? 'Create academic term' : `Edit ${form.season.charAt(0) + form.season.slice(1).toLowerCase()} ${form.academic_year}`}</h3>
          {error && <div className="cat-error">{error}</div>}
          <div className="cat-grid">
            <label className="cat-field">Academic year
              <input className="cat-input" value={form.academic_year} onChange={set('academic_year')} placeholder="2026/2027" />
              {errors.academic_year && <span className="cat-field-error">{errors.academic_year}</span>}
            </label>
            <label className="cat-field">Season
              <select className="cat-input" value={form.season} onChange={set('season')}>
                <option value="WINTER">Winter</option><option value="SPRING">Spring</option><option value="SUMMER">Summer</option>
              </select>
              {errors.season && <span className="cat-field-error">{errors.season}</span>}
            </label>
            {DATE_FIELDS.map((f) => (
              <label className="cat-field" key={f.key}>{f.label}
                <input className="cat-input" type={f.type} value={form[f.key]} onChange={set(f.key)} />
                {errors[f.key] && <span className="cat-field-error">{errors[f.key]}</span>}
              </label>
            ))}
          </div>
          <div className="cat-actions">
            <button type="button" className="cat-btn cat-btn-ghost" onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
            <button className="cat-btn" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Create term' : 'Save changes'}</button>
          </div>
        </form>
      )}

      <div className="cat-card">
        {!terms ? <div className="cat-state">Loading terms…</div> : terms.length === 0 ? (
          <div className="cat-state">No academic terms yet. Create the first one.</div>
        ) : (
          <div className="cat-table-wrap"><table className="cat-table">
            <thead><tr><th>Term</th><th>Term dates</th><th>Teaching</th><th>Advising deadline</th><th>Swap deadline</th><th>Status</th><th></th></tr></thead>
            <tbody>{terms.map((t) => (
              <tr key={t._id}>
                <td className="cat-strong">{SEASON_LABEL[t.season]} {t.academic_year}</td>
                <td>{formatDay(t.term_start)} – {formatDay(t.term_end)}</td>
                <td>{formatDay(t.teaching_start)} – {formatDay(t.teaching_end)}</td>
                <td>{formatDateTime(t.advising_deadline)}<br />{t.status.advisingOpen ? <Pill tone="green">Open</Pill> : <Pill tone="red">Closed</Pill>}</td>
                <td>{formatDateTime(t.swap_deadline)}<br />{t.status.swapOpen ? <Pill tone="green">Open</Pill> : <Pill tone="red">Closed</Pill>}</td>
                <td><Pill tone={PHASE[t.status.phase][1]}>{PHASE[t.status.phase][0]}</Pill></td>
                <td><button className="cat-btn cat-btn-small cat-btn-ghost" onClick={() => openEdit(t)}>Edit</button></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
