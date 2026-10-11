# P6 — Yehia El Shayeb, 58-6588

Your part is requirements **22, 23, 25–30**: course offerings/slots, standard schedule templates and assigning/reassigning normal students.

## Open in VS Code

1. Extract the ZIP into a new folder, such as `D:\ACL\P6-Yehia-58-6588`.
2. In VS Code select **File > Open Folder** and choose the extracted folder that contains `package.json`.
3. Select **Terminal > New Terminal**.
4. Run each command below separately:

```powershell
$env:Path = "C:\Program Files\nodejs;C:\Git\cmd;" + $env:Path
npm.cmd ci
```

On Yehia's current laptop, reuse the existing MongoDB executable to avoid downloading it again:

```powershell
$env:MONGOMS_SYSTEM_BINARY = "C:\Users\Ta 3\3ala-allah\node_modules\.cache\mongodb-memory-server\mongod-x64-win32-8.2.6.exe"
$env:MONGOMS_VERSION = "8.2.6"
```

That executable is not in this ZIP. On another computer, omit those two lines to let mongodb-memory-server download MongoDB, or point MONGOMS_SYSTEM_BINARY at a compatible local executable.

## Test and run the local demo

```powershell
npm.cmd test
npm.cmd run demo
```

The demo is ready when it prints **P6 demo ready: http://localhost:5056**. Leave this terminal open.

Open http://localhost:5056 and sign in:

| Account | Role | Password |
| --- | --- | --- |
| admin@guc.edu.eg | Manage course offerings and slots | Password123! |
| coordinator@guc.edu.eg | Manage templates and student assignments | Password123! |

Click **Open course offerings and standard schedules** after login. It opens `/offerings.html`.

The demo creates its own temporary database and seeds sample data. It ignores an existing `.env` and `MONGO_URI`. It does not send email or use your actual database. Ctrl+C stops it and discards its data. A new run creates fresh sample data. If port 5056 is occupied by the demo already started by Codex, use that running demo, or set `$env:P6_DEMO_PORT = "5057"` before starting another instance and open port 5057 instead.

To run the 31 live API smoke checks, open another terminal in this project while the demo is running:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$env:API_URL = "http://localhost:5056"
npm.cmd run smoke:offerings
```

Change API_URL if using a different port. Run smoke checks against disposable demo data, not a shared production database. The script creates temporary records and cleans them up.

If Node reports a certificate trust error on this Windows laptop, set `$env:NODE_USE_SYSTEM_CA = "1"` and retry. Do not disable certificate verification.

## Use a persistent/team database

The safe assignment implementation requires MongoDB transactions. Use **MongoDB Atlas or a replica set**. For local setup, `npm.cmd run mongo` starts a one-node replica set; keep that terminal open and use its printed URI in `.env`.

1. Run `npm.cmd run setup:env` to create a private `.env` with a generated JWT secret.
2. Set `MONGO_URI` to the intended replica-set/Atlas database, and set `APP_ORIGIN`/`PORT` consistently.
3. Run `npm.cmd start`.

The three seed scripts in the integration guide are for demo/evaluation databases. They delete/replace their seeded data. Do not run them against the team's existing data without coordinating.

## Team branch

This P6 submission belongs to Yehia El Shayeb, 58-6588, on `feature-yehia-el-shayeb-p6`, based on the current team main. P9 should review this branch for merging and coordinate P7's expected schedule schema. See `INTEGRATION-OFFERINGS.md` for integration details. The ZIP is a standalone demo snapshot; use this Git branch for the latest combined team source.

The included `.env.example` is a template. `.env`, credentials, `.git`, MongoDB binaries and `node_modules` are excluded from this ZIP.

The working local frontend is plain JavaScript. The React components are included for the team's frontend integration, but no React bundler or production build is supplied here.
