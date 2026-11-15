import type { EditorAction } from '../../src/store';

const validAction: EditorAction = { type: 'keyboard', payload: true };
// @ts-expect-error A keyboard action requires a boolean payload.
const invalidAction: EditorAction = { type: 'keyboard', payload: 'true' };
void validAction;
void invalidAction;
