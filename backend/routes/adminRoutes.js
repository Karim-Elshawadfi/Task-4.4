const express = require('express');
const { listUsers, updateUserStatus } = require('../controllers/adminController');

const router = express.Router();

router.get('/users', listUsers);
router.patch('/users/:id/status', updateUserStatus);

module.exports = router;
