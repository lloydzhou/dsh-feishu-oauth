import zh from '../../locale/zh.json' with { type: 'json' };

/** The only editable plugin configuration fields. */
export const fields = ['enabled', 'appId', 'appSecret', 'publicUrl'];

/** Never copy a returned secret into the write-only password input. */
export function pickSettings(value) {
  return { enabled: value.enabled, appId: value.appId, appSecret: '', publicUrl: value.publicUrl ?? '' };
}

/**
 * Validate an optional public base using the same origin-only rules as the server.
 * A path prefix is rejected because the OAuth routes are registered at the root.
 */
export function publicUrlError(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || /[\s\u0000-\u001F\u007F\\?#]/.test(value)) return 'invalidPublicUrl';
  let url;
  try { url = new URL(value); } catch { return 'invalidPublicUrl'; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return 'invalidPublicUrl';
  if (url.pathname !== '/' || url.href !== `${url.origin}/`) return 'publicUrlPath';
  return '';
}

/** Canonical origin for a valid non-empty base; undefined for blank or invalid input. */
export function publicOrigin(value) {
  return value && !publicUrlError(value) ? new URL(value).origin : undefined;
}

/** Derive the read-only callback preview from a valid public base or the current origin. */
export function callbackUrl(value, origin) {
  return `${publicOrigin(value) ?? origin}/auth/feishu/callback`;
}

/** Validate a staged edit using the supplied translator; blank secrets preserve the saved value. */
export function validateSettings(value, t = key => zh.settings[key]) {
  if (typeof value.enabled !== 'boolean') return t('invalidEnabled');
  if (typeof value.appId !== 'string' || value.appId.trim() !== value.appId) return t('invalidAppId');
  if (typeof value.appSecret !== 'string' || value.appSecret.trim() !== value.appSecret) return t('invalidAppSecret');
  const publicUrl = publicUrlError(value.publicUrl);
  if (publicUrl) return t(publicUrl);
  if (value.enabled && !value.appId) return t('missingAppId');
  return '';
}

/** Omit a blank secret so native field mutations preserve its current raw value. */
export function settingsOperations(value) {
  return fields.filter(key => key !== 'appSecret' || value.appSecret !== '').map(key => ({ op: 'set', path: [key], value: value[key] }));
}
