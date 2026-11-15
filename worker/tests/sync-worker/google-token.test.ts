import { beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { verifyGoogleIdToken } from '../../src/auth';
import { OWNER_EMAIL, CLIENT_ID, OWNER } from '../helpers/sync-worker';
describe('Google ID token verification', () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  let resolver: JWTVerifyGetKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair('RS256'));
    resolver = async () => publicKey;
  });

  async function token(
    claims: Record<string, unknown> = {},
    options: { audience?: string | string[]; issuer?: string; expires?: string | number } = {},
  ) {
    return new SignJWT({ email: OWNER_EMAIL, email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(options.issuer ?? 'https://accounts.google.com')
      .setAudience(options.audience ?? CLIENT_ID)
      .setSubject('google-subject-for-test')
      .setIssuedAt()
      .setExpirationTime(options.expires ?? '2m')
      .sign(privateKey);
  }

  it('accepts an RS256 token from Google with the configured audience and verified identity', async () => {
    const identity = await verifyGoogleIdToken(await token(), CLIENT_ID, resolver);
    expect(identity).toEqual(OWNER);
  });

  it.each([
    ['wrong audience', { audience: 'another-client.apps.googleusercontent.com' }],
    ['missing authorized party for multiple audiences', { audience: [CLIENT_ID, 'another-client.apps.googleusercontent.com'] }],
    ['wrong issuer', { issuer: 'https://attacker.example' }],
    ['expired token', { expires: 946684800 }],
  ])('rejects a token with %s', async (_reason, options) => {
    await expect(verifyGoogleIdToken(await token({}, options), CLIENT_ID, resolver)).rejects.toThrow();
  });

  it('rejects a token without Google verified-email claims', async () => {
    await expect(verifyGoogleIdToken(await token({ email_verified: false }), CLIENT_ID, resolver)).rejects.toThrow();
  });

  it('rejects a token with a bad signature', async () => {
    const otherPair = await generateKeyPair('RS256');
    const forged = await new SignJWT({ email: OWNER_EMAIL, email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject('google-subject-for-test')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(otherPair.privateKey);
    await expect(verifyGoogleIdToken(forged, CLIENT_ID, resolver)).rejects.toThrow();
  });
});
