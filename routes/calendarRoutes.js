const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { protect } = require('../middleware/auth');

router.get('/weekly', protect, calendarController.getWeeklyCalendar);
router.get('/courses', protect, calendarController.getRegisteredCourses);

module.exports = router;
