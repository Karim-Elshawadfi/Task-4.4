# P6 validation results

Verified 11 October 2026 on Windows with Node 24.21.0, MongoDB 8.2.6, disposable databases and Chrome.

| Verification | Result |
| --- | --- |
| Original 135 tests | Passed |
| Six original failing regression cases | Now pass, included in npm test |
| Five added rollback/concurrency/validation cases | Passed |
| Unsupported database configuration check | Passed |
| Standalone repaired ZIP npm test | **147 passed, 0 failed, 0 skipped** |
| Team branch npm test, including merged P2/P4 tests | **178 passed, 0 failed, 0 skipped** |
| Live P6 smoke checks | **31 passed, 0 failed** |
| Real Chrome walkthrough | **9 checks passed** |
| Mobile document width | **390px on a 390px viewport**, no document overflow |

The Chrome checks covered login and the P6 link, offering details and editor, role-appropriate controls, template creation/edit/publication/deletion and student reassignment to group 2 and back. No uncaught browser JavaScript errors occurred in these flows.

One test deliberately injects a storage error and expects HTTP 500 to verify rollback of seats, assignments and workflow history. Its error may be printed in the test output; the final pass/fail summary determines whether the test succeeded.

The standalone repair retained its dependency versions. For the team branch, jsdom and its lockfile entries were added for frontend page tests; existing locked team dependencies were preserved. No new dependency audit result is claimed for this integration. No production React build exists in this package; React integration remains a team task. Real SMTP and other members' separately developed features were not evaluated as part of these P6 fixes.

Run `npm.cmd test` to repeat the automated tests. With `npm.cmd run demo` running, set `$env:API_URL = "http://localhost:5056"` in another terminal and run `npm.cmd run smoke:offerings`. See START-HERE-P6.md for exact setup steps.

These results verify the exercised behavior. They do not guarantee a grade or establish that the entire team's merged application works.
