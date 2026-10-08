// Local dev server for Req 6-9. In the team repo, mount studentRoutes in your
// existing server.js and use the Req 1 login for tokens.
// Run: npm run dev   (needs MongoDB running; seed it with `npm run seed`)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

process.env.JWT_SECRET ||= 'dev-secret';
const PORT = process.env.PORT || 5050;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/guc_schedule';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/students', require('./routes/studentRoutes'));

mongoose
  .connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`API on http://localhost:${PORT} (db: ${MONGO_URI})`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
