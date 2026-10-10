# Person 5 — Academic terms and course catalogue (Req 16–21, 128)

Branch `feature-terms-catalogue`, built **on top of `feature-authentication-access` (Person 1, login)**,
because every Person 5 requirement depends on Req 1. It contains only Person 5's code plus four lines in
`app.js` that mount the routes, and new npm scripts in `package.json`. All other Person 1 files are unchanged.
When Person 1's branch is merged into `main`, this branch's pull request shows only Person 5's commits.

Access uses Person 1's `protect` / `requireRole` from `middleware/auth.js` (real login session required).

## Endpoints (all need `Authorization: Bearer <token>`)
| Req | What | Endpoint | Roles |
|---|---|---|---|
| 16 | Create a term with its 6 dates | `POST /api/terms` | Administrator |
| 17 | Update a term (send only changed fields) | `PUT /api/terms/:id` | Administrator |
| – | List terms with open/closed status | `GET /api/terms`, `GET /api/terms/:id` | Admin, Coordinator, Advisor |
| – | Current term (running, else next) | `GET /api/terms/current` | any logged-in user |
| 18 | Create a course | `POST /api/catalogue/courses` | Administrator |
| 19 | View catalogue (`?search=&major=&type=&semester=&season=`) and one course | `GET /api/catalogue/courses`, `GET /api/catalogue/courses/:code` | Admin, Coordinator, Advisor |
| 20 | Update a course (code cannot change) | `PUT /api/catalogue/courses/:code` | Administrator |
| 21 | Delete a course | `DELETE /api/catalogue/courses/:code` | Administrator |
| 128 | Import CSV: `{ csv: "<file text>", dryRun: true }` checks only; without `dryRun` it saves | `POST /api/catalogue/courses/import` | Administrator |

`:code` is the course code URL-encoded, e.g. `/api/catalogue/courses/CSEN%20301` (`csen301` also works).

## Data
**`academic_terms`** (`models/AcademicTerm.js`): `academic_year` "2026/2027", `season` WINTER/SPRING/SUMMER,
`name`, `term_start`, `term_end`, `teaching_start`, `teaching_end`, `advising_deadline`, `swap_deadline`.
Unique per (year, season).

**`course_catalogue`** (`models/Course.js`): `course_code`, `course_name`, `credit_hours`,
`course_type` CORE/ELECTIVE/HUMA, `majors` ['CS','DMET'], `recommended_semester`, `offering_season`
WINTER/SPRING/SUMMER/BOTH, `prerequisites` [course codes], `curriculum` [{major, semester}] (study-plan
placement; DMET 502 is semester 5 for DMET and 7 for CS). Electives are in the same collection.

## For teammates: blocking actions after a deadline (Req 16 rule)
```js
const { assertBeforeDeadline, getCurrentTerm, termStatus } = require('../services/termRules');
await assertBeforeDeadline('advising'); // throws (status 403) after the advising deadline — e.g. Req 57
await assertBeforeDeadline('swap');     // after the normal-student whole-schedule swap deadline — Req 34-35
```

## Rules the PM may ask about
- **Term dates:** term start < end; teaching inside the term; both deadlines between term start and end;
  year must be "YYYY/YYYY+1"; one Winter/Spring/Summer per year.
- **Course:** code like `CSEN 301` (also `CHEMp 102`, `PHYSt 301`; typed `csen301` is normalised);
  name required (≤100); credit hours whole 1–12; type core/elective/huma; at least one of CS/DMET;
  semester 1–10; season winter/spring/summer/both; every prerequisite must exist, cannot be the course
  itself, and prerequisites may not form a loop (A needs B needs A).
- **Update:** the code cannot change (other records point to it). Delete is refused while another course
  lists it as a prerequisite or a course offering uses it.
- **CSV import (128):** checks the 8 required columns first, then every row; shows row-level errors
  (row number = line in the file). If any row is invalid nothing is imported. Existing codes are updated,
  new codes created, so re-importing never creates duplicates. Prerequisites may point to rows in the
  same file. Several majors/prerequisites are separated with `;`. Excel files saved with `;` work too.
  Samples: `data/sample-courses.csv` (valid: 3 new, 1 update) and `data/sample-courses-invalid.csv`.

## Frontend (`components/Catalogue/`)
```jsx
<Route path="/admin/terms" element={<TermsPage />} />                 {/* Req 16-17 */}
<Route path="/admin/catalogue" element={<CourseCataloguePage />} />   {/* Req 18-21, 128 */}
```
`api.js` calls `/api/...` with the login cookie (or a `localStorage.token` Bearer token); needs `axios`.
Styles: `catalogue.css` (all classes start with `cat-`).

## Run and test (PowerShell)
```
npm install
npm run test:catalogue      # 23 automated tests (uses the real app.js and real login), no MongoDB needed
npm run setup:env           # once: creates .env with a random JWT_SECRET (Person 1's login needs it)
npm run mongo               # window 1, only if you have no MongoDB: temporary database
npm run seed:catalogue      # 76 courses (66 CS/DMET + 10 electives) + Winter and Spring 2026/2027 terms
npm run dev                 # window 2: API on http://localhost:5050
npm run smoke:catalogue     # window 3: 27 PASS/FAIL checks; creates test users, logs in, removes them after
```
Login allows 10 attempts per 15 minutes; the smoke test logs in 3 times, so wait 15 minutes after 3 runs.
