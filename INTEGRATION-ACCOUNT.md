# Requirements 4, 5 and 10: profile, in-app notifications, account status (Person 2)

Built on `main`: Express 5, Mongoose, the `users` / `student_profiles` models, the Req 1 login (`protect`, `requireRole`) and
the same `req.user` (`_id`, role) the other features use. The login cookie works as-is.

| Req | What | Endpoint | Who |
|---|---|---|---|
| 4 | View my own profile | `GET /api/users/profile` | any signed-in user |
| 5 | List my notifications, newest first | `GET /api/notifications` | any signed-in user |
| 5 | Mark one as read | `PATCH /api/notifications/:id/read` | owner only (404 otherwise) |
| 10 | List / search accounts | `GET /api/admin/users?search=` | `ADMIN` |
| 10 | Activate or deactivate | `PATCH /api/admin/users/:id/status` `{ "account_status": "ACTIVE" \| "DEACTIVATED" }` | `ADMIN` |

## Rules
- **Profile:** everyone sees name, GUC email and role. Students also get student ID, type, major, semester, standing, assigned advisor
  and schedule status. The schedule status is **calculated** with `computeWorkflow()` from `workflow_actions`, never read from a hand-set value.
- **Deactivation** only sets `users.account_status`. Login and `protect` already refuse non-`ACTIVE` accounts (Req 1), so no other
  code changes. Open sessions are revoked, so reactivating does not revive an old session. Nothing is deleted. An administrator cannot
  deactivate their own account.
- **Notifications** are created by other features, not by users. Call the shared helper:
  ```js
  const { createNotification, createNotifications } = require('../services/inAppNotifications');
  await createNotification(student._id, 'Your schedule has been processed.');
  ```
  (`services/notificationService.js` is the e-mail sender for Req 13, a different thing.)

## Files
`models/Notification.js`, `services/inAppNotifications.js`, `controllers/{profile,notification,admin}Controller.js`,
`routes/{profile,notification,admin}Routes.js` (mounted in `app.js`), `seed/seedAll.js`,
`components/Account/{Profile,Notifications,AdminUserManagement}.jsx` + `account.css`,
tests in `tests/{profile,notifications,admin}.api.test.js` (helper: `tests/helpers/session.js`).

## Frontend
The pages use `components/Catalogue/api.js` (axios with `withCredentials`, so the HttpOnly cookie is sent). Add them to the app's router:
```jsx
<Route path="/profile" element={<Profile />} />
<Route path="/notifications" element={<Notifications />} />
<Route path="/admin/users" element={<AdminUserManagement />} />  {/* ADMIN only: hide the link for other roles */}
```

## Run (PowerShell)
```
npm install
npm run seed:all     # students, advisors, coordinator, admin (Person 3) + courses/terms (Person 5) + notifications
npm run dev
npm test             # includes the three new test files
```
Seed logins use the password `Password123!` (for example `admin@guc.edu.eg`, `omar.khaled@student.guc.edu.eg`).
`seed:all` re-creates the seeded users on every run (that is what `seedStudents.js` does).
