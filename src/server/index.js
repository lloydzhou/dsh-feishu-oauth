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
  publicUrl: Schema.string().default('').description('可选公开访问基址，例如 https://dsh.example；仅 http(s) 根地址，不含凭据、查询串、片段或路径。留空则沿用当前请求地址。').volatile(),
  rootPage: Schema.boolean().default(false).description('可选：同时在根路径 / 提供飞书登录墙。默认关闭——dsh 0.2.3-alpha.2+ 的 remote-connection 网关（扫码/配对/Token 登录）需要根路径，冲突时后注册方启动失败。飞书登录页始终可通过 /auth/feishu/login 访问，登录成功后持有的就是原生会话 Cookie。').volatile(),
});
/** Keep configuration available while login routes are off, and apply committed edits atomically. */
export function apply(ctx, config) {
  return mountSettings(ctx, config);
}
