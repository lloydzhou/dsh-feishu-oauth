# DSH 飞书 OAuth

为 DeepSeek Harness 提供飞书登录的独立插件，复用 DSH 原生会话 Cookie，不修改核心、不自行签发 Cookie。[源码与问题反馈](https://github.com/lloydzhou/dsh-feishu-oauth) · [MIT 许可证](<LICENSE>) · [安全说明](<SECURITY.md>) · [贡献与设置集成参考](<SETTINGS-INTEGRATION.md>)。

> **仅供可信人员共享使用。** 所有获得飞书应用授权且用户信息有效的用户均获得同一个 DSH owner 的完整权限。没有独立账户、用户或租户白名单、逐用户审计或撤销机制；请通过飞书应用可用范围限制人员，并限制网络访问。

## 安装与配置

需要 Node.js >=24.9.0，以及提供 `webServer.readResource()`、`connection.browserPeer` 和原生认证接口的 DSH。清单声明的版本下限为 >=0.2.1-rc.3，但不保证较旧版本具备这些 API；已使用提取的 0.2.2-rc.1 原生模块进行兼容测试，不等同所有版本或真实飞书端到端验证。

```sh
git clone https://github.com/lloydzhou/dsh-feishu-oauth.git
cd dsh-feishu-oauth
npm ci
npm run build:client
dsh plugin --profile web add .
```

1. 在 Plugins 页面启用本插件 bundle，保持 `feishu-oauth` 插件行加载。配置中的“启用飞书登录”默认关闭，与 bundle 总开关不同。
2. 使用 DSH 启动时打印的原生 token URL 登录，打开 Plugins → 已安装插件 → 本插件配置页面。
3. 在飞书应用中限定可信人员的可用范围，并登记卡片显示的精确回调地址：浏览器当前 origin 加 `/auth/feishu/callback`。
4. 输入 App ID 和 App Secret **原始值**（不是环境变量名），启用并保存。首次配置需填写 Secret；之后密码框留空表示保留现值。保存成功或配置冲突后重新载入表单再编辑。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 启用 OAuth 路由 |
| `appId` | 空 | 飞书 App ID |
| `appSecret` | 空 | 原始 App Secret；读取时脱敏，表单留空保留现值 |

密码框始终空白载入，成功保存后清空；界面不显示 Secret 是否已配置。脱敏和密码遮罩不等于加密：**App Secret 以明文存储于本机 profile 配置**，请保护配置文件及备份。

允许 HTTP 访问 DSH，但浏览器提交设置时的 App Secret、原生登录凭据和会话流量均没有传输加密。飞书 provider 请求始终使用 HTTPS，这不保护浏览器到 DSH 的 HTTP 链路。建议使用原生 HTTPS；不支持 HTTPS 在反向代理终止、DSH 仍监听 HTTP 的部署。访问地址必须满足原生 Connection 信任规则，Host 保持不变，并与飞书登记的回调地址一致。

## 登录与恢复

匿名访问 `/` 显示 DSH × 飞书登录卡片，提供授权登录按钮和原生 Token 链接登录提示；支持中英文、窄屏及系统深色模式，不加载外部字体、图片或脚本。页面样式通过固定 CSP 哈希授权。登录后直接在 `/` 显示 DSH 页面，地址栏保持 `/`。成功回调通过零延迟 meta refresh 返回同源 `/`，无需点击确认，并结束跨站重定向链以兼容原生 SameSite=Strict Cookie。`/?token=...` 始终交给原生认证，作为恢复入口；匿名访问 `/index.html` 可能得到原生 401，应返回 `/` 登录。API 和 WebSocket 继续使用原生认证。

OAuth 关闭或应用凭据缺失时不注册登录路由。设置集成捕获到激活或清理异常时记录固定脱敏警告；并非所有缺失或错误配置都会产生警告。保存成功不证明飞书凭据或回调登记有效。相关配置变更会撤下 OAuth 路由、取消待登录请求，清理后重新挂载；关闭或卸载恢复原生入口。

**飞书撤权、退出或关闭插件不会自动使已签发的 DSH Cookie 失效**，其有效期仍由原生会话管理。保留原生 token 恢复方式；不要将本插件当作多用户权限系统。

## 保护措施与限制

- state 单次使用、绑定浏览器，有效期 300 秒，最多 256 个待处理 state；最多同时进行 16 个 provider 交换流程。这些是单进程容量限制，**不是按 IP 限流，也不是 DoS 防护**。
- 使用 S256 PKCE、固定 HTTPS provider 地址、禁止跟随 provider 重定向、请求超时及响应大小限制。临时 Cookie 为 HttpOnly/SameSite=Lax，HTTPS 下带 Secure。
- 原生启动 token 不进入页面、浏览器重定向、外部 HTTP 请求或日志；插件不读取签名密钥。错误仅包含固定阶段 `TOKEN`、`USERINFO` 或 `NATIVE_COOKIE`，以及已收到的 HTTP 状态和飞书数字错误码，不回显 provider 正文或凭据。
- `TOKEN/HTTP_400/CODE_20002` 表示飞书拒绝应用凭据；只有 `TOKEN` 表示未收到 token 接口响应头。排查后从首页重新登录，不刷新已消耗授权码的回调页。
- state 只在进程内存中保存；进程退出或配置更新会使待登录失效。同一浏览器发起新登录会覆盖旧临时绑定。绕过 Connection 的自定义 listener 不在保护范围内。

配置卡片随 DSH 界面语言切换中英文；登录、成功及错误页面按浏览器 `Accept-Language` 选择中英文，默认英文。原生 token 恢复响应由 DSH 负责。

## 开发与验证

```sh
npm ci
npm run build:client
npm run check
npm test
```

esbuild 固定版本并由锁文件锁定依赖。原生模块兼容测试、设置保存语义和资源 API 要求见[贡献与设置集成参考](<SETTINGS-INTEGRATION.md>)。模拟及提取模块测试不等于真实浏览器或飞书授权往返验收；升级 DSH 后应重新验证。安全问题请按[安全说明](<SECURITY.md>)私密报告，勿在公开 issue 中提交凭据。

## 飞书协议参考

授权端点使用 `https://accounts.feishu.cn/open-apis/authen/v1/authorize`，按其文档中的 PKCE 配对说明，通过 `https://open.feishu.cn/open-apis/authen/v2/oauth/token` 的 JSON 请求体换取 token。保留 S256 challenge 与 verifier，不自动降级或重试已用授权码。v2 被标为历史版本；迁移 v3 前需验证授权端点的 PKCE 兼容性。飞书错误码 `20049` 表示 PKCE 校验失败。

- [授权码与 PKCE](https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code.md)
- [OAuth v2 token 与 v3 迁移说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token.md)
- [用户信息](https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get.md)
