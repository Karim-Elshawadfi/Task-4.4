// Req 5: view in-app notifications (newest first) and mark them as read.
import React, { useEffect, useState } from 'react';
import api, { errorMessage, formatDateTime } from '../Catalogue/api';
import './account.css';

export default function Notifications() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    api.get('/notifications')
      .then((res) => setItems(res.data.notifications))
      .catch((err) => { setError(errorMessage(err)); setItems([]); });
  }, []);

  const markRead = async (id) => {
    setBusyId(id); setError('');
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n)));
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyId(''); }
  };

  if (items === null) return <div className="acc-page"><p className="acc-muted">Loading notifications…</p></div>;
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="acc-page">
      <h1 className="acc-title">
        Notifications{unread > 0 && <span className="acc-count">{unread} new</span>}
      </h1>
      {error && <p className="acc-error">{error}</p>}
      {items.length === 0 && !error && <p className="acc-muted">You have no notifications.</p>}
      <ul className="acc-list">
        {items.map((n) => (
          <li key={n.notification_id} className={`acc-note${n.is_read ? '' : ' acc-unread'}`}>
            <div>
              <p className="acc-note-text">{n.message}</p>
              <p className="acc-note-time">{formatDateTime(n.created_at)}</p>
            </div>
            {!n.is_read && (
              <button className="acc-btn" disabled={busyId === n.notification_id}
                onClick={() => markRead(n.notification_id)}>Mark as read</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
