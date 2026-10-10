# Requirements 6–9: Coordinator/Admin student list

| Req | What | Endpoint |
|---|---|---|
| 6 | List all students + workflow status, blocking step, last update | `GET /api/students` |
| 7 | Search by student ID, full name, GUC email | `?search=` |
| 8 | Filter by type, advisor, major, semester, standing, status, blocking step, account status | `?studentType=&advisor=&major=&semester=&standing=&status=&blockingStep=&accountStatus=` + `GET /api/students/filter-options` |
| 9 | Select a student from the results to open their details | `GET /api/students/:id` (`:id` = `student_id` UUID) |

All routes require login and the `COORDINATOR` or `ADMIN` role (403 otherwise).

## Schema
Built on the **Sprint 1 unified schema**. Each table is a collection with the same name and field names. The PK (`user_id`, `student_id`) is stored as Mongo `_id` (UUID string).

| Collection | Owner | Used for |
|---|---|---|
| `users` | Person 1/2 | name, `guc_email`, `role`, `account_status` |
| `student_profiles` | Person 1/2 | `guc_student_id`, `student_type`, major, semester, standing, `assigned_advisor_id`, `workflow_status` |
| `workflow_actions` | **Req 6–9 (new, not in the unified schema)** | history that `workflow_status` is calculated from |

These are **not stored**. They are calculated when you read them:
- **Blocking step** comes from `workflow_status` (`BLOCKING_STEP` in `services/workflowStatus.js`). The blocking-step filter turns into `workflow_status $in [...]`.
- **Last update** is the newest `workflow_actions.created_at`, or `users.created_at` if the student has no actions.

## Files
Paths are from the repo root:
- `services/workflowStatus.js`, `models/WorkflowAction.js`, `controllers/studentController.js`, `routes/studentRoutes.js`
- `models/User.js`, `models/StudentProfile.js`: if Person 1/2 already has these, **keep theirs**. They follow the unified schema, so nothing needs to change.
- `middleware/auth.js` is the Req 1 auth middleware (see `INTEGRATION-AUTH.md`). The student routes use its `protect` and `requireRole`, so get a token from `POST /api/auth/login` (cookie or `Authorization: Bearer`).
- `app.js` mounts the routes: `app.use('/api/students', require('./routes/studentRoutes'));`
- Run: set `JWT_SECRET` (at least 32 characters) in `.env` (see `.env.example`), then `npm run dev`
- Seed: `MONGO_URI=... npm run seed`

## How the workflow status works (the PM may ask)
`workflow_status` is **never edited directly**. Each completed step is saved as a `workflow_actions` row (e.g. `DRAFT_CREATED`, `STUDENT_ACCEPTED`, `SWAP_REQUESTED`).
`computeWorkflow()` gets the status from the student's latest relevant action and stores it in `student_profiles.workflow_status`, so search, filter and sort stay fast.
Later features (drafting, approval, swaps…) must call `recordWorkflowAction(studentId, 'TYPE', req.user._id)`.
If a profile has no `workflow_status` yet, it shows as `Not Started` (ADVISING) or `Schedule Assigned` (NORMAL).

## Tests
`npm test` runs 17 student tests (plus the auth tests in `tests/auth.test.js`):
- unit tests for status calculation, search (including regex escaping), all 8 filters and sort whitelisting
- end-to-end API tests against an in-memory MongoDB (joins, filters, pagination, details, 403/404/400), using real login sessions

Seed logins: `coordinator@guc.edu.eg` / `admin@guc.edu.eg`, password `Password123!`
