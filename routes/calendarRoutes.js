const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { protect } = require('../middleware/auth');

router.get('/', protect, calendarController.getCalendar);
router.post('/add', protect, calendarController.addEvent);
router.delete('/remove/:eventId', protect, calendarController.removeEvent);

module.exports = router;
