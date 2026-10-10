const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/catalogueController');
const { handleErrors } = require('../services/httpError');

const router = express.Router();
router.use(protect);

const admin = requireRole('ADMIN');
const viewers = requireRole('ADMIN', 'COORDINATOR', 'ADVISOR'); // staff need the catalogue when scheduling

router.post('/courses/import', admin, c.importCourses); //     Req 128 (before /:code)
router.get('/courses', viewers, c.listCourses); //              Req 19
router.get('/courses/:code', viewers, c.getCourse); //          Req 19
router.post('/courses', admin, c.createCourse); //              Req 18
router.put('/courses/:code', admin, c.updateCourse); //         Req 20
router.delete('/courses/:code', admin, c.deleteCourse); //      Req 21

router.use(handleErrors);
module.exports = router;
