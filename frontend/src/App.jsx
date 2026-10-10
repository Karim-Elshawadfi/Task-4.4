import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Profile from './components/Profile';
import Notifications from './components/Notifications';
import AdminUserManagement from './components/AdminUserManagement';

// Each requirement's commit un-comments its own line.
const routes = [
  { path: '/profile', element: <Profile /> },
  { path: '/notifications', element: <Notifications /> },
  { path: '/admin/users', element: <AdminUserManagement /> },
];

export default function App() {
  return (
    <>
      <nav className="flex gap-4 bg-gray-900 px-6 py-3 text-sm text-white">
        <span className="font-semibold">3ala-allah</span>
        <Link to="/profile" className="hover:underline">Profile</Link>
        <Link to="/notifications" className="hover:underline">Notifications</Link>
        <Link to="/admin/users" className="hover:underline">User management</Link>
      </nav>
      <Routes>
        {routes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
        <Route path="*" element={<Navigate to="/profile" replace />} />
      </Routes>
    </>
  );
}
