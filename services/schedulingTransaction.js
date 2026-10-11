const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('node:async_hooks');
const SchedulingWrite = require('../models/SchedulingWrite');
const { HttpError } = require('./httpError');

// Mongoose propagates the session to every model operation within the callback.
// Keep database operations sequential inside transactions.
mongoose.set('transactionAsyncLocalStorage', true);
const scope = new AsyncLocalStorage();
const setupMessage = 'Scheduling changes require a MongoDB replica set. For a local database, run npm run mongo and use the printed MONGO_URI; MongoDB Atlas also supports transactions.';

async function assertTransactionSupport() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new HttpError(503, setupMessage);
}

async function initializeScheduling() {
  for (const name of ['CourseOffering', 'ScheduleTemplate', 'GroupAssignment', 'WorkflowAction']) {
    await require(`../models/${name}`).init();
  }
  await SchedulingWrite.init();
  try {
    await SchedulingWrite.updateOne({ _id: 'p6' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  } catch (error) {
    // Two processes may initialize the same singleton concurrently.
    if (error.code !== 11000) throw error;
  }
}

async function withSchedulingTransaction(action) {
  if (scope.getStore()) throw new Error('Do not nest scheduling transactions.');
  await assertTransactionSupport();
  await initializeScheduling();
  try {
    return await mongoose.connection.transaction(async () => {
      await SchedulingWrite.updateOne({ _id: 'p6' }, { $inc: { revision: 1 } });
      return scope.run(true, action);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } catch (error) {
    if (error.code === 20) throw new HttpError(503, setupMessage);
    throw error;
  }
}

function requireSchedulingTransaction() {
  if (!scope.getStore()) throw new Error('Seat changes must run inside withSchedulingTransaction().');
}

// Controllers keep their JSON contract, but no success response is sent before
// commit. A failed commit therefore cannot claim that an assignment was saved.
function transactional(handler) {
  return async (req, res, next) => {
    try {
      const response = await withSchedulingTransaction(async () => {
        let status = 200;
        let body;
        const buffered = {
          status(value) { status = value; return this; },
          json(value) { body = value; return this; },
        };
        await handler(req, buffered, error => { throw error; });
        if (body === undefined) throw new Error('Scheduling handler did not return a response.');
        return { status, body };
      });
      res.status(response.status).json(response.body);
    } catch (error) { next(error); }
  };
}

module.exports = { transactional, withSchedulingTransaction, requireSchedulingTransaction,
  initializeScheduling, assertTransactionSupport };
