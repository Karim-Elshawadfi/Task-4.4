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
        if (!amount || amount <= 0) {
            return next(new HttpError(400, 'Please provide a valid amount to spend'));
        }

        const wallet = await Wallet.findOne({ student_id: req.user._id });
        if (!wallet || wallet.balance < amount) {
            return next(new HttpError(400, 'Insufficient funds'));
        }

        wallet.balance -= amount;
        wallet.transactions.push({ type: 'DEBIT', amount, description, timestamp: new Date() });
        await wallet.save();
        res.status(200).json({ message: 'Payment successful', balance: wallet.balance });
    } catch (err) {
        next(err);
    }
};
