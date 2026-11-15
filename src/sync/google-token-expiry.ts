export function tokenExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof decoded.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp * 1_000 : 0;
  } catch {
    return 0;
  }
}
