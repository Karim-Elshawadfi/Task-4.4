const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const { handleErrors } = require('../services/httpError');
const c = require('../controllers/advisorController');

const router = express.Router();
router.use(protect);

router.get('/', requireRole('COORDINATOR'), c.listAdvisors); //                   advisor list for the Coordinator screen
router.post('/add', requireRole('COORDINATOR'), c.addAdvisor); //                  Req 11 (+13)
router.delete('/remove/:email', requireRole('COORDINATOR'), c.removeAdvisor); //   Req 12 (+13)
router.post('/assign', requireRole('COORDINATOR'), c.assignAdvisor); //            Req 14
router.get('/my-advisor', requireRole('STUDENT'), c.getMyAdvisor); //              Req 15

router.use(handleErrors);
module.exports = router;
