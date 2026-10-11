const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

router.get('/balance', protect, walletController.getBalance);
router.post('/spend', protect, walletController.spendFunds);

module.exports = router;
