const express = require('express');
const { getNotifications, markNotificationRead } = require('../controllers/notificationController');

const router = express.Router();

router.get('/', getNotifications);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
