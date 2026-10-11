const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    student_id: {
        type: String, // UUID string to match team standards
        ref: 'StudentProfile',
        required: true,
        unique: true
    },
    balance: {
        type: Number, 
        default: 0, // Stored as integer piastres
        min: 0
    },
    transactions: [{
        type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
        amount: { type: Number, required: true },
        description: String,
        timestamp: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
