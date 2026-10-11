// Req 22: create a course offering and its lecture, tutorial and lab slots
// Req 23: view the offerings of an academic term and open one to see all its details
// Req 25: update an offering or one of its slots
// Req 26: delete an offering or one of its slots
// Req 27: publish or unpublish the offerings of a term
//
// Administrator page. Coordinators and Advisors may open it read-only; the buttons that
// change something are hidden for them and the API refuses them anyway.
import React, { useEffect, useMemo, useState } from 'react';
import api, { errorMessage, TYPE_LABEL, TYPE_TONE, DAY_LABEL, capacityTone, timeText, courseStyle } from './api';
import OfferingForm from './OfferingForm';
import WeeklyCalendar from './WeeklyCalendar';
import './offerings.css';

const Pill = ({ tone, children }) => <span className={`off-pill off-pill-${tone}`}>{children}</span>;

export default function CourseOfferingsPage({ role = 'ADMIN' }) {
  const isAdmin = role === 'ADMIN';
  const [options, setOptions] = useState(null);
  const [termId, setTermId] = useState('');
  const [filters, setFilters] = useState({ search: '', major: '', semester: '', published: '' });
  const [offerings, setOfferings] = useState([]);
  const [selected, setSelected] = useState(null); // the opened offering (Req 23)
  const [editing, setEditing] = useState(null); //  null | 'new' | an offering
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const term = useMemo(() => options?.terms.find((t) => t._id === termId) ?? null, [options, termId]);

  // Start on the term that is running now (or the next one), not simply the newest one.
  useEffect(() => {
    Promise.all([
      api.get('/offerings/options'),
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

  const loadOptions = () => termId && api.get(`/offerings/options?term_id=${termId}`).then((r) => setOptions(r.data)).catch(() => {});

  const load = () => {
    if (!termId) return;
    const query = new URLSearchParams({ term_id: termId });
    Object.entries(filters).forEach(([k, v]) => v && query.set(k, v));
    api.get(`/offerings?${query}`)
      .then((r) => setOfferings(r.data.offerings))
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(() => { load(); loadOptions(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [termId]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters]);

  const open = (offering) => {
    setMessage(''); setError('');
    api.get(`/offerings/${offering._id}`)
      .then((r) => setSelected({ ...r.data.offering, usedBy: r.data.usedBy, course: r.data.course }))
      .catch((e) => setError(errorMessage(e)));
  };

  const afterChange = (text) => { setMessage(text); setError(''); setEditing(null); load(); loadOptions(); };

  const act = async (run) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await run();
      setMessage(r.data.message);
      if (r.data.offering) setSelected((s) => (s && s._id === r.data.offering._id ? { ...r.data.offering, usedBy: s.usedBy } : s));
      load(); loadOptions();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setPublication = (offering, published) => act(() => api.put(`/offerings/${offering._id}/publication`, { published }));
  const publishTerm = (published) => act(() => api.put('/offerings/publication', { term_id: termId, published }));

  const removeOffering = async (offering) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the ${offering.course_code} offering of ${term?.name}?`)) return;
    const ok = await act(() => api.delete(`/offerings/${offering._id}`));
    if (ok) setSelected(null);
  };

  const removeSlot = async (offering, slot) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete ${TYPE_LABEL[slot.type]} ${slot.group_number} of ${offering.course_code}?`)) return;
    await act(() => api.delete(`/offerings/${offering._id}/slots/${slot._id}`));
  };

  if (!options) return <div className="off-state">{error || 'Loading…'}</div>;
  if (!options.terms.length) return <div className="off-state">No academic term exists yet. Create one first (Req 16).</div>;

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="off-page">
      <div className="off-header">
        <div>
          <h2>Course Offerings</h2>
          <p className="off-muted">
            What is actually taught in a term: the lecture, tutorial and lab groups of each course,
            with their rooms and remaining seats. Only published offerings can be put in a schedule.
          </p>
        </div>
        {isAdmin && !editing && (
          <button className="off-btn" onClick={() => { setEditing('new'); setSelected(null); }}>+ New offering</button>
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
        <label className="off-field off-grow">Search
          <input className="off-input" value={filters.search} placeholder="Course code, name or instructor" onChange={set('search')} />
        </label>
        <label className="off-field">Major
          <select className="off-input" value={filters.major} onChange={set('major')}>
            <option value="">All</option>
            {options.majors.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="off-field">Semester
          <select className="off-input" value={filters.semester} onChange={set('semester')}>
            <option value="">All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="off-field">Status
          <select className="off-input" value={filters.published} onChange={set('published')}>
            <option value="">All</option>
            <option value="true">Published</option>
            <option value="false">Draft</option>
          </select>
        </label>
      </div>

      {isAdmin && (
        <div className="off-actions off-actions-left">
          <button className="off-btn off-btn-ghost off-btn-small" disabled={busy} onClick={() => publishTerm(true)}>
            Publish all in {term?.name}
          </button>
          <button className="off-btn off-btn-ghost off-btn-small" disabled={busy} onClick={() => publishTerm(false)}>
            Unpublish all
          </button>
        </div>
      )}

      {editing && (
        <OfferingForm
          term={term}
          options={options}
          offering={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(text, offering) => { afterChange(text); setSelected(offering); }}
        />
      )}

      <p className="off-count off-muted off-small">
        {offerings.length} offering(s), {offerings.filter((o) => o.is_published).length} published
      </p>

      <div className="off-table-wrap">
        <table className="off-table off-table-clickable">
          <thead>
            <tr>
              <th>Course</th><th>Instructor(s)</th><th>Eligible groups</th>
              <th>Groups</th><th>Seats</th><th>Status</th>{isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {offerings.map((offering) => (
              <tr
                key={offering._id}
                className={selected?._id === offering._id ? 'off-selected' : ''}
                onClick={() => open(offering)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && open(offering)}
              >
                <td>
                  <div className="off-code off-mono" style={courseStyle(offering.course_code)}>{offering.course_code}</div>
                  <div className="off-small off-muted">{offering.course_name}</div>
                </td>
                <td className="off-small">{offering.instructors.join(', ') || <span className="off-muted">—</span>}</td>
                <td className="off-small">
                  {offering.eligible_groups.map((g) => <Pill tone="grey" key={`${g.major}${g.semester}`}>{g.major} {g.semester}</Pill>)}
                </td>
                <td className="off-small">
                  {['LECTURE', 'TUTORIAL', 'LAB'].map((type) => {
                    const n = offering.groups.filter((g) => g.type === type).length;
                    return n ? <Pill tone={TYPE_TONE[type]} key={type}>{n} {TYPE_LABEL[type].toLowerCase()}{n > 1 ? 's' : ''}</Pill> : null;
                  })}
                </td>
                <td className="off-small off-strong">{offering.total_assigned}/{offering.total_capacity}</td>
                <td>
                  <Pill tone={offering.is_published ? 'green' : 'grey'}>{offering.is_published ? 'Published' : 'Draft'}</Pill>
                </td>
                {isAdmin && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="off-btn off-btn-ghost off-btn-small" disabled={busy}
                      onClick={() => setPublication(offering, !offering.is_published)}>
                      {offering.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!offerings.length && (
              <tr><td colSpan={isAdmin ? 7 : 6} className="off-state">No offering matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="off-card">
          <div className="off-header">
            <div>
              <h3 className="off-title">{selected.course_code} — {selected.course_name}</h3>
              <p className="off-muted off-small">
                {selected.season} {selected.academic_year} ·{' '}
                {selected.instructors.join(', ') || 'no instructor yet'} ·{' '}
                {selected.total_assigned}/{selected.total_capacity} seats taken
              </p>
            </div>
            <div className="off-actions">
              {isAdmin && <button className="off-btn off-btn-ghost off-btn-small" onClick={() => setEditing(selected)}>Edit</button>}
              {isAdmin && <button className="off-btn off-btn-danger off-btn-small" disabled={busy} onClick={() => removeOffering(selected)}>Delete</button>}
              <button className="off-btn off-btn-ghost off-btn-small" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>

          {Boolean(selected.usedBy?.templates?.length) && (
            <p className="off-small off-muted">
              Used by the standard schedule of{' '}
              {selected.usedBy.templates.map((t) => `${t.major} semester ${t.semester} group ${t.study_group}`).join(', ')}
              {selected.usedBy.students ? ` · ${selected.usedBy.students} student(s)` : ''}
            </p>
          )}

          <table className="off-table">
            <thead>
              <tr><th>Type</th><th>Group</th><th>Day</th><th>Time</th><th>Room</th><th>Seats</th><th>Remaining</th>{isAdmin && <th />}</tr>
            </thead>
            <tbody>
              {selected.groups.map((slot) => (
                <tr key={slot._id}>
                  <td><Pill tone={TYPE_TONE[slot.type]}>{TYPE_LABEL[slot.type]}</Pill></td>
                  <td className="off-strong">{slot.group_number}</td>
                  <td>{DAY_LABEL[slot.day]}</td>
                  <td className="off-mono">{timeText(slot)}</td>
                  <td className="off-mono">{slot.room}</td>
                  <td>{slot.assigned_count}/{slot.max_capacity}</td>
                  <td><Pill tone={capacityTone(slot)}>{slot.remaining_capacity} left</Pill></td>
                  {isAdmin && (
                    <td>
                      <button className="off-btn off-btn-danger off-btn-small" disabled={busy || slot.assigned_count > 0}
                        title={slot.assigned_count > 0 ? 'Students are assigned to this group' : 'Delete this slot'}
                        onClick={() => removeSlot(selected, slot)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              {!selected.groups.length && <tr><td colSpan={isAdmin ? 8 : 7} className="off-state">This offering has no groups yet.</td></tr>}
            </tbody>
          </table>

          <h4 className="off-title">Weekly view</h4>
          <WeeklyCalendar
            slots={selected.groups.map((g) => ({ ...g, course_code: selected.course_code }))}
            labelBy="group"
            offLabel=""
            emptyText="This offering has no groups yet."
          />
        </div>
      )}
    </div>
  );
}
