// Req 28, 29, 30 — standard schedule templates for normal students, and the students in them.
// Building and changing a standard schedule is the Coordinator's job; Administrators and
// Advisors may read it.
const express = require('express');
const { transactional } = require('../services/schedulingTransaction');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/templateController');
const { handleErrors } = require('../services/httpError');

const router = express.Router();
router.use(protect);

const viewers = requireRole('COORDINATOR', 'ADMIN', 'ADVISOR');
const coordinator = requireRole('COORDINATOR');

router.get('/options', viewers, c.getOptions); //                       published offerings to choose from

router.get('/', viewers, c.listTemplates); //                           Req 28/29
router.get('/:id', viewers, c.getTemplate); //                          Req 28/29
router.post('/', coordinator, transactional(c.createTemplate)); //                     Req 28
router.put('/:id', coordinator, transactional(c.updateTemplate)); //                   Req 29
router.delete('/:id', coordinator, transactional(c.deleteTemplate));
router.put('/:id/publication', coordinator, transactional(c.setPublication)); //       needed by Req 30

router.get('/:id/candidates', viewers, c.listCandidates); //            Req 30
router.post('/:id/students', coordinator, transactional(c.assignStudents)); //         Req 30 assign / reassign
router.delete('/:id/students/:studentId', coordinator, transactional(c.removeStudent)); // Req 30

router.use(handleErrors);
module.exports = router;
