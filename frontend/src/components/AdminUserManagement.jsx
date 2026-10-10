import { useCallback, useEffect, useState } from 'react';
import api from '../api/api';

export default function AdminUserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users', { params: term ? { search: term } : {} });
      setUsers(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (user) => {
    const next = user.account_status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    if (next === 'DEACTIVATED' && !window.confirm(`Deactivate ${user.full_name}? They will no longer be able to log in.`)) return;

    setBusyId(user.user_id);
    try {
      const res = await api.patch(`/admin/users/${user.user_id}/status`, { account_status: next });
      setUsers((prev) => prev.map((u) => (u.user_id === user.user_id ? { ...u, ...res.data } : u)));
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account status.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">User Management</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search.trim());
        }}
        className="mb-4 flex gap-2"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or GUC email"
          className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900">Search</button>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">GUC email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No users found.</td></tr>
            )}
            {!loading &&
              users.map((u) => {
                const active = u.account_status === 'ACTIVE';
                return (
                  <tr key={u.user_id}>
                    <td className="px-4 py-3">{u.full_name}</td>
                    <td className="px-4 py-3">{u.guc_email}</td>
                    <td className="px-4 py-3">{u.role}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {u.account_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={busyId === u.user_id}
                        onClick={() => toggleStatus(u)}
                        className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                      >
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
