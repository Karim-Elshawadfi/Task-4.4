// Req 128: import many courses from a CSV file.
// Step 1 "Check file" validates every row (nothing is saved) and shows row-level errors.
// Step 2 "Import" is only possible when the whole file is valid: all rows are saved, or none.
import React, { useState } from 'react';
import api, { errorMessage } from './api';

const COLUMNS = 'course_code, course_name, credit_hours, course_type, faculty/major, recommended_semester, offering_season, prerequisites';
const EXAMPLE = `${COLUMNS.replace(/, /g, ',')}\nCSEN 1067,Deep Learning,4,elective,CS;DMET,9,both,CSEN 1061\nCSEN 301,Data Structures and Algorithms,6,core,both,3,winter,CSEN 102;CSEN 202`;

export default function CsvImport({ onDone, onCancel }) {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [check, setCheck] = useState(null); // { ok, message, errors, rows }
  const [busy, setBusy] = useState(false);

  const choose = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null); setCheck(null); setText('');
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setCheck({ ok: false, message: 'Please choose a .csv file', errors: [] }); return; }
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result));
    reader.readAsText(f);
  };

  const send = async (dryRun) => {
    setBusy(true);
    try {
      const r = await api.post('/catalogue/courses/import', { csv: text, dryRun });
      if (dryRun) setCheck({ ok: true, ...r.data });
      else onDone(r.data.message);
    } catch (e) {
      setCheck({ ok: false, message: errorMessage(e), errors: e?.response?.data?.errors || [] });
    } finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([EXAMPLE], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'course-import-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="cat-card">
      <h3>Import courses from CSV</h3>
      <p className="cat-muted cat-small">
        Required columns: {COLUMNS}. Use <code>;</code> between several majors or prerequisites (e.g. <code>CS;DMET</code>).
        New course codes are created and existing codes are updated. If any row is invalid, nothing is imported.
      </p>
      <div className="cat-actions cat-actions-left">
        <input type="file" accept=".csv,text/csv" onChange={choose} aria-label="CSV file" />
        <button type="button" className="cat-btn cat-btn-ghost cat-btn-small" onClick={downloadTemplate}>Download template</button>
      </div>

      {check && (
        check.ok ? (
          <>
            <div className="cat-success">{check.message}</div>
            <div className="cat-table-wrap cat-preview"><table className="cat-table">
              <thead><tr><th>Row</th><th>Action</th><th>Code</th><th>Name</th><th>Hours</th><th>Type</th><th>Major</th><th>Sem.</th><th>Season</th><th>Prerequisites</th></tr></thead>
              <tbody>{check.rows.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td><td><span className={`cat-pill cat-pill-${r.action === 'create' ? 'green' : 'blue'}`}>{r.action === 'create' ? 'New' : 'Update'}</span></td>
                  <td className="cat-mono">{r.course_code}</td><td>{r.course_name}</td><td>{r.credit_hours}</td><td>{r.course_type}</td>
                  <td>{r.majors.join(', ')}</td><td>{r.recommended_semester}</td><td>{r.offering_season}</td><td>{r.prerequisites.join(', ') || '—'}</td>
                </tr>))}
              </tbody>
            </table></div>
          </>
        ) : (
          <div className="cat-error">
            <strong>{check.message}</strong>
            {check.errors.length > 0 && (
              <div className="cat-table-wrap"><table className="cat-table cat-table-errors">
                <thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
                <tbody>{check.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.column || '—'}</td><td>{e.message}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        )
      )}

      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cat-btn cat-btn-ghost" disabled={!text || busy} onClick={() => send(true)}>{busy && !check ? 'Checking…' : 'Check file'}</button>
        <button type="button" className="cat-btn" disabled={!check?.ok || busy} onClick={() => send(false)}>{busy && check?.ok ? 'Importing…' : 'Import'}</button>
      </div>
      {file && !check && <p className="cat-muted cat-small">Selected: {file.name}. Click "Check file" first.</p>}
    </div>
  );
}
