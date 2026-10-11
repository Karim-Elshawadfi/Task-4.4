require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/runSql.js <path-to-sql-file>');
  process.exit(1);
}

(async () => {
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    await pool.query(sql);
    console.log(`Ran ${file} successfully.`);
  } catch (err) {
    console.error(`Failed running ${file}:`, err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();