import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import type { GoogleIdentity } from './env';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const MAX_TOKEN_LENGTH = 10_000;

/** Verify Google's signed ID token. The optional resolver is useful for cryptographic tests. */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  keyResolver: JWTVerifyGetKey = GOOGLE_JWKS,
): Promise<GoogleIdentity> {
  if (!token || token.length > MAX_TOKEN_LENGTH || !clientId) throw new Error('Invalid Google ID token.');

  const { payload } = await jwtVerify(token, keyResolver, {
    audience: clientId,
    issuer: [...GOOGLE_ISSUERS],
    algorithms: ['RS256'],
    clockTolerance: 5,
    maxTokenAge: '1h',
  });

  if ((payload.azp !== undefined && payload.azp !== clientId)
    || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) {
    throw new Error('Invalid Google ID token audience.');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 255
    || typeof payload.email !== 'string' || payload.email.length > 320
    || typeof payload.exp !== 'number'
    || payload.email_verified !== true) {
    throw new Error('Google ID token is missing verified account claims.');
  }

  return { sub: payload.sub, email: payload.email, email_verified: true };
}
