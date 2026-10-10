// Coordinator — Req 11 (add by GUC email, shows the advisor's full name) and Req 12 (remove by GUC email).
import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../Catalogue/api';

export default function AdvisorList() {
  const [advisors, setAdvisors] = useState([]);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try { setAdvisors((await api.get('/advisors')).data); } catch (err) { setError(errorMessage(err)); }
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const { data } = await api.post('/advisors/add', { guc_email: email });
      setMessage(`${data.advisor.full_name} — ${data.message}`);
      setEmail('');
      load();
    } catch (err) { setError(errorMessage(err)); }
  };

  const remove = async (advisor) => {
    if (!window.confirm(`Remove ${advisor.full_name} from the advising system? Their students will be unassigned.`)) return;
    setMessage(''); setError('');
    try {
      const { data } = await api.delete(`/advisors/remove/${encodeURIComponent(advisor.guc_email)}`);
      setMessage(`${advisor.full_name} — ${data.message} (${data.unassigned_students} student(s) unassigned)`);
      load();
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="advisor-list">
      <h3>Advisors</h3>
      <form onSubmit={add}>
        <input type="email" placeholder="advisor@guc.edu.eg" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button type="submit">Add advisor</button>
      </form>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Name</th><th>GUC email</th><th>In advising system</th><th /></tr></thead>
        <tbody>
          {advisors.map((a) => (
            <tr key={a.id}>
              <td>{a.full_name}</td>
              <td>{a.guc_email}</td>
              <td>{a.advising_active ? 'Yes' : 'No'}</td>
              <td>{a.advising_active && <button onClick={() => remove(a)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
