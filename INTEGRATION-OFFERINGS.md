# Person 6 — Course offerings and standard schedule templates (Req 22–23, 25–30)

**P6 submission owner: Yehia El Shayeb � 58-6588.** Branch: `feature-yehia-el-shayeb-p6`.

Requirements **22, 23, 25�30**. This branch is based on team `main` at
`97f797c2612d76e8c19aabc3159668f304972d94` and preserves its merged P1/P2/P3/P4/P5
work, including advisor routes, profile/notification routes and `User.advising_active`.
The P6 implementation was reviewed and repaired before integration. Existing dependency
code and Git history retain their original ownership; this submission identifies Yehia's
assigned P6 responsibility.

Offerings depend on P5's academic terms and catalogue. Authentication uses P1's
`protect` / `requireRole`; field errors use the shared `services/httpError.js`.
P7/P9 must reconcile their schedule schema with the embedded slots/template/assignment
collections described below before merging dependent scheduling work. All P6 mutations
require MongoDB Atlas or a replica set (see transaction notes below).

| Req | What | Endpoint | Role |
|---|---|---|---|
| 22 | Create an offering and its lecture, tutorial and lab slots | `POST /api/offerings` | Administrator |
| 22 | Add one more slot to an offering | `POST /api/offerings/:id/slots` | Administrator |
| 23 | The offerings of a term (`?term_id=&search=&major=&semester=&published=`) | `GET /api/offerings` | Admin, Coordinator, Advisor |
| 23 | One offering with all of its slots and who uses it | `GET /api/offerings/:id` | Admin, Coordinator, Advisor |
| – | Everything the create/edit form needs | `GET /api/offerings/options?term_id=` | Admin, Coordinator, Advisor |
| 25 | Update an offering (instructors, eligible groups, slots) | `PUT /api/offerings/:id` | Administrator |
| 25 | Update one slot | `PUT /api/offerings/:id/slots/:slotId` | Administrator |
| 26 | Delete an offering | `DELETE /api/offerings/:id` | Administrator |
| 26 | Delete one slot | `DELETE /api/offerings/:id/slots/:slotId` | Administrator |
| 27 | Publish or unpublish one offering | `PUT /api/offerings/:id/publication` | Administrator |
| 27 | Publish or unpublish a whole term | `PUT /api/offerings/publication` | Administrator |
| 28 | Create a standard schedule for a major, semester and study group | `POST /api/templates` | Coordinator |
| 28/29 | List them (`?term_id=&major=&semester=`), or open one | `GET /api/templates`, `GET /api/templates/:id` | Coordinator, Admin, Advisor |
| – | The published offerings a standard schedule may use | `GET /api/templates/options?term_id=` | Coordinator, Admin, Advisor |
| 29 | Update a standard schedule | `PUT /api/templates/:id` | Coordinator |
| 29 | Delete a standard schedule | `DELETE /api/templates/:id` | Coordinator |
| 30 | Publish it, so students may be assigned to it | `PUT /api/templates/:id/publication` | Coordinator |
| 30 | The normal students who may join the group | `GET /api/templates/:id/candidates` | Coordinator, Admin, Advisor |
| 30 | Assign or reassign students to the group | `POST /api/templates/:id/students` | Coordinator |
| 30 | Take a student out of the group | `DELETE /api/templates/:id/students/:studentId` | Coordinator |

## Data

**`course_offerings`** (`models/CourseOffering.js`) — one catalogue course delivered in one term.
`term_id`, `academic_year`, `season`, `course_id`, `course_code`, `course_name`, `instructors[]`,
`eligible_groups[{major, semester}]`, `is_published`, and `groups[]`: the lecture, tutorial and lab
groups, each with `_id`, `type` (LECTURE/TUTORIAL/LAB), `group_number`, `day` (Saturday–Thursday),
`start_time`, `end_time` ("HH:MM"), `room`, `max_capacity` and `assigned_count`.
Unique per (term, course code).

The collection name and the `course_code` / `course_id` fields are the ones Person 5's catalogue
already counts before deleting a course (Req 21), so **do not rename them**.

