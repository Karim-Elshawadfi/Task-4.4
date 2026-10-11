const express = require('express');
const { protect } = require('../middleware/auth');
const { handleErrors } = require('../services/httpError');
const { listNotifications, markNotificationRead } = require('../controllers/notificationController');

const router = express.Router();
router.use(protect);

router.get('/', listNotifications); //                  Req 5: list own notifications, newest first
router.patch('/:id/read', markNotificationRead); //     Req 5: mark one as read

router.use(handleErrors);
module.exports = router;
