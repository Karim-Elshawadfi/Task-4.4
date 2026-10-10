const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const { handleErrors } = require('../services/httpError');
const c = require('../controllers/academicController');

const router = express.Router();
router.use(protect);

// Advising Student — own data only (the id comes from the login, not the URL)
router.get('/preferences', requireRole('STUDENT'), c.getMyPreferences); //                        view my own
router.put('/preferences', requireRole('STUDENT'), c.updateMyPreferences); //                     Req 57

// Advisor (assigned students only) / Coordinator (any advising student)
router.get('/preferences/:studentId', requireRole('ADVISOR', 'COORDINATOR'), c.getStudentPreferences); //   Req 58
router.get('/failed-unattended/:studentId', requireRole('ADVISOR', 'COORDINATOR'), c.getFailedAndUnattended); // Req 61

router.use(handleErrors);
module.exports = router;
