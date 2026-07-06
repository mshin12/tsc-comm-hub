/**
 * Extracts a tier number regardless of whether the source value is already
 * an integer (1) or a formatted string ("Tier 1", "tier_1", etc). Returns
 * null if no digit can be found.
 */
function parseTierNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

export { parseTierNumber };
