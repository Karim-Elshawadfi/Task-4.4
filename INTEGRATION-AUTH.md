# Sprint 1: Authentication and access control (requirements 1–3)

This module follows the Express 5 / Mongoose 9 / bcryptjs / JWT conventions inspected in `feature-advising-academic`. It implements login for existing accounts only, an emailed one-time password reset, and revocable logout. It includes a standalone browser interface at `/`.

## Run

Use Node 22 or newer. Run `npm ci`, copy `.env.example` to `.env`, and fill in a random JWT_SECRET of at least 32 characters, your MongoDB URI, and your SMTP credentials. Start with `npm start`, then visit the configured APP_ORIGIN (by default http://localhost:5050).

No signup or account seed is included: the evaluation seed belongs to Yehia. Existing `users.password_hash` values must be bcrypt hashes. The Mongo `_id` is the shared user UUID, matching the existing team model. Students require `@student.guc.edu.eg`; other roles require `@guc.edu.eg`.

SMTP is required for real delivery. The application never returns or logs the OTP. A generic reset-request response prevents account enumeration; monitor server logs for mail-delivery failures. Tests inject a captured mail sender and do not send external email.

## API

| Method | Path | JSON body | Result |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | `{ "email": "…", "password": "…" }` | User, JWT, and HttpOnly session cookie |
| GET | `/api/auth/me` | — | Current user without password hash |
| POST | `/api/auth/forgot-password` | `{ "email": "…" }` | Generic acknowledgement; sends code when eligible |
| POST | `/api/auth/reset-password` | `{ "email": "…", "code": "123456", "newPassword": "…" }` | Updates password and revokes existing sessions |
| POST | `/api/auth/logout` | `{}` | Revokes the current session and clears its cookie |

Tokens contain `id` (user UUID) and `jti` (session UUID), expire after eight hours, and use HS256 with explicit issuer/audience. Send `Authorization: Bearer <token>` from existing teammate clients, or use the HttpOnly cookie for same-origin browser requests. Existing manually generated development tokens have no session record and are intentionally rejected; tests and smoke scripts should log in to obtain tokens.

## Merge into the team application

Keep one shared `models/User.js` with the unified fields. Mount `createAuthRoutes()` at `/api/auth` and initialize `app.locals.auth` as in `app.js`; preserve all teammates' routes. Replace their placeholder `middleware/auth.js` with this implementation: exports remain `protect` and `requireRole(...roles)` and `req.user` retains the existing Mongo UUID and schema fields.

Every authenticated request checks the live account status and stored session. Endpoint owners still enforce student ownership and advising relationships; role checks alone are not sufficient for student-specific data. This module does not implement profiles, notifications, activation controls, or evaluation seeding.

Two additional collections support revocation and resets: `auth_sessions` and `password_resets`. TTL indexes clean up expired rows, and every query also checks expiration because TTL cleanup is not immediate. OTPs last ten minutes, allow five verification attempts, and can be used once. Reissue has a one-minute account-wide cooldown; IP rate limits protect login and reset endpoints. Deploy a shared rate-limit store if running multiple server instances. New passwords require at least 12 characters and at most 72 UTF-8 bytes to avoid bcrypt truncation.

For production, set NODE_ENV=production, APP_ORIGIN to the HTTPS frontend origin, and a strong secret. The starter serves the UI and API from one origin. It does not enable permissive CORS. If the team hosts its frontend separately, explicitly configure permitted origins, credentials, cookie settings, and CSRF protection together. Configure trusted proxy hops precisely when deploying behind a reverse proxy; do not blindly enable trust proxy.

## Validation

Run `npm test` for integration tests against an actual temporary MongoDB. The test runner may download a MongoDB binary on first use.

Validation completed locally: all 14 API integration tests passed against MongoDB 8.2.6, including OTP reuse, expiration, five-attempt lockout, concurrent consumption, role checks, account deactivation, and logout revocation. Dependency audit reported no vulnerabilities after updating Nodemailer to 10.0.16. Real SMTP delivery and integration with the team's other feature branches remain unverified.
