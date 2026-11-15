import { expect, it } from 'vitest';
import { serviceWorkerRoute } from '../../../src/pwa/sw-routing';

const scope = new URL('https://example.test/math-scratchpad/');
const files = new Set(['index.html', 'assets/main.js']);

it('routes only eligible app shell and image requests through cache', () => {
  const classify = (path: string, options: Partial<Request> = {}) =>
    serviceWorkerRoute(
      { url: new URL(path, scope).href, mode: 'cors', headers: new Headers(), method: 'GET', destination: '', ...options },
      scope,
      files,
    );
  expect(classify('./subpage', { mode: 'navigate' })).toBe('navigation');
  expect(classify('./assets/main.js')).toBe('shell-asset');
  for (const control of ['sw.js', 'version.json', 'pwa-control.json', 'precache-manifest.json']) {
    expect(classify(control, { mode: 'navigate' })).toBe('network');
  }
  expect(classify('./assets/main.js', { method: 'POST' })).toBe('network');
  expect(classify('./assets/main.js', { headers: new Headers({ Authorization: 'Bearer synthetic' }) })).toBe('network');
  expect(classify('/other-app/main.js', { mode: 'navigate' })).toBe('network');
  expect(classify('https://other.test/api')).toBe('network');
  expect(classify('https://other.test/lesson.png', { destination: 'image' })).toBe('image');
  expect(classify('./math.png', { destination: 'image' })).toBe('image');
});
