// DEV ONLY: starts a temporary MongoDB on port 27017 for local testing (data is lost when closed).
//   npm run mongo      (leave this window open)
const { MongoMemoryReplSet } = require('mongodb-memory-server');

MongoMemoryReplSet.create({ instanceOpts: [{ port: 27017 }], replSet: { count: 1 } })
  .then((m) => console.log(`MongoDB ready: ${m.getUri()}  (close this window to stop it)`))
  .catch((e) => { console.error(e.message); process.exit(1); });
setInterval(() => {}, 1 << 30);
