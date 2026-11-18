/**
 * Resolve one HTTP byte range against a file's plaintext length.
 * Unsupported units and multipart ranges are ignored (a full 200 response);
 * invalid or unsatisfiable single byte ranges return null (a 416 response).
 */
const resolveByteRange = (header, totalSize) => {
  const full = { start: 0, end: totalSize - 1, partial: false };
  if (!header || totalSize === 0) return full;

  const value = header.trim();
  if (!/^bytes=/i.test(value) || value.includes(',')) return full;
  const match = /^bytes=\s*(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  // Range numerals have no size limit. Clamp before converting to Number so
  // enormous offsets cannot overflow or lose precision during parsing.
  const size = BigInt(totalSize);
  const last = size - 1n;
  if (!match[1]) {
    const length = BigInt(match[2]);
    if (length === 0n) return null;
    return { start: length >= size ? 0 : Number(size - length), end: Number(last), partial: true };
  }

  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : last;
  if (start >= size || requestedEnd < start) return null;
  return { start: Number(start), end: Number(requestedEnd > last ? last : requestedEnd), partial: true };
};

module.exports = resolveByteRange;
