import { createHash } from 'node:crypto';
import { loginStyles, renderLoginPage } from './login-page.js';

/** Only the fixed login stylesheet is authorized; scripts and external resources stay blocked. */
export const loginCsp = `default-src 'none'; style-src 'sha256-${createHash('sha256').update(loginStyles).digest('base64')}'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;

/** Select a supported language from browser preferences, with English as the final fallback. */
export function selectLocale(acceptLanguage) {
  if (typeof acceptLanguage !== 'string') return 'en';
  const ranges = acceptLanguage.split(',').flatMap((part, index) => {
    const match = /^\s*(\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)\s*(?:;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(part);
    return match ? [{ language: match[1].toLowerCase().split('-')[0], quality: match[2] === undefined ? 1 : Number(match[2]), index }] : [];
  });
  const candidates = ['en', 'zh'].flatMap(language => {
    // Explicit ranges, including q=0, take precedence over the wildcard.
    const explicit = ranges.filter(range => range.language === language);
    const matches = explicit.length ? explicit : ranges.filter(range => range.language === '*');
    const best = matches.sort((a, b) => b.quality - a.quality || a.index - b.index)[0];
    return best && best.quality > 0 ? [{ ...best, language }] : [];
  });
  candidates.sort((a, b) => b.quality - a.quality || a.index - b.index);
  return candidates[0]?.language ?? 'en';
}

const messages = {
  en: {
    loginTitle: 'Sign in to DeepSeek Harness', signIn: 'Sign in with Feishu',
    subtitle: 'Connect with Feishu to access your workspace.', feishuName: 'Feishu',
    recoveryTitle: 'Have a Token link?',
    recovery: 'You can also sign in directly with the native Token URL printed by dsh web. Open the complete link in your browser.',
    accessNote: 'Feishu access grants full owner privileges. Only authorize people you trust.',
    methodNotAllowed: 'Method not allowed', forbidden: 'Forbidden', unexpectedParameters: 'Unexpected parameters',
    busy: 'Login busy; retry later', expired: 'Invalid or expired login; start again',
    declined: 'Feishu login declined; start again', invalidResponse: 'Invalid login response; start again',
    unverifiedIdentity: 'Feishu user identity could not be verified', unavailable: 'Login unavailable',
    failed: 'Login could not be completed; start again or use native recovery', invalidRequest: 'Invalid request',
  },
  zh: {
    loginTitle: '登录 DeepSeek Harness', signIn: '使用飞书授权登录',
    subtitle: '连接你的飞书账号，进入工作空间。', feishuName: '飞书',
    recoveryTitle: '也可以使用 Token 直接登录',
    recovery: '在浏览器中打开 dsh web 输出的完整 Token 链接，即可使用原生方式登录，无需飞书授权。',
    accessNote: '通过飞书登录后将获得完整的所有者权限，请仅向可信人员开放。',
    methodNotAllowed: '不支持此请求方法', forbidden: '禁止访问', unexpectedParameters: '请求包含非预期参数',
    busy: '登录请求繁忙，请稍后重试', expired: '登录无效或已过期，请重新登录',
    declined: '飞书登录已被拒绝，请重新登录', invalidResponse: '登录响应无效，请重新登录',
    unverifiedIdentity: '无法验证飞书用户身份', unavailable: '登录暂不可用',
    failed: '无法完成登录，请重新登录或使用原生恢复入口', invalidRequest: '请求无效',
  },
};

/** Return only fixed text and static language tags; never interpolate request/provider values. */
export function oauthLocale(acceptLanguage) {
  const language = selectLocale(acceptLanguage);
  const text = messages[language];
  const head = `<!doctype html><html lang="${language}"><meta charset="utf-8">`;
  return {
    ...text,
    loginPage: renderLoginPage(language, text),
    successPage: `${head}<meta http-equiv="refresh" content="0;url=/"><title>DeepSeek Harness</title></html>`,
  };
}
