import axe from 'axe-core';
import { mkdirSync, writeFileSync } from 'node:fs';
let scanNumber = 0;
export const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export async function scanDOM(element: HTMLElement) {
 // JSDOM has no rendering/contrast or canvas text-measurement engine.
 // Browser axe scans enable BOTH rules without exclusions.
 const result = await axe.run(element, {
  runOnly: { type: 'tag', values: wcagTags },
  rules: { 'color-contrast': { enabled: false }, 'label-content-name-mismatch': { enabled: false } },
 });
 mkdirSync('test-results/axe-dom', { recursive: true });
 writeFileSync(`test-results/axe-dom/${process.pid}-${++scanNumber}.json`, JSON.stringify(result, null, 2));
 return result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(n => n.target) }));
}
