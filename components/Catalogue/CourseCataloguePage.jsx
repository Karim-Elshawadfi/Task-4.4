// Req 19: view the course catalogue (search + filters) and open a course's details.
// From here the Administrator adds (18), edits (20), deletes (21) and imports courses from CSV (128).
import React, { useCallback, useEffect, useState } from 'react';
import api, { errorMessage, SEASON_LABEL, TYPE_LABEL } from './api';
import CourseForm from './CourseForm';
import CourseDetails from './CourseDetails';
import CsvImport from './CsvImport';
import './catalogue.css';

const EMPTY_FILTERS = { search: '', major: '', type: '', semester: '', season: '' };

export default function CourseCataloguePage() {
  const [courses, setCourses] = useState(null);
  const [all, setAll] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [panel, setPanel] = useState(null); // { kind: 'details'|'form'|'import', code?, course? }

  const load = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const [filtered, everything] = await Promise.all([
        api.get('/catalogue/courses', { params }),
        api.get('/catalogue/courses'),
      ]);
      setCourses(filtered.data.courses); setAll(everything.data.courses); setError('');
    } catch (e) { setError(errorMessage(e)); }
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const done = (msg, code) => { setMessage(msg); setPanel(code ? { kind: 'details', code } : null); load(); };
  const active = Object.values(filters).filter(Boolean).length;

  return (
    <div className="cat-page">
      <div className="cat-header">
        <div>
          <h2>Course Catalogue</h2>
          <p className="cat-muted">All MET (CS) and DMET courses, including electives. Select a course to see its details.</p>
        </div>
        <div className="cat-actions">
          <button className="cat-btn cat-btn-ghost" onClick={() => { setMessage(''); setPanel({ kind: 'import' }); }}>Import CSV</button>
          <button className="cat-btn" onClick={() => { setMessage(''); setPanel({ kind: 'form' }); }}>+ Add course</button>
        </div>
      </div>
      {message && <div className="cat-success">{message}</div>}
      {error && <div className="cat-error">{error}</div>}

      {panel?.kind === 'import' && <CsvImport onDone={(m) => done(m)} onCancel={() => setPanel(null)} />}
      {panel?.kind === 'form' && (
        <CourseForm course={panel.course} allCourses={all}
          onSaved={(m, c) => done(m, c?.course_code)} onCancel={() => setPanel(panel.course ? { kind: 'details', code: panel.course.course_code } : null)} />
      )}
      {panel?.kind === 'details' && (
        <CourseDetails code={panel.code} onClose={() => setPanel(null)} onOpen={(code) => setPanel({ kind: 'details', code })}
          onEdit={(course) => { setMessage(''); setPanel({ kind: 'form', course }); }} onDeleted={(m) => done(m)} />
      )}

      <div className="cat-card cat-filters">
        <input className="cat-input cat-grow" placeholder="Search by code or name" value={filters.search} onChange={set('search')} aria-label="Search courses" />
        <select className="cat-input" value={filters.major} onChange={set('major')} aria-label="Major">
          <option value="">All majors</option><option value="CS">MET (CS)</option><option value="DMET">DMET</option>
        </select>
        <select className="cat-input" value={filters.type} onChange={set('type')} aria-label="Type">
          <option value="">All types</option><option value="CORE">Core</option><option value="ELECTIVE">Elective</option><option value="HUMA">Humanities</option>
        </select>
        <select className="cat-input" value={filters.semester} onChange={set('semester')} aria-label="Semester">
          <option value="">All semesters</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>Semester {s}</option>)}
        </select>
        <select className="cat-input" value={filters.season} onChange={set('season')} aria-label="Season">
          <option value="">All seasons</option><option value="WINTER">Winter</option><option value="SPRING">Spring</option><option value="SUMMER">Summer</option><option value="BOTH">Winter & Spring</option>
        </select>
        <button className="cat-btn cat-btn-ghost" disabled={!active} onClick={() => setFilters(EMPTY_FILTERS)}>Clear{active ? ` (${active})` : ''}</button>
      </div>

      <div className="cat-card">
        {!courses ? <div className="cat-state">Loading courses…</div> : (
          <>
            <div className="cat-muted cat-small cat-count">{courses.length} course{courses.length === 1 ? '' : 's'}</div>
            {courses.length === 0 ? <div className="cat-state">No courses match your search or filters.</div> : (
              <div className="cat-table-wrap"><table className="cat-table cat-table-clickable">
                <thead><tr><th>Code</th><th>Name</th><th>Hours</th><th>Type</th><th>Major</th><th>Sem.</th><th>Season</th><th>Prerequisites</th></tr></thead>
                <tbody>{courses.map((c) => (
                  <tr key={c.course_code} tabIndex={0} className={panel?.code === c.course_code ? 'cat-selected' : ''}
                    onClick={() => { setMessage(''); setPanel({ kind: 'details', code: c.course_code }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') setPanel({ kind: 'details', code: c.course_code }); }}>
                    <td className="cat-mono">{c.course_code}</td><td>{c.course_name}</td><td>{c.credit_hours}</td>
                    <td><span className={`cat-pill cat-pill-${c.course_type === 'CORE' ? 'blue' : c.course_type === 'ELECTIVE' ? 'green' : 'amber'}`}>{TYPE_LABEL[c.course_type]}</span></td>
                    <td>{(c.majors || []).join(', ')}</td><td>{c.recommended_semester}</td><td>{SEASON_LABEL[c.offering_season]}</td>
                    <td className="cat-small">{(c.prerequisites || []).join(', ') || <span className="cat-muted">—</span>}</td>
                  </tr>))}
                </tbody>
              </table></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
