require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Authentication (Req 1) is handled separately and must set req.user = { user_id } before these routes.
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

module.exports = app;