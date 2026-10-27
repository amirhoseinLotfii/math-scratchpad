import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboard } from '../../src/review';
const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const exec = Object.getOwnPropertyDescriptor(document, 'execCommand');
afterEach(() => {
 vi.restoreAllMocks(); document.body.innerHTML = '';
 if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard); else delete (navigator as any).clipboard;
 if (exec) Object.defineProperty(document, 'execCommand', exec); else delete (document as any).execCommand;
});
describe('Clipboard failure paths and truthful reporting', () => {
 it('reports success only after the native clipboard write resolves', async () => {
  let resolve!: () => void; const pending = new Promise<void>(r => { resolve = r; });
  const copy = vi.fn(() => pending); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  let done = false; const result = writeClipboard('full session').then(x => { done = true; return x; });
  await Promise.resolve(); expect(done).toBe(false);
  resolve(); expect(await result).toBe(true); expect(copy).toHaveBeenCalledWith('full session');
 });
 it.each([true, false])('returns legacy clipboard result %s and restores focused editor', async success => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => success) });
  const editor = document.createElement('button'); document.body.append(editor); editor.focus();
  expect(await writeClipboard('session')).toBe(success); expect(document.activeElement).toBe(editor);
  expect(document.querySelector('textarea')).toBeNull();
 });
 it('falls back after native denial and removes temporary nodes even when legacy copy throws', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => { throw Error('Blocked'); }) });
  expect(await writeClipboard('session')).toBe(false); expect(document.querySelector('textarea')).toBeNull();
 });
});
