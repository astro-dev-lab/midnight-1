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
  // Ensure CORS headers are always set, even for errors
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
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
