// Req 28: create a standard schedule template for normal students by major, semester and study group
// Req 29: update a standard schedule template
// Req 30: assign or reassign normal students to a standard schedule group
//
// Coordinator page. Administrators and Advisors may open it read-only.
import React, { useEffect, useMemo, useState } from 'react';
import api, { errorMessage, courseStyle } from './api';
import TemplateForm from './TemplateForm';
import GroupStudents from './GroupStudents';
import WeeklyCalendar from './WeeklyCalendar';
import './offerings.css';

const Pill = ({ tone, children }) => <span className={`off-pill off-pill-${tone}`}>{children}</span>;

export default function StandardSchedulesPage({ role = 'COORDINATOR' }) {
  const isCoordinator = role === 'COORDINATOR';
  const [options, setOptions] = useState(null);
  const [termId, setTermId] = useState('');
  const [filters, setFilters] = useState({ major: '', semester: '' });
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | a template
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const term = useMemo(() => options?.terms.find((t) => t._id === termId) ?? null, [options, termId]);

  // Start on the term that is running now (or the next one), not simply the newest one.
  useEffect(() => {
    Promise.all([
      api.get('/templates/options'),
      api.get('/terms/current').catch(() => ({ data: {} })),
    ])
      .then(([options_, current]) => {
        setOptions(options_.data);
        const fallback = options_.data.terms[0]?._id ?? '';
        const running = current.data.term?._id;
        setTermId(options_.data.terms.some((t) => t._id === running) ? running : fallback);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const loadOptions = () => termId && api.get(`/templates/options?term_id=${termId}`).then((r) => setOptions(r.data)).catch(() => {});

  const load = () => {
    if (!termId) return;
    const query = new URLSearchParams({ term_id: termId });
    Object.entries(filters).forEach(([k, v]) => v && query.set(k, v));
    api.get(`/templates?${query}`)
      .then((r) => {
        setTemplates(r.data.templates);
        setSelected((s) => (s ? r.data.templates.find((t) => t._id === s._id) ?? null : null));
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(() => { load(); loadOptions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [termId]);
  useEffect(load, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (run) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await run();
      setMessage(r.data.message);
      if (r.data.template) setSelected(r.data.template);
      load(); loadOptions();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setPublication = (template, published) => act(() => api.put(`/templates/${template._id}/publication`, { published }));

  const remove = async (template) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the standard schedule of ${template.label}?`)) return;
    const ok = await act(() => api.delete(`/templates/${template._id}`));
    if (ok) setSelected(null);
  };

  if (!options) return <div className="off-state">{error || 'Loading…'}</div>;
  if (!options.terms.length) return <div className="off-state">No academic term exists yet. Create one first (Req 16).</div>;

  return (
    <div className="off-page">
      <div className="off-header">
        <div>
          <h2>Standard Schedules</h2>
          <p className="off-muted">
            The weekly schedule every normal student of a major, semester and study group follows.
            A student&apos;s processed schedule is built from the published template of their group.
          </p>
        </div>
        {isCoordinator && !editing && (
          <button className="off-btn" onClick={() => { setEditing('new'); setSelected(null); }}>+ New standard schedule</button>
        )}
      </div>

      {message && <div className="off-success">{message}</div>}
      {error && <div className="off-error">{error}</div>}

      <div className="off-filters">
        <label className="off-field">Academic term
          <select className="off-input" value={termId} onChange={(e) => { setTermId(e.target.value); setSelected(null); setEditing(null); }}>
            {options.terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </label>
        <label className="off-field">Major
          <select className="off-input" value={filters.major} onChange={(e) => setFilters((f) => ({ ...f, major: e.target.value }))}>
            <option value="">All</option>
            {options.majors.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="off-field">Semester
          <select className="off-input" value={filters.semester} onChange={(e) => setFilters((f) => ({ ...f, semester: e.target.value }))}>
            <option value="">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {editing && (
        <TemplateForm
          term={term}
          options={options}
          template={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(text, template) => { setMessage(text); setEditing(null); setSelected(template); load(); loadOptions(); }}
        />
      )}

      <div className="off-table-wrap">
        <table className="off-table off-table-clickable">
          <thead>
            <tr><th>Group</th><th>Courses</th><th>Slots</th><th>Students</th><th>Status</th>{isCoordinator && <th />}</tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr
                key={template._id}
                className={selected?._id === template._id ? 'off-selected' : ''}
                onClick={() => { setSelected(template); setMessage(''); setError(''); }}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(template)}
              >
                <td className="off-strong">{template.label}</td>
                <td className="off-small">
                  {template.courses.map((c) => (
                    <span className="off-code off-mono off-tag" style={courseStyle(c.course_code)} key={c.offering_id}>
                      {c.course_code}
                    </span>
                  ))}
                  {!template.courses.length && <span className="off-muted">No course yet</span>}
                </td>
                <td>{template.total_slots}</td>
                <td>{template.students}</td>
                <td>
                  <Pill tone={template.is_published ? 'green' : 'grey'}>{template.is_published ? 'Published' : 'Draft'}</Pill>
                  {template.warnings?.length > 0 && <Pill tone="red">Needs attention</Pill>}
                </td>
                {isCoordinator && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="off-btn off-btn-ghost off-btn-small" disabled={busy}
                      onClick={() => setPublication(template, !template.is_published)}>
                      {template.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!templates.length && (
              <tr><td colSpan={isCoordinator ? 6 : 5} className="off-state">No standard schedule in this term yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="off-card">
          <div className="off-header">
            <div>
              <h3 className="off-title">{selected.label}</h3>
              <p className="off-muted off-small">
                {selected.courses.length} course(s) · {selected.total_slots} slot(s) · {selected.students} student(s)
              </p>
            </div>
            <div className="off-actions">
              {isCoordinator && <button className="off-btn off-btn-ghost off-btn-small" onClick={() => setEditing(selected)}>Edit</button>}
              {isCoordinator && <button className="off-btn off-btn-danger off-btn-small" disabled={busy} onClick={() => remove(selected)}>Delete</button>}
              <button className="off-btn off-btn-ghost off-btn-small" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>

          {selected.warnings?.length > 0 && (
            <ul className="off-error off-list">{selected.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}

          <WeeklyCalendar
            slots={selected.week.flatMap((d) => d.slots)}
            emptyText="No course has been added to this standard schedule yet."
          />

          {isCoordinator && <GroupStudents template={selected} onChanged={(t) => { setSelected(t); load(); }} />}
        </div>
      )}
    </div>
  );
}
