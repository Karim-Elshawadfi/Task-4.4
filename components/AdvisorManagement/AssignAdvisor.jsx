// Coordinator — Req 14: assign or reassign an advisor to an Advising Student.
import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../Catalogue/api';

export default function AssignAdvisor() {
  const [advisors, setAdvisors] = useState([]);
  const [studentNumber, setStudentNumber] = useState('');
  const [advisorId, setAdvisorId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/advisors').then((r) => setAdvisors(r.data.filter((a) => a.advising_active && a.account_status === 'ACTIVE')))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const assign = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const { data } = await api.post('/advisors/assign', { guc_student_id: studentNumber.trim(), advisorId });
      setMessage(`${data.message} ${data.advisor.full_name} is now advising ${data.student.guc_student_id}.`);
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <form className="assign-advisor" onSubmit={assign}>
      <h3>Assign advisor to student</h3>
      <input placeholder="Student ID (e.g. 52-1001)" value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required />
      <select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)} required>
        <option value="">Choose an advisor…</option>
        {advisors.map((a) => <option key={a.id} value={a.id}>{a.full_name} ({a.guc_email})</option>)}
      </select>
      <button type="submit">Assign</button>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
