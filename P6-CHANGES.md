# P6 repairs — Yehia El Shayeb, 58-6588

The repair list below compares the supplied `3ala-allah.zip` with its corrected P6 source. The team submission is on `feature-yehia-el-shayeb-p6`, based on `main` at `97f797c`. Shared-file integration preserves the latest P2/P4 routes, scripts and User fields.

## Behavior corrected

1. Room conflicts are checked between every pair of proposed slots on create and update. Comparisons against other offerings exclude the stale version of the offering being edited.
2. Publishing a template and assigning students recheck the current offering publication status, eligibility, slot references and timetable conflicts.
3. An offering cannot change eligibility in a way that invalidates a referencing template.
4. Combined major/semester filtering uses one array-element match.
5. Seat changes, assignment records and workflow history commit together inside a transaction. Every P6 mutation writes the shared scheduling document first to prevent concurrent validation/write races across server processes. Reassignment computes net seat changes before any write; a shared full lecture does not need an extra seat.
6. All original six review cases are retained as assertions in the normal test command. Five additional cases cover rollback and related concurrency/validation scenarios. A separate configuration test rejects unsupported standalone MongoDB safely.
7. The login page links directly to the P6 screens for permitted roles. Mobile overflow is fixed. The new demo command starts a disposable replica set and sample data without using private credentials.

## Repair changes relative to the original ZIP

- `controllers/offeringController.js`
- `controllers/templateController.js`
- `INTEGRATION-OFFERINGS.md`
- `package.json` — demo/test commands and defer MongoDB download until needed; dependency versions unchanged
- `public/auth.js`
- `public/index.html`
- `public/offerings.css`
- `routes/offeringRoutes.js`
- `routes/templateRoutes.js`
- `scripts/devMongo.js` — now starts a one-node replica set
- `server.js` — checks transaction support before serving requests
- `services/httpError.js` — forwards deliberately constructed 503 setup errors
- `services/offeringRules.js`
- `tests/offerings.api.test.js` — transaction-capable test database
- `tests/offerings.unit.test.js` — same-course clash fixture now includes both proposed groups, preserving its original assertion

## Added implementation/test files

- `models/SchedulingWrite.js`
- `services/schedulingTransaction.js`
- `scripts/demo.js`
- `tests/offerings.regressions.test.js`
- `tests/scheduling-config.test.js`
- Startup, repair and test-result documentation

## Integration requirements

- Use a replica set or MongoDB Atlas for persistent operation. Both bundled local launchers support transactions. There is no unsafe standalone fallback.
- P7 should use `withSchedulingTransaction` for operations that change these assignments or seats. Its full mutation and seat changes belong in the same callback. Do not nest transactions, bypass this transaction boundary, or run database queries in parallel inside the callback. See the official [Mongoose transaction documentation](https://mongoosejs.com/docs/transactions.html).
- This implementation uses one shared scheduling write document, deliberately serializing P6 mutations. That is appropriate for the lab workload; higher write throughput would require a more granular design and concurrency tests.
- P7/P9 still need to agree on the existing embedded-slot/template/assignment schema. This repair preserves it.
- Static frontend demo verified. The supplied React components still need to be mounted in the team's frontend. No React production build is claimed.
- Team-branch integration adds the P6 routes to `app.js`, preserves existing npm scripts, and adds jsdom plus its lockfile entries for page tests. Existing team models and routes are preserved. P9 should review the branch before merging.
