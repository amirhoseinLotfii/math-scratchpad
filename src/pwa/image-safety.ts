const sensitiveQueryKey = /^(?:token|code|state|key|sig|signature|authorization|access_token|x-amz-.+)$/i;

export function hasCredentialQuery(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) => sensitiveQueryKey.test(key));
}
