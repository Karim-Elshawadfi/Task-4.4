const GroupAssignment = require('../models/GroupAssignment');
const { HttpError } = require('../services/httpError');

exports.getWeeklyCalendar = async (req, res, next) => {
    try {
        const studentId = req.user._id;
        // P6 Requirement: Calendar must be built from student's assigned group
        const assignments = await GroupAssignment.find({ student_id: studentId });
        
        if (!assignments || assignments.length === 0) {
            return res.status(200).json([]);
        }

        // Map assignments to a weekly format (Saturday to Thursday)
        const weeklySchedule = assignments.map(assign => ({
            courseId: assign.course_id,
            studyGroup: assign.study_group,
            templateId: assign.template_id,
            semester: assign.semester
        }));

        res.status(200).json(weeklySchedule);
    } catch (err) {
        next(err);
    }
};

exports.getRegisteredCourses = async (req, res, next) => {
    try {
        const assignments = await GroupAssignment.find({ student_id: req.user._id });
        const courses = await GroupAssignment.populate(assignments, 'course_id');
        
        let totalCredits = 0;
        const registered = assignments.map(a => {
            // Assuming Course model has a 'credits' field
            // totalCredits += a.course_id.credits || 0;
            return a.course_id;
        });

        res.status(200).json({ registered, totalCredits });
    } catch (err) {
        next(err);
    }
};
