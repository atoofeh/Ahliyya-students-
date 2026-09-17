/**
 * What a student signed up for: the midterm, the final, or the whole course.
 * Mirrors ENROLLMENT_PACKAGES on the server.
 */
export const PACKAGES = [
  { value: 'mid', key: 'pkg.mid', label: 'Midterm', short: 'Mid', color: 'amber' },
  { value: 'final', key: 'pkg.final', label: 'Final', short: 'Final', color: 'blue' },
  { value: 'full', key: 'pkg.full', label: 'Full course', short: 'Full', color: 'green' },
];

export const packageOf = (value) => PACKAGES.find((p) => p.value === value) || PACKAGES[2];

/** The institution's currency. Mirrors DEFAULT_CURRENCY on the server. */
export const DEFAULT_CURRENCY = 'JOD';

/**
 * Money, written the way a person reads it. Up to three decimals, because the
 * dinar divides into 1000 fils — rounding a recorded amount for display would
 * make the page disagree with the books.
 */
export const money = (amount, currency = DEFAULT_CURRENCY) =>
  `${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${currency}`;
