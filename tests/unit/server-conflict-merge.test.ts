import { describe, expect, it } from 'vitest';
import { keepLocalServerConflictValue, mergeServerStateValues } from '../../src/sync/server-conflict-merge';

describe('server state three-way merge', () => {
  it('merges independent fields and stable-id array records', () => {
    const result = mergeServerStateValues('math-scratchpad-reading-position-v1',
      JSON.stringify({ section: 'first', flags: ['a'], checks: [{ id: 'one', answer: '' }, { id: 'two', answer: '' }] }),
      JSON.stringify({ section: 'local', flags: ['a', 'local'], checks: [{ id: 'one', answer: '42' }, { id: 'two', answer: '' }] }),
      JSON.stringify({ section: 'first', flags: ['a', 'remote'], checks: [{ id: 'one', answer: '' }, { id: 'two', answer: 'x' }] }));

    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) throw new Error('Expected a merged JSON value.');
    expect(JSON.parse(result.value)).toEqual({
      section: 'local', flags: ['a', 'local', 'remote'],
      checks: [{ id: 'one', answer: '42' }, { id: 'two', answer: 'x' }],
    });
  });

  it('merges separate questions in session envelopes and keeps usable local writer metadata', () => {
    const envelope = (firstAnswer: string, secondAnswer: string, revision: number, writerId: string) => JSON.stringify({
      version: 3,
      state: {
        session: { doc: { exerciseId: 'q1', exercises: [
          { id: 'q1', answer: firstAnswer }, { id: 'q2', answer: secondAnswer },
        ] }, prefs: { theme: 'dark' }, keyboardOpen: false },
        sync: { revision, writerId },
      },
    });
    const result = mergeServerStateValues('math-scratchpad-session-v3',
      envelope('', '', 4, 'base-tab'), envelope('local answer', '', 5, 'local-tab'), envelope('', 'remote answer', 7, 'remote-tab'));

    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) throw new Error('Expected a merged session.');
    expect(JSON.parse(result.value)).toEqual(JSON.parse(envelope('local answer', 'remote answer', 8, 'local-tab')));
  });

  it('reports overlapping fields and advances a locally selected session revision', () => {
    const base = JSON.stringify({ answer: '' });
    const local = JSON.stringify({ answer: 'local' });
    const remote = JSON.stringify({ answer: 'remote' });
    expect(mergeServerStateValues('math-scratchpad-reading-position-v1', base, local, remote)).toEqual({
      ok: false, conflictPaths: ['$.answer'],
    });

    const localSession = JSON.stringify({ version: 3, state: {
      session: { doc: { answer: 'local' }, prefs: {}, keyboardOpen: false },
      sync: { revision: 3, writerId: 'local-tab' },
    } });
    const remoteSession = JSON.stringify({ version: 3, state: {
      session: { doc: { answer: 'remote' }, prefs: {}, keyboardOpen: false },
      sync: { revision: 8, writerId: 'remote-tab' },
    } });
    const preserved = keepLocalServerConflictValue('math-scratchpad-session-v3', localSession, remoteSession);
    expect(preserved && JSON.parse(preserved).state.sync).toEqual({ revision: 9, writerId: 'local-tab' });
  });

  it('treats replacement edits to the same math sequence as overlapping', () => {
    const base = JSON.stringify({ expression: { children: [{ id: 'base-node', type: 'number', value: '1' }] } });
    const local = JSON.stringify({ expression: { children: [{ id: 'local-node', type: 'number', value: '8' }] } });
    const remote = JSON.stringify({ expression: { children: [{ id: 'remote-node', type: 'number', value: '9' }] } });

    expect(mergeServerStateValues('math-scratchpad-reading-position-v1', base, local, remote)).toEqual({
      ok: false, conflictPaths: ['$.expression.children'],
    });
  });
});
