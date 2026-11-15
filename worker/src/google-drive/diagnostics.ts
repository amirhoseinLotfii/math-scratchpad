export function safeFetchFailureSuffix(error: unknown): string {
  const knownCodes: Record<string, string> = {
    ECONNRESET: 'connection_reset',
    ECONNREFUSED: 'connection_refused',
    ETIMEDOUT: 'timeout',
    ENOTFOUND: 'host_not_found',
    EHOSTUNREACH: 'host_unreachable',
    EAI_AGAIN: 'dns_retry',
    EPIPE: 'connection_broken',
    ECONNABORTED: 'connection_aborted',
    UND_ERR_CONNECT_TIMEOUT: 'connect_timeout',
    UND_ERR_HEADERS_TIMEOUT: 'headers_timeout',
    UND_ERR_BODY_TIMEOUT: 'body_timeout',
    UND_ERR_SOCKET: 'socket_error',
    ERR_SOCKET_CONNECTION_TIMEOUT: 'connect_timeout',
    ERR_INVALID_URL: 'invalid_url',
    ERR_INVALID_STATE: 'invalid_state',
  };

  const knownNames: Record<string, string> = {
    AbortError: 'aborted',
    ConnectTimeoutError: 'connect_timeout',
    Error: 'generic_error',
    FetchError: 'fetch_error',
    HeadersTimeoutError: 'headers_timeout',
    NetworkError: 'network_error',
    SocketError: 'socket_error',
    TimeoutError: 'timeout',
    TypeError: 'type_error',
  };

  const safeMessagePrefixes: Array<{ pattern: RegExp; suffix: string }> = [
    { pattern: /^too many subrequests\b/i, suffix: 'subrequest_limit' },
    { pattern: /^fetch failed\b/i, suffix: 'fetch_failed' },
    { pattern: /^failed to fetch\b/i, suffix: 'fetch_failed' },
    { pattern: /^network request failed\b/i, suffix: 'network_error' },
    { pattern: /^network error\b/i, suffix: 'network_error' },
    { pattern: /^connection reset\b/i, suffix: 'connection_reset' },
    { pattern: /^connection refused\b/i, suffix: 'connection_refused' },
    { pattern: /^connection timed out\b/i, suffix: 'timeout' },
    { pattern: /^connect timeout\b/i, suffix: 'connect_timeout' },
    { pattern: /^headers timeout\b/i, suffix: 'headers_timeout' },
    { pattern: /^socket hang up\b/i, suffix: 'socket_error' },
    { pattern: /^host not found\b/i, suffix: 'host_not_found' },
    { pattern: /^name resolution\b/i, suffix: 'dns_error' },
    { pattern: /^tls handshake failed\b/i, suffix: 'tls_error' },
  ];

  const chain: object[] = [];
  const seen = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && (typeof current === 'object' || typeof current === 'function'); depth++) {
    const item = current as object;
    if (seen.has(item)) break;
    seen.add(item);
    chain.push(item);
    current = readSafeValue(item, 'cause');
  }

  // Prefer a transport code from any nested cause to a broad wrapper error name.
  for (const item of chain) {
    const code = readSafeValue(item, 'code');
    if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(knownCodes, code)) return knownCodes[code];
  }
  for (const item of chain) {
    const name = readSafeValue(item, 'name');
    if (typeof name === 'string' && name !== 'Error' && Object.prototype.hasOwnProperty.call(knownNames, name)) return knownNames[name];
  }
  for (const item of chain) {
    const message = readSafeValue(item, 'message');
    if (typeof message !== 'string') continue;
    for (const candidate of safeMessagePrefixes) {
      if (candidate.pattern.test(message.trim())) return candidate.suffix;
    }
    const messageSuffix = safeFetchMessageSuffix(message);
    if (messageSuffix) return messageSuffix;
  }
  if (chain.some((item) => readSafeValue(item, 'name') === 'Error')) return knownNames.Error;
  return 'unknown';
}

function safeFetchMessageSuffix(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (/\b(?:dns|eai_again|name resolution|resolve host)\b/.test(normalized)) return 'dns_error';
  if (/\b(?:timeout|timed out|etimedout)\b/.test(normalized)) return 'timeout';
  if (/\b(?:connection reset|econnreset)\b/.test(normalized)) return 'connection_reset';
  if (/\b(?:connection refused|econnrefused)\b/.test(normalized)) return 'connection_refused';
  if (/\bsocket\b/.test(normalized)) return 'socket_error';
  if (/\b(?:connect|connection)\b/.test(normalized) && /\b(?:fail|failed|failure|error|unavailable)\b/.test(normalized)) {
    return 'connection_error';
  }
  if (/\bnetwork\b/.test(normalized)) return 'network_error';
  if (/\bfetch\b/.test(normalized) && /\b(?:fail|failure|reject|rejected)\b/.test(normalized)) return 'fetch_failed';
  return undefined;
}

function readSafeValue(target: object, key: string): unknown {
  try {
    return (target as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
