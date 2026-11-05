import Schema from '@deepseek-ai/schemastery';
import { mountSettings } from './settings.js';

/** Native browser owner admission through Feishu application authorization. */
export const name = 'feishu-oauth';
export const inject = ['webServer', 'connection'];
/** Native settings redact the secret on reads; the profile stores the raw value. */
export const Config = Schema.object({
  enabled: Schema.boolean().default(false).description('启用飞书 owner 登录；原生 token 恢复入口保持可用。').volatile(),
  appId: Schema.string().default('').description('飞书应用 App ID。').volatile(),
  appSecret: Schema.string().default('').role('secret').description('飞书应用 App Secret 原始值，不是环境变量名。').volatile(),
});
/** Keep configuration available while login routes are off, and apply committed edits atomically. */
export function apply(ctx, config) {
  return mountSettings(ctx, config);
}
