const mongoose = require('mongoose');

const academicCalendarSchema = new mongoose.Schema({
    student_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentProfile',
        required: true
    },
    events: [{
        title: { type: String, required: true },
        date: { type: Date, required: true },
        type: { type: String, enum: ['EXAM', 'LECTURE', 'HOLIDAY', 'OTHER'], default: 'OTHER' },
        startTime: String,
        endTime: String,
        location: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('AcademicCalendar', academicCalendarSchema);
