/**
 * Pagination helpers — consistent skip/limit + response metadata.
 */
const paginate = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit) || 1,
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

/**
 * Runs a paginated query and returns { items, meta }.
 */
const paginatedQuery = async (model, filter, { page = 1, limit = 20, sort = { createdAt: -1 }, populate = null, select = null }) => {
  const { skip } = paginate(page, limit);
  let query = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) query = query.populate(populate);
  if (select) query = query.select(select);
  const [items, total] = await Promise.all([query.lean({ virtuals: true }), model.countDocuments(filter)]);
  return { items, meta: paginationMeta(total, page, limit) };
};

module.exports = { paginate, paginationMeta, paginatedQuery };
