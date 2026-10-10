const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/termController');
const { handleErrors } = require('../services/httpError');

const router = express.Router();
router.use(protect);

const viewers = requireRole('ADMIN', 'COORDINATOR', 'ADVISOR');
router.get('/current', c.getCurrent); //                         any logged-in user
router.get('/', viewers, c.listTerms);
router.get('/:id', viewers, c.getTerm);
router.post('/', requireRole('ADMIN'), c.createTerm); //         Req 16
router.put('/:id', requireRole('ADMIN'), c.updateTerm); //       Req 17

router.use(handleErrors);
module.exports = router;
