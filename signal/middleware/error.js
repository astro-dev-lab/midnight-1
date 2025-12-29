const { validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors from express-validator
 */
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
}

/**
 * Generic error handler middleware
 */
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const response = {
    error: message
  };
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }
  res.status(status).json(response);
}

module.exports = {
  validateRequest,
  errorHandler
};
