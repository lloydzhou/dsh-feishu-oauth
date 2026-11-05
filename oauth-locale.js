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
    loginTitle: 'DSH login', signIn: 'Sign in with Feishu',
    recovery: 'Recovery: reopen the native token URL printed by dsh web. Feishu access grants full owner privileges.',
    signedIn: 'Signed in', continue: 'Continue to DeepSeek Harness',
    methodNotAllowed: 'Method not allowed', forbidden: 'Forbidden', unexpectedParameters: 'Unexpected parameters',
    busy: 'Login busy; retry later', expired: 'Invalid or expired login; start again',
    declined: 'Feishu login declined; start again', invalidResponse: 'Invalid login response; start again',
    unverifiedIdentity: 'Feishu user identity could not be verified', unavailable: 'Login unavailable',
    failed: 'Login could not be completed; start again or use native recovery', invalidRequest: 'Invalid request',
  },
  zh: {
    loginTitle: 'DSH 登录', signIn: '使用飞书登录',
    recovery: '恢复访问：重新打开 dsh web 输出的原生令牌链接。通过飞书登录后将获得完整的所有者权限。',
    signedIn: '登录成功', continue: '继续前往 DeepSeek Harness',
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
    loginPage: `${head}<title>${text.loginTitle}</title><h1>DeepSeek Harness</h1><p><a href="/auth/feishu/start">${text.signIn}</a></p><p>${text.recovery}</p></html>`,
    successPage: `${head}<meta http-equiv="refresh" content="0;url=/"><title>DeepSeek Harness</title></html>`,
  };
}
