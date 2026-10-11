// Req 22, 23, 25, 26, 27 — course offerings and their lecture, tutorial and lab slots.
// Creating, changing, deleting and publishing an offering is the Administrator's job.
// Coordinators and Advisors may read them, because a standard schedule (Req 28) is built
// from published offerings.
const express = require('express');
const { transactional } = require('../services/schedulingTransaction');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/offeringController');
const { handleErrors } = require('../services/httpError');

const router = express.Router();
router.use(protect);

const viewers = requireRole('ADMIN', 'COORDINATOR', 'ADVISOR');
const admin = requireRole('ADMIN');

// Fixed paths first, so they are not read as an offering id.
router.get('/options', viewers, c.getOptions); //                   form data for Req 22/25
router.put('/publication', admin, transactional(c.setTermPublication)); //         Req 27, a whole term at once

router.get('/', viewers, c.listOfferings); //                       Req 23
router.get('/:id', viewers, c.getOffering); //                      Req 23
router.post('/', admin, transactional(c.createOffering)); //                       Req 22
router.put('/:id', admin, transactional(c.updateOffering)); //                     Req 25
router.delete('/:id', admin, transactional(c.deleteOffering)); //                  Req 26
router.post('/:id/slots', admin, transactional(c.addSlot)); //                     Req 22
router.put('/:id/slots/:slotId', admin, transactional(c.updateSlot)); //           Req 25
router.delete('/:id/slots/:slotId', admin, transactional(c.deleteSlot)); //        Req 26
router.put('/:id/publication', admin, transactional(c.setPublication)); //         Req 27

router.use(handleErrors);
module.exports = router;
