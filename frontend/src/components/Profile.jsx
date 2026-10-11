import { useEffect, useState } from 'react';
import api from '../api/api';

const Field = ({ label, value }) => (
  <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4">
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">{value ?? '—'}</dd>
  </div>
);

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/users/profile')
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6 text-gray-500">Loading profile…</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!profile) return null;

  const sp = profile.student_profile;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">My Profile</h1>

      <div className="rounded-lg bg-white px-6 py-2 shadow">
        <dl className="divide-y divide-gray-200">
          <Field label="Full name" value={profile.full_name} />
          <Field label="GUC email" value={profile.guc_email} />
          <Field label="Role" value={profile.role} />

          {profile.role === 'STUDENT' && sp && (
            <>
              <Field label="Student ID" value={sp.guc_student_id} />
              <Field label="Student type" value={sp.student_type} />
              <Field label="Major" value={sp.major} />
              <Field label="Current semester" value={sp.current_semester} />
              <Field label="Academic standing" value={sp.academic_standing} />
              {sp.student_type === 'ADVISING' && (
                <Field
                  label="Assigned advisor"
                  value={
                    sp.assigned_advisor
                      ? `${sp.assigned_advisor.full_name} (${sp.assigned_advisor.guc_email})`
                      : 'Not assigned yet'
                  }
                />
              )}
              <Field label="Schedule status" value={sp.schedule_status} />
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
