const FORBIDDEN_SEGMENTS = new Set(['answer', 'answers', 'solution', 'solutions', 'correct', 'key', 'keys', 'expected', 'rubric', 'verification']);

/** Splits a field name into words (answer_key, answerKey, ANSWER-KEY, answer.key -> answer, key), so "keyboard" or "monkey" are not flagged. */
export function forbiddenKey(name: string): boolean {
  if (name.toLowerCase() === 'answertype') return false;
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(w => FORBIDDEN_SEGMENTS.has(w)) || words.join('_') === 'final_answer';
}

/** Returns the path of the first answer/key-like field anywhere in the JSON, or null. */
export function findForbiddenKey(value: unknown, path = '', depth = 0): string | null {
  if (depth > 64 || !value || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value)) {
    const here = Array.isArray(value) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
    if (!Array.isArray(value) && forbiddenKey(k)) return here;
    const inner = findForbiddenKey(v, here, depth + 1);
    if (inner) return inner;
  }
  return null;
}

const OMIT = Symbol('omit-answer-like-content');

export function stripAnswerLikeFields(value: unknown, path: string, warnings: string[], depth = 0): unknown | typeof OMIT {
  if (depth > 64) {
    warnings.push(`${path || 'bank'}: content deeper than 64 levels was ignored`);
    return OMIT;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => stripAnswerLikeFields(item, `${path}[${index}]`, warnings, depth + 1)).filter(item => item !== OMIT);
  }
  if (!value || typeof value !== 'object') return value;
  const clean = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (forbiddenKey(key)) {
      warnings.push(`${here}: answer-like field was removed`);
      continue;
    }
    const next = stripAnswerLikeFields(item, here, warnings, depth + 1);
    if (next !== OMIT) clean[key] = next;
  }
  return clean;
}
