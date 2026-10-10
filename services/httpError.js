class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// Express error handler for the terms/catalogue routes: keeps status codes and field errors.
// eslint-disable-next-line no-unused-vars
function handleErrors(err, req, res, next) {
  if (err.status && err.status < 500) {
    const { status, message, errors } = err;
    return res.status(status).json({ message, ...(errors ? { errors } : {}) });
  }
  if (err.code === 11000) return res.status(409).json({ message: 'This record already exists' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
}

module.exports = { HttpError, handleErrors };
