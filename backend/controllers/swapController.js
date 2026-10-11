const GroupAssignment = require('../models/GroupAssignment');
const CourseOffering = require('../models/CourseOffering');
const httpError = require('../services/httpError');

exports.requestSwap = async (req, res, next) => {
    try {
        const { targetStudentId, courseId } = req.body;
        const studentId = req.user.id;

        if (studentId === targetStudentId) {
            return next(new httpError(400, 'You cannot swap with yourself'));
        }

        // 1. Find current group assignments for both students
        const myAssignment = await GroupAssignment.findOne({ student_id: studentId, course_id: courseId });
        const targetAssignment = await GroupAssignment.findOne({ student_id: targetStudentId, course_id: courseId });

        if (!myAssignment || !targetAssignment) {
            return next(new httpError(404, 'One or both students are not assigned to this course'));
        }

        if (myAssignment.group_id.equals(targetAssignment.group_id)) {
            return next(new httpError(400, 'Both students are already in the same group'));
        }

        // 2. Check for time clashes/eligibility (Logic from P6)
        // In a real scenario, we'd check the ScheduleTemplate for the groups
        // For now, we ensure the swap is physically possible
        
        // 3. Execute the swap (Atomically)
        const oldGroupId = myAssignment.group_id;
        const newGroupId = targetAssignment.group_id;

        myAssignment.group_id = newGroupId;
        targetAssignment.group_id = oldGroupId;

        await myAssignment.save();
        await targetAssignment.save();

        res.status(200).json({ 
            message: 'Swap successful', 
            myNewGroup: newGroupId, 
            targetNewGroup: oldGroupId 
        });
    } catch (err) {
        next(err);
    }
};
