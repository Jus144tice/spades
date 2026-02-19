export const DEFAULTS = {
  cardSort: 'C,D,S,H:asc',
  tableColor: '#0f1923',
};

export const PRESETS = {
  hearts:     { label: 'Hearts',          value: 'C,D,S,H:asc' },
  spadesFirst: { label: 'Spades First',   value: 'S,H,D,C:desc' },
  bridge:     { label: 'Bridge',          value: 'S,H,D,C:asc' },
  highFirst:  { label: 'High Cards First', value: 'C,D,S,H:desc' },
};

export const TABLE_COLORS = [
  { label: 'Dark Blue',        value: '#0f1923' },
  { label: 'Green Felt',       value: '#1a472a' },
  { label: 'Dark Grey',        value: '#2a2a2a' },
  { label: 'Midnight Purple',  value: '#1a1028' },
  { label: 'Deep Red Felt',    value: '#3a1a1a' },
];

const VALID_SUITS = new Set(['S', 'H', 'D', 'C']);
const VALID_COLORS = new Set(TABLE_COLORS.map(c => c.value));

/**
 * Parse a card sort string like "C,D,S,H:asc" into usable sort config.
 * Returns { suitOrder: { C: 0, D: 1, S: 2, H: 3 }, rankDirection: 'asc'|'desc' }
 */
export function parseCardSort(str) {
  if (!str || typeof str !== 'string') {
    return parseCardSort(DEFAULTS.cardSort);
  }

  const [suitPart, direction] = str.split(':');
  const suits = suitPart.split(',').map(s => s.trim().toUpperCase());

  // Validate: must be exactly 4 unique valid suits
  if (suits.length !== 4 || !suits.every(s => VALID_SUITS.has(s)) || new Set(suits).size !== 4) {
    return parseCardSort(DEFAULTS.cardSort);
  }

  const rankDirection = direction === 'desc' ? 'desc' : 'asc';
  const suitOrder = {};
  suits.forEach((s, i) => { suitOrder[s] = i; });

  return { suitOrder, rankDirection };
}

/**
 * Validate and sanitize preferences object from client input.
 */
export function validatePreferences(prefs) {
  const result = {};

  if (prefs.cardSort && typeof prefs.cardSort === 'string') {
    // Validate by parsing - if it falls back to defaults, the string was invalid
    const parsed = parseCardSort(prefs.cardSort);
    // Reconstruct the canonical form
    const suits = Object.entries(parsed.suitOrder)
      .sort((a, b) => a[1] - b[1])
      .map(([s]) => s);
    result.cardSort = `${suits.join(',')}:${parsed.rankDirection}`;
  }

  if (prefs.tableColor && typeof prefs.tableColor === 'string') {
    result.tableColor = VALID_COLORS.has(prefs.tableColor) ? prefs.tableColor : DEFAULTS.tableColor;
  }

  return result;
}

/**
 * Merge user preferences with defaults, filling in missing fields.
 */
export function mergeWithDefaults(prefs) {
  return { ...DEFAULTS, ...prefs };
}

/**
 * Check if a user has completed their initial preferences setup.
 * Currently always true — all users get defaults on creation.
 * Kept for future use if we re-enable the setup screen.
 */
export function hasCompletedSetup(prefs) {
  return true;
}
