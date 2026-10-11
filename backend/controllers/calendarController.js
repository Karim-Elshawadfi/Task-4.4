const AcademicCalendar = require('../models/AcademicCalendar');
const httpError = require('../services/httpError');

exports.getCalendar = async (req, res, next) => {
    try {
        const calendar = await AcademicCalendar.findOne({ student_id: req.user.id });
        res.status(200).json(calendar ? calendar.events : []);
    } catch (err) {
        next(err);
    }
};

exports.addEvent = async (req, res, next) => {
    try {
        const { title, date, type, startTime, endTime, location } = req.body;
        
        let calendar = await AcademicCalendar.findOne({ student_id: req.user.id });
        if (!calendar) {
            calendar = new AcademicCalendar({ student_id: req.user.id, events: [] });
        }
        
        calendar.events.push({ title, date, type, startTime, endTime, location });
        await calendar.save();
        res.status(201).json(calendar.events);
    } catch (err) {
        next(err);
    }
};

exports.removeEvent = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const calendar = await AcademicCalendar.findOne({ student_id: req.user.id });
        if (!calendar) return next(new httpError(404, 'Calendar not found'));

        calendar.events = calendar.events.filter(e => e._id.toString() !== eventId);
        await calendar.save();
        res.status(200).json({ message: 'Event removed' });
    } catch (err) {
        next(err);
    }
};
