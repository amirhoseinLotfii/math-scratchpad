import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen, within } from '@testing-library/react';
import { renderMobileApp } from '../support/render-mobile-app';
import { actions } from '../../src/store';
import { bankDocument, validateBank } from '../../src/features/drive-bank/drive-bank';
afterEach(() => { cleanup(); localStorage.clear(); });
const doc = () => bankDocument(validateBank({ schema_version: 'math-scratchpad.bank/1.0', bank_id: 'GEN', version: 'v3', questions: [
  { id: 'A', mode: 'math', source: '\\frac{3}{8}-\\frac{7}{8}', prompt: 'حاصل را ساده کن.' }, { id: 'B', mode: 'text', source: 'یک عدد بین ۱ و ۲ بنویس.' }] }), 'v3-x');

describe('bank questions in the app: RTL and accessibility', () => {
  it('Persian prompt is lang=fa dir=rtl while the editor stays LTR', () => {
    const { store } = renderMobileApp(); act(() => { store.dispatch(actions.load({ doc: doc() })); });
    const problem = screen.getByRole('region', { name: 'Current problem' });
    const p = within(problem).getByText('حاصل را ساده کن.'); expect(p.getAttribute('dir')).toBe('rtl'); expect(p.getAttribute('lang')).toBe('fa');
    expect(screen.getByRole('main', { name: 'Math Scratchpad' }).getAttribute('dir')).toBe('ltr');
  });
  it('text-mode question renders RTL', () => {
    const { store } = renderMobileApp(); act(() => { const d = doc(); d.exerciseId = d.exercises[1].id; d.cursor.stepId = d.exercises[1].steps[0].id; d.cursor.nodeId = (d.exercises[1].steps[0].expression.children[0]).id; store.dispatch(actions.load({ doc: d })); });
    const problem = screen.getByRole('region', { name: 'Current problem' }); const el = within(problem).getByText('یک عدد بین ۱ و ۲ بنویس.');
    expect(el.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
  });
  it('every button has an accessible name', () => {
    const { store } = renderMobileApp(); act(() => { store.dispatch(actions.load({ doc: doc() })); });
    for (const b of screen.getAllByRole('button')) expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim().length).toBeGreaterThan(0);
  });
});
