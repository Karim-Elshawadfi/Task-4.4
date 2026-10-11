// Req 10 (Administrator): activate or deactivate user accounts. Deactivation blocks login; no records are deleted.
import React, { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../Catalogue/api';
import './account.css';

export default function AdminUserManagement() {
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [me, setMe] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (term = '') => {
    try {
      const { data } = await api.get('/admin/users', { params: term ? { search: term } : {} });
      setUsers(data.users); setError('');
    } catch (err) { setError(errorMessage(err)); setUsers([]); }
  }, []);

  useEffect(() => {
    load();
    api.get('/auth/me').then((res) => setMe(res.data.user.user_id)).catch(() => {});
  }, [load]);

  const toggle = async (user) => {
    const next = user.account_status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    if (next === 'DEACTIVATED' && !window.confirm(`Deactivate ${user.full_name}? They will no longer be able to log in.`)) return;
    setBusyId(user.user_id); setError(''); setMessage('');
    try {
      const { data } = await api.patch(`/admin/users/${user.user_id}/status`, { account_status: next });
      setUsers((prev) => prev.map((u) => (u.user_id === data.user_id ? { ...u, ...data } : u)));
      setMessage(`${data.full_name} is now ${data.account_status.toLowerCase()}.`);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyId(''); }
  };

  return (
    <div className="acc-page acc-wide">
      <h1 className="acc-title">User management</h1>
      <form className="acc-search" onSubmit={(e) => { e.preventDefault(); load(search.trim()); }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or GUC email" />
        <button className="acc-btn acc-dark" type="submit">Search</button>
      </form>
      {error && <p className="acc-error">{error}</p>}
      {message && <p className="acc-ok">{message}</p>}
      <div className="acc-table-wrap">
        <table className="acc-table">
          <thead>
            <tr><th>Name</th><th>GUC email</th><th>Role</th><th>Status</th><th className="acc-right">Action</th></tr>
          </thead>
          <tbody>
            {users === null && <tr><td colSpan={5} className="acc-muted">Loading…</td></tr>}
            {users?.length === 0 && <tr><td colSpan={5} className="acc-muted">No users found.</td></tr>}
            {users?.map((u) => {
              const active = u.account_status === 'ACTIVE';
              const isMe = u.user_id === me;
              return (
                <tr key={u.user_id}>
                  <td>{u.full_name}</td>
                  <td>{u.guc_email}</td>
                  <td>{u.role}</td>
                  <td><span className={`acc-badge ${active ? 'acc-active' : 'acc-deactivated'}`}>{u.account_status}</span></td>
                  <td className="acc-right">
                    <button className={`acc-btn ${active ? 'acc-danger' : 'acc-success'}`}
                      disabled={busyId === u.user_id || (isMe && active)}
                      title={isMe && active ? 'You cannot deactivate your own account' : undefined}
                      onClick={() => toggle(u)}>
                      {active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
