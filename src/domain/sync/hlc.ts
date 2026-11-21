/**
 * Hybrid Logical Clock (HLC)
 * Format: <13-digit-ms>:<4-digit-counter>:<deviceId>
 * Example: 0001732176000:0000:dev-laptop
 */

export interface ParsedHLC {
  wall: number;
  counter: number;
  deviceId: string;
}

export function parseHlc(hlc: string): ParsedHLC {
  const parts = hlc.split(':');
  if (parts.length < 3) {
    throw new Error(`Invalid HLC format: "${hlc}"`);
  }
  const wall = parseInt(parts[0], 10);
  const counter = parseInt(parts[1], 10);
  const deviceId = parts.slice(2).join(':');

  if (Number.isNaN(wall) || Number.isNaN(counter) || !deviceId) {
    throw new Error(`Invalid HLC format: "${hlc}"`);
  }

  return { wall, counter, deviceId };
}

export function formatHlc(wall: number, counter: number, deviceId: string): string {
  const wallStr = String(Math.max(0, Math.floor(wall))).padStart(13, '0');
  const counterStr = String(Math.max(0, Math.min(9999, Math.floor(counter)))).padStart(4, '0');
  return `${wallStr}:${counterStr}:${deviceId}`;
}

/**
 * Compares two HLC timestamps.
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 */
export function compareHlc(a: string, b: string): number {
  if (a === b) return 0;
  const parsedA = parseHlc(a);
  const parsedB = parseHlc(b);

  if (parsedA.wall !== parsedB.wall) {
    return parsedA.wall < parsedB.wall ? -1 : 1;
  }
  if (parsedA.counter !== parsedB.counter) {
    return parsedA.counter < parsedB.counter ? -1 : 1;
  }
  if (parsedA.deviceId !== parsedB.deviceId) {
    return parsedA.deviceId < parsedB.deviceId ? -1 : 1;
  }
  return 0;
}

/**
 * Generates a new HLC timestamp monotonically advancing from lastHlc on the local device.
 */
export function generateHlc(
  lastHlc: string | null | undefined,
  deviceId: string,
  nowMs: number = Date.now()
): string {
  if (!lastHlc) {
    return formatHlc(nowMs, 0, deviceId);
  }

  const parsed = parseHlc(lastHlc);
  let wall = Math.max(nowMs, parsed.wall);
  let counter = 0;

  if (wall === parsed.wall) {
    counter = parsed.counter + 1;
    if (counter > 9999) {
      wall += 1;
      counter = 0;
    }
  }

  return formatHlc(wall, counter, deviceId);
}

/**
 * Advances the local HLC past an incoming remote HLC event.
 */
export function advanceHlc(
  localHlc: string | null | undefined,
  remoteHlc: string | null | undefined,
  deviceId: string,
  nowMs: number = Date.now()
): string {
  const parsedLocal = localHlc ? parseHlc(localHlc) : null;
  const parsedRemote = remoteHlc ? parseHlc(remoteHlc) : null;

  const localWall = parsedLocal ? parsedLocal.wall : 0;
  const remoteWall = parsedRemote ? parsedRemote.wall : 0;

  let wall = Math.max(nowMs, localWall, remoteWall);
  let counter = 0;

  if (wall === localWall && wall === remoteWall) {
    counter = Math.max(parsedLocal?.counter ?? 0, parsedRemote?.counter ?? 0) + 1;
  } else if (wall === localWall && parsedLocal) {
    counter = parsedLocal.counter + 1;
  } else if (wall === remoteWall && parsedRemote) {
    counter = parsedRemote.counter + 1;
  }

  if (counter > 9999) {
    wall += 1;
    counter = 0;
  }

  return formatHlc(wall, counter, deviceId);
}
