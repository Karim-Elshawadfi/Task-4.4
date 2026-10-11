// Req 4: every signed-in user views their own profile (student details only for students).
import React, { useEffect, useState } from 'react';
import api, { errorMessage } from '../Catalogue/api';
import './account.css';

const Row = ({ label, value }) => (
  <div className="acc-row">
    <span className="acc-label">{label}</span>
    <span>{value ?? '—'}</span>
  </div>
);

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users/profile')
      .then((res) => setProfile(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <div className="acc-page"><p className="acc-error">{error}</p></div>;
  if (!profile) return <div className="acc-page"><p className="acc-muted">Loading profile…</p></div>;

  const s = profile.student_profile;
  const advisor = s?.assigned_advisor;

  return (
    <div className="acc-page">
      <h1 className="acc-title">My profile</h1>
      <div className="acc-card">
        <Row label="Full name" value={profile.full_name} />
        <Row label="GUC email" value={profile.guc_email} />
        <Row label="Role" value={profile.role} />
        {profile.role === 'STUDENT' && s && (
          <>
            <Row label="Student ID" value={s.guc_student_id} />
            <Row label="Student type" value={s.student_type === 'ADVISING' ? 'Advising student' : 'Normal student'} />
            <Row label="Major" value={s.major} />
            <Row label="Current semester" value={s.current_semester} />
            <Row label="Academic standing" value={s.academic_standing} />
            {s.student_type === 'ADVISING' && (
              <Row label="Assigned advisor" value={advisor ? `${advisor.full_name} (${advisor.guc_email})` : 'Not assigned yet'} />
            )}
            <Row label="Schedule status" value={s.schedule_status} />
          </>
        )}
      </div>
    </div>
  );
}
