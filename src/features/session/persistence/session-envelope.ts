import { utf8Bytes } from '../../../../shared/contracts/limits';
import * as z from 'zod/mini';
import { initialState, type PersistedSession } from '../../../store';
import { validateSession } from '../../../persistence';
export const SESSION_KEY = 'math-scratchpad-session-v3';
const envelopeSchema = z.object({
  version: z.literal(3),
  state: z.object({
    session: z.object({ doc: z.unknown(), prefs: z.optional(z.unknown()), keyboardOpen: z.boolean() }),
    sync: z.object({ revision: z.number().check(z.int(), z.nonnegative()), writerId: z.string().check(z.minLength(1), z.maxLength(100)) }),
  }),
});
export type Envelope = { version: number; state: PersistedSession };
export function decode(raw: string): Envelope {
  const parsed = envelopeSchema.parse(JSON.parse(raw));
  const saved = validateSession({ version: 2, doc: parsed.state.session.doc, prefs: parsed.state.session.prefs });
  return {
    version: 3,
    state: {
      session: { doc: saved.doc, prefs: saved.prefs ?? initialState().prefs, keyboardOpen: parsed.state.session.keyboardOpen },
      sync: parsed.state.sync,
    },
  };
}
export function getSessionSyncBytes(session: PersistedSession['session']): number {
  return utf8Bytes(
    JSON.stringify({
      version: 3,
      state: {
        session,
        sync: { revision: Number.MAX_SAFE_INTEGER, writerId: '0'.repeat(36) },
      },
    }),
  );
}
export const fullSignature = (session: PersistedSession['session']) => JSON.stringify(session);
export const workSignature = (session: PersistedSession['session']) =>
  JSON.stringify({
    exercises: session.doc.exercises.map(({ elapsedMs, ...work }) => work),
    exerciseId: session.doc.exerciseId,
    prefs: session.prefs,
  });
