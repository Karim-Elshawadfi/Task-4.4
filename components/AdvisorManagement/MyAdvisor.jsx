// Advising Student — Req 15: name and GUC email of my advisor. The server knows who I am from my login.
import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../Catalogue/api';

export default function MyAdvisor() {
  const [advisor, setAdvisor] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/advisors/my-advisor').then((r) => setAdvisor(r.data)).catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <div className="advisor-error">{error}</div>;
  if (!advisor) return <div className="advisor-loading">Loading…</div>;
  return (
    <div className="my-advisor-card">
      <h3>My advisor</h3>
      <p><strong>Name:</strong> {advisor.advisorName}</p>
      <p><strong>Email:</strong> {advisor.advisorEmail}</p>
    </div>
  );
}
