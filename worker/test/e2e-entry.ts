import { createApp, type IdTokenVerifier } from '../src/index';
export { LearningEventStore } from '../src/event-store';

const verifySyntheticE2eToken: IdTokenVerifier = async token => {
  if (!/^head\.[A-Za-z0-9_-]+\.signature$/.test(token)) throw new Error('Only the local E2E token fixture is accepted.');
  return { sub: 'synthetic-aud-003-owner', email: 'qa-fixture@example.test', email_verified: true };
};

// This entrypoint is referenced only by the local Wrangler E2E config and is never deployed.
export default createApp(verifySyntheticE2eToken);