**`schedule_templates`** (`models/ScheduleTemplate.js`) — `term_id`, `major`, `semester`,
`study_group`, `is_published`, `entries[{offering_id, course_code, course_name, slot_ids[]}]`.
Unique per (term, major, semester, study group). A template stores **no times**: `slot_ids` point
into `course_offerings.groups`, so moving a slot moves it in every standard schedule that uses it.

**`student_group_assignments`** (`models/GroupAssignment.js`) — `student_id`, `term_id`,
`template_id`, `major`, `semester`, `study_group`, `assigned_by`. Unique per (student, term), which
is what makes a reassignment replace rather than duplicate.

**Remaining capacity is never stored.** It is `max_capacity - assigned_count`, calculated on read,
and the API returns it on every slot as `remaining_capacity` (plus `total_capacity` and
`total_assigned` per offering).

## The rules the Product Manager may ask about

- **Slot:** type lecture/tutorial/lab; a group number; a day from Saturday to Thursday; 24-hour
  `HH:MM` times with the end after the start; a room; capacity a whole number 1–500. The five GUC
  slots (08:15, 10:00, 11:45, 13:30, 15:15) are offered as shortcuts but any time is accepted.
- **Clashes (Req 22, 25):** a room cannot hold two groups at once anywhere in the term, not even
  two groups of the same course. An instructor cannot teach two *different* offerings at the same
  time (instructors are recorded per offering, not per group, so two groups of one course may share
  one). The same (type, group number) cannot appear twice in one offering.
- **Capacity (Req 25):** `max_capacity` can never be set below `assigned_count`, and the
  `assigned_count` in a request body is ignored — only an assignment changes it.
- **Delete (Req 26):** a slot with students, or one a standard schedule uses, is refused with a
  message naming who is in the way. An offering is refused while any of its slots has students or
  any standard schedule uses it.
- **Publish (Req 27):** an offering needs at least one slot, one instructor and one eligible
  major/semester group. **Unpublishing** is refused when students already follow a standard
  schedule that uses it, or when it is in a published standard schedule — that is the
  "would invalidate an active or processed schedule" rule. The whole-term call skips what it cannot
  change and returns a `skipped[]` list with the reason for each.
- **Standard schedule (Req 28, 29):** only **published** offerings may be used, each course once,
  each course must be open to that major and semester, and the chosen slots may not overlap —
  one study group cannot be in two rooms at once. Changing the major, semester or group number is
  refused while students are in it.
- **Assignment (Req 30):** the student must exist, be a **normal** student, and match the group's
  major and semester; the standard schedule must be published; and every slot must have a free
  seat. Assigning seats the student in **every** slot of the group, which is what raises
  `assigned_count`. Reassigning releases the old group's seats first, so moving inside a full
  course still works. A batch call returns `assigned[]` and `skipped[]` with a reason each, rather
  than failing the whole request.

## For teammates

**The slot a student sits in.** Other features (Req 31 weekly schedule, Req 34–39 whole-schedule
swap, Req 40–48 slot changes) can read a normal student's schedule like this:

```js
const GroupAssignment = require('../models/GroupAssignment');
const ScheduleTemplate = require('../models/ScheduleTemplate');
const CourseOffering = require('../models/CourseOffering');
const { resolveEntries, weeklyCalendar } = require('../services/templateRules');

const row = await GroupAssignment.findOne({ student_id, term_id }).lean();
const template = await ScheduleTemplate.findById(row.template_id).lean();
const offerings = await CourseOffering.find({ term_id }).lean();
const { slots } = resolveEntries(template.entries, new Map(offerings.map((o) => [o._id, o])));
const week = weeklyCalendar(slots); // one row per day, days off included
```

