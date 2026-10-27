// The intended account is checked without publishing its address in the public repository.
const EXPECTED_ACCOUNT_HASH = '5722e9ceb3077a549643b3e349b6b44058f422818edfddec115e9703a07fc024';
export async function permittedAccount(profile: unknown): Promise<boolean> {
  if (!profile || typeof profile !== 'object' || !('email' in profile) || typeof profile.email !== 'string' || !('email_verified' in profile) || profile.email_verified !== true) return false;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(profile.email.toLowerCase()));
  return Array.from(new Uint8Array(hash)).map(x => x.toString(16).padStart(2, '0')).join('') === EXPECTED_ACCOUNT_HASH;
}
