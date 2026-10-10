// In-memory stand-in for MongoDB so the terms/catalogue API tests run anywhere (no mongod).
// Replaces the Mongoose static methods the controllers use with array-backed versions that
// understand the MongoDB query language through `mingo`.
const mingo = require('mingo');

const clone = (x) => structuredClone(x);
const chain = (fn) => {
  const q = { lean: () => q, select: () => q, sort: () => q, limit: () => q, exec: () => fn(), then: (a, b) => fn().then(a, b) };
  return q;
};

function applyUpdate(doc, update, isInsert) {
  const plain = !Object.keys(update).some((k) => k.startsWith('$'));
  for (const [k, v] of Object.entries(plain ? update : update.$set || {})) doc[k] = clone(v);
  if (isInsert) for (const [k, v] of Object.entries(update.$setOnInsert || {})) doc[k] = clone(v);
  doc.updated_at = new Date();
  if (isInsert) doc.created_at = doc.updated_at;
}

function memoryModel(Model, rows = []) {
  const data = rows.map(clone);
  const matches = (filter) => mingo.find(data, filter || {}).all();
  const upsertOne = (filter, update, upsert) => {
    let doc = matches(filter)[0];
    const isInsert = !doc;
    if (isInsert && !upsert) return null;
    if (isInsert) { doc = { ...filter }; data.push(doc); }
    applyUpdate(doc, update, isInsert);
    return doc;
  };
  Model.find = (filter) => chain(async () => matches(filter).map(clone));
  Model.findOne = (filter) => chain(async () => clone(matches(filter)[0] ?? null));
  Model.findById = (id) => chain(async () => clone(data.find((d) => d._id === id) ?? null));
  Model.countDocuments = async (filter) => matches(filter).length;
  Model.create = async (doc) => {
    const d = { ...clone(doc), created_at: new Date(), updated_at: new Date() };
    if (!d._id) d._id = require('crypto').randomUUID();
    data.push(d);
    return clone(d);
  };
  Model.findOneAndUpdate = (filter, update, opts = {}) => chain(async () => clone(upsertOne(filter, update, opts.upsert)));
  Model.updateOne = async (filter, update, opts = {}) => { upsertOne(filter, update, opts.upsert); return { acknowledged: true }; };
  Model.deleteOne = async (filter) => {
    const doc = matches(filter)[0];
    if (doc) data.splice(data.indexOf(doc), 1);
    return { deletedCount: doc ? 1 : 0 };
  };
  Model.bulkWrite = async (ops) => {
    let upsertedCount = 0;
    for (const { updateOne } of ops) {
      const before = matches(updateOne.filter).length;
      upsertOne(updateOne.filter, updateOne.update, updateOne.upsert);
      if (!before) upsertedCount += 1;
    }
    return { upsertedCount };
  };
  return data;
}

module.exports = { memoryModel };
