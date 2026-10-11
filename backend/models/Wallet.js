const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    student_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentProfile',
        required: true,
        unique: true
    },
    balance: {
        type: Number, 
        default: 0, // Stored as integer piastres to avoid rounding errors
        min: 0
    },
    currency: {
        type: String,
        default: 'EGP'
    }
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
