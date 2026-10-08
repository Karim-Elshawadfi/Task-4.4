const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const {
  listStudents,
  getFilterOptions,
} = require('../controllers/studentController');

const router = express.Router();

// Only Coordinators and Administrators can use Req 6-9.
router.use(protect, requireRole('COORDINATOR', 'ADMIN'));

router.get('/', listStudents); //                  Req 6, 7, 8
router.get('/filter-options', getFilterOptions); // Req 8 dropdown values

module.exports = router;

// In your server.js / app.js:
//   app.use('/api/students', require('./routes/studentRoutes'));
