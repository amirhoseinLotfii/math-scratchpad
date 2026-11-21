import { describe, expect, it } from 'vitest';
import { advanceHlc, compareHlc, formatHlc, generateHlc, parseHlc } from '../../src/domain/sync/hlc';

describe('Hybrid Logical Clock (HLC) - UT-06', () => {
  const deviceA = 'device-laptop-a';
  const deviceB = 'device-phone-b';

  it('formats and parses HLC timestamps accurately', () => {
    const hlc = formatHlc(1732176000000, 5, deviceA);
    expect(hlc).toBe('1732176000000:0005:device-laptop-a');

    const parsed = parseHlc(hlc);
    expect(parsed.wall).toBe(1732176000000);
    expect(parsed.counter).toBe(5);
    expect(parsed.deviceId).toBe(deviceA);
  });

  it('throws on invalid HLC format', () => {
    expect(() => parseHlc('invalid')).toThrow();
    expect(() => parseHlc('abc:def:device')).toThrow();
  });

  it('compares HLC correctly by wall time, counter, and deviceId', () => {
    const t1 = formatHlc(1000, 0, deviceA);
    const t2 = formatHlc(2000, 0, deviceA);
    const t3 = formatHlc(2000, 1, deviceA);
    const t4 = formatHlc(2000, 1, deviceB);

    expect(compareHlc(t1, t2)).toBe(-1);
    expect(compareHlc(t2, t1)).toBe(1);
    expect(compareHlc(t2, t2)).toBe(0);

    expect(compareHlc(t2, t3)).toBe(-1);
    expect(compareHlc(t3, t4)).toBe(-1); // 'device-laptop-a' < 'device-phone-b'
  });

  it('generates monotonically increasing HLCs when Date.now() is stuck (UT-06)', () => {
    const stuckTime = 1732176000000;
    const hlc1 = generateHlc(null, deviceA, stuckTime);
    const hlc2 = generateHlc(hlc1, deviceA, stuckTime);
    const hlc3 = generateHlc(hlc2, deviceA, stuckTime);

    expect(hlc1).toBe('1732176000000:0000:device-laptop-a');
    expect(hlc2).toBe('1732176000000:0001:device-laptop-a');
    expect(hlc3).toBe('1732176000000:0002:device-laptop-a');

    expect(compareHlc(hlc1, hlc2)).toBe(-1);
    expect(compareHlc(hlc2, hlc3)).toBe(-1);
  });

  it('advances past remote HLC when receiving a future remote event (UT-06)', () => {
    const localNow = 1000;
    const remoteFuture = 5000;
    const localHlc = formatHlc(localNow, 1, deviceA);
    const remoteHlc = formatHlc(remoteFuture, 3, deviceB);

    const advanced = advanceHlc(localHlc, remoteHlc, deviceA, localNow);
    const parsed = parseHlc(advanced);

    expect(parsed.wall).toBe(remoteFuture);
    expect(parsed.counter).toBe(4);
    expect(parsed.deviceId).toBe(deviceA);
    expect(compareHlc(advanced, remoteHlc)).toBe(1);
  });
});
