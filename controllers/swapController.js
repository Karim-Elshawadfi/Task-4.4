const GroupAssignment = require('../models/GroupAssignment');
const { HttpError } = require('../services/httpError');
const { withSchedulingTransaction } = require('../services/schedulingTransaction');

exports.requestSwap = async (req, res, next) => {
    try {
        const { targetStudentId, courseId } = req.body;
        const studentId = req.user._id;

        if (studentId === targetStudentId) {
            return next(new HttpError(400, 'You cannot swap with yourself'));
        }

        // Logic from P6: Atomic swap using Scheduling Transaction
        await withSchedulingTransaction(async (session) => {
            const myAssignment = await GroupAssignment.findOne({ student_id: studentId, course_id: courseId }).session(session);
            const targetAssignment = await GroupAssignment.findOne({ student_id: targetStudentId, course_id: courseId }).session(session);

            if (!myAssignment || !targetAssignment) {
                throw new HttpError(404, 'One or both students are not assigned to this course');
            }

            if (myAssignment.study_group === targetAssignment.study_group) {
                throw new HttpError(400, 'Both students are already in the same group');
            }

            // In a real P6 implementation, we would call a service like changeSeats() 
            // to handle the actual movement and capacity checks.
            const oldGroup = myAssignment.study_group;
            const newGroup = targetAssignment.study_group;

            myAssignment.study_group = newGroup;
            targetAssignment.study_group = oldGroup;

            await myAssignment.save({ session });
            await targetAssignment.save({ session });
        });

        res.status(200).json({ message: 'Swap successful' });
    } catch (err) {
        next(err);
    }
};
