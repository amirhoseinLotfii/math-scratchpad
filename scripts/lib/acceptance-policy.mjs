export const requiredManualChecks = Object.freeze([
 'talkback-reading', 'talkback-editing', 'talkback-modal', 'android-touch',
 'android-text-and-zoom', 'android-safe-areas', 'external-keyboard', 'clipboard-recovery',
 'multi-tab-recovery', 'contrast-review', 'visual-baselines', 'axe-incomplete-triage',
 'wide-chrome-keyboard', 'wide-firefox-zoom', 'wide-nvda-reading',
 'wide-voiceover-editing', 'wide-pointer-scroll', 'wide-layout-acceptance',
]);
/** @param {unknown} input @returns {string[]} */
export function validateManualAcceptance(input) {
 if (!input || typeof input !== 'object') return ['Manual acceptance record must be an object.'];
 const record = /** @type {Record<string, unknown>} */ (input);
 const errors = [];
 for (const key of ['device','osVersion','browser','browserVersion','assistiveTechnology','reviewedBy','reviewedAt']) {
  if (typeof record[key] !== 'string' || !record[key].trim()) errors.push(`Missing ${key}.`);
 }
 if (typeof record.reviewedAt === 'string' && !Number.isFinite(Date.parse(record.reviewedAt))) errors.push('Invalid reviewedAt.');
 if (!Array.isArray(record.checks)) return [...errors, 'Missing checks array.'];
 const seen = new Set();
 for (const item of record.checks) {
  if (!item || typeof item !== 'object') { errors.push('Invalid manual check.'); continue; }
  const check = /** @type {Record<string, unknown>} */ (item);
  if (typeof check.id !== 'string' || !requiredManualChecks.includes(check.id)) { errors.push('Unknown manual check.'); continue; }
  if (seen.has(check.id)) errors.push(`Duplicate ${check.id}.`);
  seen.add(check.id);
  if (check.status !== 'passed') errors.push(`${check.id} is not passed.`);
  if (typeof check.evidence !== 'string' || !check.evidence.trim()) errors.push(`${check.id} lacks evidence.`);
 }
 for (const id of requiredManualChecks) if (!seen.has(id)) errors.push(`Missing check ${id}.`);
 return errors;
}
