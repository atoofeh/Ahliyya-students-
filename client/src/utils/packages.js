/**
 * What a student signed up for: the midterm, the final, or the whole course.
 * Mirrors ENROLLMENT_PACKAGES on the server.
 */
export const PACKAGES = [
  { value: 'mid', label: 'Midterm', short: 'Mid', color: 'amber' },
  { value: 'final', label: 'Final', short: 'Final', color: 'blue' },
  { value: 'full', label: 'Full course', short: 'Full', color: 'green' },
];

export const packageOf = (value) => PACKAGES.find((p) => p.value === value) || PACKAGES[2];

/** Money, written the way a person reads it. */
export const money = (amount, currency = 'USD') =>
  `${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
