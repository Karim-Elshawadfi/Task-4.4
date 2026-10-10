// DEV ONLY: creates .env from .env.example with a random JWT_SECRET (Person 1's login needs one of
// at least 32 characters). Does nothing if .env already exists. .env is git-ignored.
//   npm run setup:env
const fs = require('fs');
const { randomBytes } = require('crypto');

if (fs.existsSync('.env')) {
  console.log('.env already exists, nothing changed.');
} else {
  const text = fs.readFileSync('.env.example', 'utf8').replace(/^JWT_SECRET=\s*$/m, `JWT_SECRET=${randomBytes(32).toString('hex')}`);
  fs.writeFileSync('.env', text);
  console.log('Created .env with a random JWT_SECRET (password-reset emails need SMTP settings, not needed for testing).');
}
