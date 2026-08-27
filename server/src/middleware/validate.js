const { z } = require('zod');
const ApiError = require('../core/ApiError');

/**
 * Zod validation middleware factory.
 * validate(schema)            → validates req.body
 * validate(schema, 'query')   → validates req.query
 * validate(schema, 'params')  → validates req.params
 * Replaces the source with the parsed (sanitized, defaulted) value.
 */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details));
  }
  if (source === 'query') {
    // Express 5 exposes req.query as a getter; mutate contents instead of reassigning.
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, result.data);
  } else {
    req[source] = result.data;
  }
  next();
};

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
});

module.exports = { validate, objectId, paginationSchema, z };