**Changing seat counts.** If your feature moves a student between groups (Req 37's whole-schedule
swap, Req 48's slot change), change `assigned_count` through the same path rather than writing it
directly. Wrap the full P7 operation in `withSchedulingTransaction` from `services/schedulingTransaction.js`, then call `controllers/templateController.js#changeSeats(entries, delta)` inside it. The helper refuses calls outside this transaction. Include both the student's assignment change and all seat changes in the same callback; do not nest transactions or use parallel database operations inside it.

**Workflow status.** Assigning a student records a `SCHEDULE_ASSIGNED` action through Person 3's
`recordWorkflowAction`, so the status column in Req 6 updates itself. Nothing writes
`workflow_status` directly.

## Frontend

```jsx
<Route path="/admin/offerings" element={<CourseOfferingsPage role={user.role} />} />   {/* Req 22, 23, 25, 26, 27 */}
<Route path="/coordinator/standard-schedules" element={<StandardSchedulesPage role={user.role} />} /> {/* Req 28, 29, 30 */}
```

`components/Offerings/` holds the React components (`api.js` needs `axios`; styles are
`offerings.css`, every class starts with `off-`). They pass `role` so a Coordinator or Advisor sees
the offerings page read-only; the API refuses them in any case.

Because the repository has no bundler yet, the same two screens also ship as a plain page with no
build step at **`http://localhost:5050/offerings.html`** (`public/offerings.js`,
`public/offerings.css`). It uses the Req 1 login cookie, so sign in at `/` first. When the team
sets up the React app, the React components replace it and the two public files can be deleted.

## Run and test (PowerShell)

```
npm install
npm run test:offerings      # rules, real replica-set API tests, page tests and regressions
npm run setup:env           # once: creates .env with a random JWT_SECRET (Person 1's login needs it)
npm run mongo               # window 1: temporary single-node replica set; use its printed URI
npm run seed:catalogue      # Person 5: 76 courses + the Winter and Spring 2026/2027 terms
npm run seed                # Person 3: students, advisors, coordinator, administrator
npm run seed:offerings      # this feature: 22 published offerings, 12 standard schedules, 5 students placed
npm run dev                 # window 2: API on http://localhost:5050
npm run smoke:offerings     # window 3: 31 PASS/FAIL checks against the real server; cleans up after itself
```

Seeded logins: `admin@guc.edu.eg` (offerings) and `coordinator@guc.edu.eg` (standard schedules),
password `Password123!`. Login allows 10 attempts per 15 minutes and the smoke test logs in twice.

## Build status — what is not done

- **Scheduling writes are transactional.** All P6 mutation routes use one database transaction and write the shared `scheduling_writes` document before checking or changing schedules. This serializes concurrent scheduling writes across server processes. It favors correctness over write throughput for the lab-scale workload. Seat counts, assignments and workflow actions commit together or roll back together. The singleton is a deliberate additional collection and must be retained at integration.
- **MongoDB must support transactions.** Use MongoDB Atlas or a replica set. `npm run mongo` now starts a temporary one-node replica set; `npm run demo` starts and seeds an isolated replica set automatically. A standalone MongoDB is rejected with setup instructions before a P6 mutation runs.
- **Instructors are names, not accounts.** `users.role` has no INSTRUCTOR value, so instructors are
  stored as text and instructor clashes are matched by name, ignoring case.
- **Req 24 (duplicating a term's offerings) is Sprint 2** and is not implemented here.
- **The React components are not rendered by any build yet** — the repository has no bundler. They
  are parse-checked only; `/offerings.html` is what was exercised in a browser.
- `GET /api/templates` expands every template on each call, which is fine for one term's worth of
  groups but would need an aggregation if a term ever held hundreds.

## Repair handoff (11 October 2026)

The six review failures are covered by `tests/offerings.regressions.test.js`: internal room clashes on create/update, unpublished template dependencies, eligibility changes, combined major/semester filters and concurrent overbooking. Extra cases cover a valid simultaneous room swap, concurrent offering creation, rollback after a simulated database failure, concurrent reassignment and revalidation of externally changed eligibility. `tests/scheduling-config.test.js` verifies an unsupported standalone database fails safely.

Normal students' schedules still use `student_group_assignments` -> `schedule_templates` -> embedded `course_offerings.groups`. P7/P9 must agree on this representation; this repair does not add a separate `student_schedules` collection or silently change the team's schema.

The static demo is tested; mounting the supplied React components in the team's frontend remains integration work. There is no production React build in this ZIP.
