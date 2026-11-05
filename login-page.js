/** Self-contained anonymous login presentation; SVG sources and licenses are in ASSET-ATTRIBUTION.md. */

/** Fixed stylesheet, exported verbatim so the HTTP handler can authorize its CSP hash. */
export const loginStyles = `
:root {
  color-scheme: light dark;
  --page: #f5f6f7;
  --surface: #ffffff;
  --ink: #0f1115;
  --secondary: #61666b;
  --line: #e1e5ee;
  --subtle: #f9fafb;
  --button: #0f1115;
  --button-ink: #ffffff;
  --button-hover: #43454a;
  --focus: #4176e6;
  --feishu: #3370ff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background: var(--page);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.login { width: 100%; max-width: 440px; }
.card {
  padding: 40px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 8px 32px rgb(15 17 21 / 4%);
}
.brands { display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 32px; }
.brand { display: flex; flex-direction: column; align-items: center; gap: 9px; min-width: 88px; }
.brand svg { display: block; width: 48px; height: 48px; }
.brand-name { font-size: 13px; font-weight: 600; line-height: 1.5; }
.harness { font-size: 11px; letter-spacing: .14em; }
.feishu-mark { color: var(--feishu); }
.brand-cross { color: var(--secondary); font-size: 22px; font-weight: 300; padding-bottom: 28px; }
h1 { margin: 0; font-size: 25px; font-weight: 600; line-height: 1.3; letter-spacing: -.025em; text-align: center; }
.subtitle { margin: 12px 0 28px; color: var(--secondary); text-align: center; }
.sign-in {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 12px 18px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--button);
  color: var(--button-ink);
  text-decoration: none;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
}
.sign-in:hover { background: var(--button-hover); }
.sign-in:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
.sign-in svg { flex: none; width: 18px; height: 18px; }
.recovery { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--line); }
.recovery h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
.recovery p { margin: 0; color: var(--secondary); font-size: 13px; overflow-wrap: anywhere; }
.access-note { display: flex; align-items: flex-start; gap: 8px; margin: 18px 12px 0; color: var(--secondary); font-size: 12px; line-height: 1.6; }
.access-note svg { flex: none; width: 14px; height: 14px; margin-top: 3px; }
.access-note p { margin: 0; }
@media (prefers-color-scheme: dark) {
  :root {
    --page: #151517;
    --surface: #232324;
    --ink: #f9fafb;
    --secondary: #cfd3d6;
    --line: #353638;
    --subtle: #1b1b1c;
    --button: #f9fafb;
    --button-ink: #0f1115;
    --button-hover: #ebeef2;
    --focus: #679efe;
    --feishu: #679efe;
  }
}
@media (max-width: 420px) {
  body { padding: 24px 16px; }
  .card { padding: 32px 24px; border-radius: 16px; }
  h1 { font-size: 23px; }
}
@media (forced-colors: active) {
  .card, .sign-in { border-color: CanvasText; }
  .sign-in:focus-visible { outline-color: Highlight; }
}
`;

