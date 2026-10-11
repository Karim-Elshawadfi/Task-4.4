const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const { handleErrors } = require('../services/httpError');
const { listUsers, updateUserStatus } = require('../controllers/adminController');

const router = express.Router();
router.use(protect, requireRole('ADMIN')); // Administrators only (403 for everyone else)

router.get('/users', listUsers); //                      list / search accounts
router.patch('/users/:id/status', updateUserStatus); //  Req 10: activate or deactivate

router.use(handleErrors);
module.exports = router;
