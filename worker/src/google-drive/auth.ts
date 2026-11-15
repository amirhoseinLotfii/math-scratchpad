import { configuredOwner } from '../owner';
import type { WorkerEnv } from '../env';
import { GOOGLE_TOKEN_API, GOOGLE_DRIVE_ABOUT_API } from './config';
import { readJson, errorForStatus } from './http';
import { DriveMirrorError } from './types';

export async function refreshDriveAccessToken(
  env: WorkerEnv,
  fetcher: typeof fetch,
  recordStage: (stage: string) => void,
): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET!,
    refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  });
  let response: Response;
  recordStage('oauth_refresh');
  try {
    response = await fetcher(GOOGLE_TOKEN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    recordStage('oauth_refresh_fetch_rejected');
    throw new DriveMirrorError('network_error');
  }
  if (!response.ok) {
    // Google's OAuth error *code* is a fixed public protocol value. Never
    // persist the response body, error_description, token or client secret.
    let reason = 'unknown';
    try {
      const payload: unknown = await response.json();
      const candidate = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : undefined;
      if (
        typeof candidate === 'string' &&
        ['invalid_client', 'invalid_grant', 'unauthorized_client', 'invalid_request', 'access_denied', 'temporarily_unavailable'].includes(
          candidate,
        )
      )
        reason = candidate;
    } catch {
      /* Ignore and retain the HTTP status. */
    }
    recordStage(`oauth_refresh_http_${response.status}_${reason}`);
    throw new DriveMirrorError(
      response.status === 400 || response.status === 401 ? 'reauthorization_required' : errorForStatus(response.status).code,
    );
  }
  const token = await readJson<{ access_token?: unknown; expires_in?: unknown }>(response);
  if (typeof token.access_token !== 'string' || !token.access_token || typeof token.expires_in !== 'number') {
    throw new DriveMirrorError('invalid_response');
  }

  let identityResponse: Response;
  recordStage('drive_owner_verification');
  try {
    // Drive about.get works with drive.file; userinfo would incorrectly require
    // an additional Google profile scope and block a valid Drive-only token.
    identityResponse = await fetcher(GOOGLE_DRIVE_ABOUT_API, { headers: { Authorization: `Bearer ${token.access_token}` } });
  } catch {
    recordStage('drive_owner_verification_fetch_rejected');
    throw new DriveMirrorError('network_error');
  }
  if (!identityResponse.ok) {
    recordStage(`drive_owner_verification_http_${identityResponse.status}`);
    throw new DriveMirrorError(identityResponse.status === 401 ? 'reauthorization_required' : errorForStatus(identityResponse.status).code);
  }
  const identity = await readJson<{ user?: { emailAddress?: unknown; me?: unknown } }>(identityResponse);
  if (
    typeof identity.user?.emailAddress !== 'string' ||
    identity.user.emailAddress.trim().toLowerCase() !== configuredOwner(env) ||
    identity.user.me !== true
  ) {
    throw new DriveMirrorError('account_mismatch');
  }
  return { accessToken: token.access_token, expiresIn: token.expires_in };
}
