const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swapController');
const { protect } = require('../middleware/auth');

router.post('/request', protect, swapController.requestSwap);

module.exports = router;
