const { z } = require('zod');

const RegisterSchema = z.object({
  email: z.string().min(1, 'email required'),
  password: z.string().min(8, 'password must be at least 8 chars')
});

const LoginSchema = z.object({
  email: z.string().min(1, 'email required'),
  password: z.string().min(8, 'password must be at least 8 chars')
});

const PingCreateSchema = z.object({
  message: z.string().optional()
});

const PingUpdateSchema = z.object({
  message: z.string().optional()
});

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map(i => ({ path: i.path, message: i.message }))
    });
  }
  req.body = result.data;
  next();
};

module.exports = {
  RegisterSchema,
  LoginSchema,
  PingCreateSchema,
  PingUpdateSchema,
  validate
};