// Only the whale path is retained from DSH BrandWordmark; HARNESS uses system text.
const whaleMark = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M23.0584 4.95203C22.8129 4.83203 22.7074 5.06103 22.5639 5.17704C22.5149 5.21454 22.4734 5.26354 22.4319 5.30854C22.0734 5.69155 21.6543 5.94306 21.1073 5.91306C20.3073 5.86806 19.6243 6.11957 19.0203 6.73158C18.8918 5.97706 18.4652 5.52655 17.8162 5.23754C17.4767 5.08753 17.1332 4.93703 16.8952 4.61052C16.7292 4.37801 16.6837 4.11901 16.6007 3.8635C16.5477 3.70949 16.4952 3.55199 16.3177 3.52549C16.1252 3.49549 16.0497 3.65699 15.9742 3.792C15.6722 4.34401 15.5552 4.95203 15.5667 5.56805C15.5932 6.95359 16.1782 8.05712 17.3407 8.84215C17.4727 8.93215 17.5067 9.02215 17.4652 9.15366C17.3857 9.42416 17.2917 9.68667 17.2087 9.95718C17.1557 10.1297 17.0767 10.1677 16.8917 10.0922C16.2537 9.82568 15.7027 9.43117 15.2156 8.95465C14.3891 8.15513 13.6416 7.2726 12.7096 6.58158C12.4906 6.42007 12.2716 6.27007 12.045 6.12707C11.094 5.20354 12.1696 4.44502 12.4186 4.35501C12.6791 4.26101 12.5091 3.938 11.6675 3.942C10.826 3.9455 10.056 4.22751 9.07446 4.60302C8.93096 4.65952 8.77995 4.70052 8.62545 4.73452C7.73492 4.56552 6.80989 4.52802 5.84386 4.63702C4.02481 4.83953 2.57177 5.69955 1.50373 7.1676C0.220694 8.93215 -0.0813148 10.9372 0.288196 13.0283C0.676708 15.2323 1.80174 17.0569 3.53029 18.4834C5.32285 19.9625 7.38741 20.6875 9.74298 20.5485C11.1735 20.466 12.7661 20.2745 14.5626 18.7539C15.0156 18.9795 15.4912 19.0695 16.2797 19.137C16.8872 19.1935 17.4722 19.107 17.9252 19.013C18.6347 18.8629 18.5857 18.2059 18.3292 18.0854C16.2497 17.1169 16.7062 17.5109 16.2912 17.1919C17.3477 15.9419 18.9618 13.7198 19.4598 10.6942C19.5088 10.3602 19.5713 9.88968 19.5638 9.61917C19.5598 9.45417 19.5978 9.39016 19.7863 9.37116C20.3073 9.31116 20.8128 9.16866 21.2773 8.91315C22.6249 8.17713 23.1684 6.96809 23.2964 5.51905C23.3154 5.29754 23.2924 5.06853 23.0584 4.95203ZM11.3165 17.9954C9.30097 16.4109 8.32344 15.8894 7.91992 15.9119C7.54241 15.9344 7.61042 16.3664 7.69342 16.6479C7.78042 16.9259 7.89342 17.1174 8.05193 17.3614C8.16143 17.5229 8.23694 17.7629 7.94243 17.9434C7.29341 18.3449 6.16487 17.8084 6.11187 17.7819C4.79833 17.0084 3.7003 15.9874 2.92628 14.5908C2.17875 13.2468 1.74474 11.8047 1.67324 10.2657C1.65424 9.89418 1.76374 9.76267 2.13375 9.69517C2.62077 9.60517 3.12278 9.58617 3.6093 9.65767C5.66636 9.95818 7.41741 10.8777 8.88545 12.3348C9.72348 13.1643 10.3575 14.1558 11.0105 15.1243C11.705 16.1529 12.4521 17.1329 13.4036 17.9364C13.7396 18.2179 14.0076 18.4319 14.2641 18.5899C13.4906 18.6764 12.1996 18.6949 11.3165 17.9964V17.9954ZM12.2826 11.7817C12.2826 11.6167 12.4146 11.4852 12.5806 11.4852C12.6181 11.4852 12.6521 11.4927 12.6826 11.5037C12.7241 11.5187 12.7621 11.5412 12.7921 11.5752C12.8451 11.6277 12.8751 11.7027 12.8751 11.7817C12.8751 11.9467 12.7431 12.0782 12.5771 12.0782C12.4111 12.0782 12.2826 11.9467 12.2826 11.7817ZM15.2831 13.3208C15.0906 13.3998 14.8981 13.4673 14.7131 13.4748C14.4261 13.4898 14.1131 13.3733 13.9431 13.2308C13.6791 13.0093 13.4901 12.8853 13.4111 12.4988C13.3771 12.3338 13.3961 12.0782 13.4261 11.9317C13.4941 11.6162 13.4186 11.4137 13.1961 11.2297C13.0151 11.0797 12.7846 11.0382 12.5316 11.0382C12.4371 11.0382 12.3506 10.9967 12.2861 10.9632C12.1806 10.9107 12.0936 10.7792 12.1766 10.6177C12.2031 10.5652 12.3316 10.4377 12.3616 10.4152C12.7051 10.2197 13.1011 10.2837 13.4676 10.4302C13.8071 10.5692 14.0641 10.8242 14.4336 11.1847C14.8111 11.6202 14.8791 11.7402 15.0941 12.0672C15.2641 12.3228 15.4186 12.5853 15.5247 12.8858C15.5887 13.0733 15.5057 13.2268 15.2831 13.3208Z"/></svg>`;

