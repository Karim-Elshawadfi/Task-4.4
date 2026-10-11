const Wallet = require('../models/Wallet');
const httpError = require('../services/httpError');

exports.getBalance = async (req, res, next) => {
    try {
        const wallet = await Wallet.findOne({ student_id: req.user.id });
        if (!wallet) {
            return next(new httpError(404, 'Wallet not found for this student'));
        }
        res.status(200).json({ balance: wallet.balance });
    } catch (err) {
        next(err);
    }
};

exports.addFunds = async (req, res, next) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return next(new httpError(400, 'Please provide a valid amount to add'));
        }

        let wallet = await Wallet.findOne({ student_id: req.user.id });
        if (!wallet) {
            wallet = new Wallet({ student_id: req.user.id, balance: 0 });
        }

        wallet.balance += amount;
        await wallet.save();
        res.status(200).json({ message: 'Funds added successfully', balance: wallet.balance });
    } catch (err) {
        next(err);
    }
};

exports.spendFunds = async (req, res, next) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return next(new httpError(400, 'Please provide a valid amount to spend'));
        }

        const wallet = await Wallet.findOne({ student_id: req.user.id });
        if (!wallet || wallet.balance < amount) {
            return next(new httpError(400, 'Insufficient funds'));
        }

        wallet.balance -= amount;
        await wallet.save();
        res.status(200).json({ message: 'Payment successful', balance: wallet.balance });
    } catch (err) {
        next(err);
    }
};
