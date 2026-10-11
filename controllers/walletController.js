const Wallet = require('../models/Wallet');
const { HttpError } = require('../services/httpError');

exports.getBalance = async (req, res, next) => {
    try {
        const wallet = await Wallet.findOne({ student_id: req.user._id });
        if (!wallet) {
            return next(new HttpError(404, 'Wallet not found for this student'));
        }
        res.status(200).json({ balance: wallet.balance, transactions: wallet.transactions });
    } catch (err) {
        next(err);
    }
};

exports.spendFunds = async (req, res, next) => {
    try {
        const { amount, description } = req.body;
        if (!Number.isInteger(amount) || amount <= 0) {
            return next(new HttpError(400, 'Please provide a positive integer amount in piastres'));
        }

        // Atomic update to prevent overspending
        const wallet = await Wallet.findOneAndUpdate(
            { student_id: req.user._id, balance: { $gte: amount } },
            { 
                $inc: { balance: -amount },
                $push: { transactions: { type: 'DEBIT', amount, description, timestamp: new Date() } }
            },
            { new: true }
        );

        if (!wallet) {
            return next(new HttpError(400, 'Insufficient funds or wallet not found'));
        }

        res.status(200).json({ message: 'Payment successful', balance: wallet.balance });
    } catch (err) {
        next(err);
    }
};