// ByteDance IconPark NewLark: JSX converted to static SVG with a fixed blue stroke.
const feishuMark = `<svg class="feishu-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
<path d="M17 29C21 29 25 26.9339 28 23.4065C36 14 41.4242 16.8166 44 17.9998C38.5 20.9998 40.5 29.6233 33 35.9998C28.382 39.9259 23.4945 41.014 19 41C12.5231 40.9799 6.86226 37.7637 4 35.4063V16.9998" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M5.64808 15.8669C5.02231 14.9567 3.77715 14.7261 2.86694 15.3519C1.95673 15.9777 1.72615 17.2228 2.35192 18.1331L5.64808 15.8669ZM36.0021 35.7309C36.958 35.1774 37.2843 33.9539 36.7309 32.9979C36.1774 32.042 34.9539 31.7157 33.9979 32.2691L36.0021 35.7309ZM2.35192 18.1331C5.2435 22.339 10.7992 28.144 16.8865 32.2239C19.9345 34.2667 23.217 35.946 26.449 36.7324C29.6946 37.522 33.0451 37.4428 36.0021 35.7309L33.9979 32.2691C32.2049 33.3072 29.9929 33.478 27.3947 32.8458C24.783 32.2103 21.9405 30.7958 19.1135 28.9011C13.4508 25.106 8.2565 19.661 5.64808 15.8669L2.35192 18.1331Z" fill="currentColor"/>
<path d="M33.5947 17C32.84 14.7027 30.8551 9.94054 27.5947 7H11.5947C15.2174 10.6757 23.0002 16 27.0002 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/**
 * Render a complete, script-free page with a fixed same-origin authorization link.
 * @param {'en' | 'zh'} language Supported document language; other values use English.
 * @param {{loginTitle: string, signIn: string, subtitle: string, recoveryTitle: string, recovery: string, accessNote: string, feishuName: string}} text Plain localized text, never HTML.
 * @returns {string} HTML document containing exactly the exported stylesheet and inline SVGs.
 */
export function renderLoginPage(language, text) {
  const lang = language === 'zh' ? 'zh' : 'en';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(text.loginTitle)}</title>
<style>${loginStyles}</style>
</head>
<body>
<main class="login" aria-labelledby="login-title">
<section class="card" aria-labelledby="login-title">
<div class="brands">
<div class="brand" role="img" aria-label="DeepSeek Harness">${whaleMark}<span class="brand-name harness" aria-hidden="true">HARNESS</span></div>
<span class="brand-cross" aria-hidden="true">×</span>
<div class="brand">${feishuMark}<span class="brand-name">${escapeHtml(text.feishuName)}</span></div>
</div>
<h1 id="login-title">${escapeHtml(text.loginTitle)}</h1>
<p class="subtitle">${escapeHtml(text.subtitle)}</p>
<a class="sign-in" href="/auth/feishu/start"><span>${escapeHtml(text.signIn)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a>
<section class="recovery" aria-labelledby="recovery-title">
<h2 id="recovery-title">${escapeHtml(text.recoveryTitle)}</h2>
<p>${escapeHtml(text.recovery)}</p>
</section>
</section>
<aside class="access-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z"/><path d="M12 8v5m0 3h.01"/></svg><p>${escapeHtml(text.accessNote)}</p></aside>
</main>
</body>
</html>`;
}
