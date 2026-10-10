import { useEffect, useState } from 'react';
import api from '../api/api';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/notifications')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not mark notification as read.');
    }
  };

  const unread = items.filter((n) => !n.is_read).length;

  if (loading) return <p className="p-6 text-gray-500">Loading notifications…</p>;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">
        Notifications{' '}
        {unread > 0 && (
          <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{unread} new</span>
        )}
      </h1>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {items.length === 0 && !error && <p className="text-gray-500">You have no notifications.</p>}

      <ul className="space-y-3">
        {items.map((n) => (
          <li
            key={n.notification_id}
            className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${
              n.is_read ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50'
            }`}
          >
            <div>
              <p className={`text-sm ${n.is_read ? 'text-gray-600' : 'font-medium text-gray-900'}`}>{n.message}</p>
              <p className="mt-1 text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            {!n.is_read && (
              <button
                onClick={() => markRead(n.notification_id)}
                className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                Mark as read
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
