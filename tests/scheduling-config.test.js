const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { assertTransactionSupport, transactional } = require('../services/schedulingTransaction');

test('standalone MongoDB fails clearly before unsafe scheduling writes', async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    await assert.rejects(assertTransactionSupport(), /replica set.*npm run mongo/);
    let executed = false;
    let error;
    await transactional(async (req, res) => { executed = true; res.json({ok:true}); })({}, {
      status() { throw new Error('Must not send a success response'); },
    }, e => { error = e; });
    assert.equal(executed, false);
    assert.equal(error.status, 503);
    assert.match(error.message, /replica set/);
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});
