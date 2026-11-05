import zh from './locale/zh.json' with { type: 'json' };

/** The only editable plugin configuration fields. */
export const fields = ['enabled', 'appId', 'appSecret'];

/** Never copy a returned secret into the write-only password input. */
export function pickSettings(value) {
  return { enabled: value.enabled, appId: value.appId, appSecret: '' };
}

/** Validate a staged edit using the supplied translator; blank secrets preserve the saved value. */
export function validateSettings(value, t = key => zh.settings[key]) {
  if (typeof value.enabled !== 'boolean') return t('invalidEnabled');
  if (typeof value.appId !== 'string' || value.appId.trim() !== value.appId) return t('invalidAppId');
  if (typeof value.appSecret !== 'string' || value.appSecret.trim() !== value.appSecret) return t('invalidAppSecret');
  if (value.enabled && !value.appId) return t('missingAppId');
  return '';
}

/** Omit a blank secret so native field mutations preserve its current raw value. */
export function settingsOperations(value) {
  return fields.filter(key => key !== 'appSecret' || value.appSecret !== '').map(key => ({ op: 'set', path: [key], value: value[key] }));
}
