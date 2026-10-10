// Req 19 (course details) + buttons for Req 20 (edit) and Req 21 (delete).
import React, { useEffect, useState } from 'react';
import api, { errorMessage, formatDateTime, SEASON_LABEL, TYPE_LABEL } from './api';

export default function CourseDetails({ code, onEdit, onDeleted, onClose, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setData(null); setError(''); setConfirming(false);
    api.get(`/catalogue/courses/${encodeURIComponent(code)}`).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  }, [code]);

  const remove = async () => {
    setDeleting(true); setError('');
    try {
      const r = await api.delete(`/catalogue/courses/${encodeURIComponent(code)}`);
      onDeleted(r.data.message);
    } catch (e) { setError(errorMessage(e)); setConfirming(false); } finally { setDeleting(false); }
  };

  if (!data) return <div className="cat-card">{error ? <div className="cat-error">{error}</div> : <div className="cat-state">Loading…</div>}</div>;
  const c = data.course;
  const plan = (c.curriculum || []).map((p) => `${p.major === 'CS' ? 'MET (CS)' : 'DMET'}: semester ${p.semester}`).join(' · ');

  return (
    <div className="cat-card">
      <div className="cat-header">
        <div>
          <h3 className="cat-title"><span className="cat-mono">{c.course_code}</span> {c.course_name}</h3>
          <span className="cat-muted cat-small">Last updated {formatDateTime(c.updated_at)}</span>
        </div>
        <button className="cat-btn cat-btn-ghost cat-btn-small" onClick={onClose} aria-label="Close details">✕</button>
      </div>
      {error && <div className="cat-error">{error}</div>}
      <dl className="cat-details">
        <dt>Credit hours</dt><dd>{c.credit_hours}</dd>
        <dt>Course type</dt><dd>{TYPE_LABEL[c.course_type] || c.course_type}</dd>
        <dt>Faculty / major</dt><dd>{(c.majors || []).map((m) => (m === 'CS' ? 'MET (CS)' : m)).join(', ')}</dd>
        <dt>Recommended semester</dt><dd>{c.recommended_semester}{new Set((c.curriculum || []).map((p) => p.semester)).size > 1 && <span className="cat-muted cat-small"> ({plan})</span>}</dd>
        <dt>Offering season</dt><dd>{SEASON_LABEL[c.offering_season] || c.offering_season}</dd>
        <dt>Prerequisites</dt>
        <dd>{data.prerequisiteDetails.length ? data.prerequisiteDetails.map((p) => (
          <button key={p.code} className="cat-link" onClick={() => onOpen(p.code)}>{p.code}{p.name ? ` – ${p.name}` : ''}</button>
        )) : <span className="cat-muted">None</span>}</dd>
        <dt>Required by</dt>
        <dd>{data.requiredBy.length ? data.requiredBy.map((p) => (
          <button key={p.code} className="cat-link" onClick={() => onOpen(p.code)}>{p.code}</button>
        )) : <span className="cat-muted">No course needs it</span>}</dd>
      </dl>
      <div className="cat-actions">
        {!confirming ? (
          <>
            <button className="cat-btn cat-btn-danger" onClick={() => setConfirming(true)}>Delete</button>
            <button className="cat-btn" onClick={() => onEdit(c)}>Edit</button>
          </>
        ) : (
          <>
            <span>Delete {c.course_code} from the catalogue?</span>
            <button className="cat-btn cat-btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="cat-btn cat-btn-danger-solid" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
          </>
        )}
      </div>
    </div>
  );
}
