require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
   app.use((req, res, next) => { req.user = { user_id: '00000000-0000-0000-0000-000000000003' }; next(); }); // TEMP
// Authentication (Req 1) is handled separately and must set req.user = { user_id } before these routes.
app.use('/api/users', require('./routes/profileRoutes'));               // Req 4
app.use('/api/notifications', require('./routes/notificationRoutes'));  // Req 5
app.use('/api/admin', require('./routes/adminRoutes'));                 // Req 10

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

module.exports = app;
