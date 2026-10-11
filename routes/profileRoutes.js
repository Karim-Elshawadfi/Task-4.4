const express = require('express');
const { protect } = require('../middleware/auth');
const { handleErrors } = require('../services/httpError');
const { getProfile } = require('../controllers/profileController');

const router = express.Router();
router.use(protect);

router.get('/profile', getProfile); // Req 4: own profile only (every role)

router.use(handleErrors);
module.exports = router;
