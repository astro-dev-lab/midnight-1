module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const response = {
    error: message
  };
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }
  res.status(status).json(response);
};
