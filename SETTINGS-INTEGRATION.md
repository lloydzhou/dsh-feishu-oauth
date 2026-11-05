# 贡献与设置集成参考

安装、权限与部署风险见 [README](<README.md>)；漏洞报告见[安全说明](<SECURITY.md>)。项目使用 [MIT 许可证](<LICENSE>)，源码与贡献入口为 [lloydzhou/dsh-feishu-oauth](https://github.com/lloydzhou/dsh-feishu-oauth)。提交复现时仅使用虚构凭据和公开示例地址，不包含个人配置、路径、主机或 token。

## 设置接口

浏览器 bundle 注册到官方 `plugins.bundle.config` 插槽，使用需认证的 `configForms` 命名空间 `feishu-oauth`。保持 Loader 条目 `id: feishu-oauth`、`name: dsh-feishu-oauth` 加载，初始 `config.enabled: false`。关闭 OAuth 不卸载配置卡片；bundle 总开关与 OAuth 开关不同。

[配置入口](<index.js>)只声明 `enabled`、`appId`、`appSecret`，均使用 `.volatile()`；`appSecret` 标记 `.role('secret')`。将 volatile 引用直接传给 `mountSettings(ctx, config)`，以响应已提交的设置变化。

### 密钥与保存语义

原生设置的脱敏读取从 `value`、`base`、`user` 移除 schema 标记的密钥，另行返回 `{ path, set }` 元数据。已测试的官方 `ConfigFormController` 不在表单 snapshot 中暴露该元数据，因此卡片不声称密钥“已配置”。密码框空白载入；空白代表不发送该字段的 mutation，保留已有值，而不是清除密钥。输入非空原始 Secret 时发送 set 操作。

一次保存使用载入草稿时的 revision，提交单个原子 mutation。普通编辑仅发送 `enabled` 和 `appId`，输入 Secret 时才增加 `appSecret`。成功后清空本地密码草稿，并要求重新载入后再编辑；冲突或失败保留草稿供重试，冲突需显式重新载入。

原生设置将原始 Secret 写入本机 profile 配置，**明文存储而非加密保险库**。表单遮罩与读取脱敏不提供磁盘或传输加密。HTTP 下浏览器提交的设置（含 Secret）、登录凭据和会话流量可被窃听；provider 访问始终 HTTPS，不改变这段 HTTP 链路的风险。

回调展示只读，不持久化，值为 `window.location.origin + '/auth/feishu/callback'`。后端按请求 Host 和原生 listener 协议计算回调，并沿用 Connection 信任规则。使用同一个地址访问 DSH 和登记飞书回调；加密访问应使用原生 HTTPS，不支持 TLS 在反向代理终止而 DSH 使用 HTTP。

### 配置生命周期

[设置生命周期模块](<settings.js>)比较配置快照；相关变化立即撤销旧 OAuth 路由并中止待登录操作，等待清理后挂载最新配置，无关 volatile 更新不触发重挂载。关闭 OAuth 或缺少 App ID/Secret 时不挂载路由，这些情况本身不产生激活警告。设置集成捕获到激活或清理异常才记录固定脱敏警告，不转发可能含凭据的异常消息。保存成功不验证飞书凭据或回调登记。

原生 token 恢复入口保留。移除路由或取消待登录操作不撤销已签发的原生 Cookie；所有获准用户共享完整 owner 权限，没有逐用户会话撤销。

## 原生认证与根路径

[OAuth 模块](<oauth.js>)依赖原生 `connection.isTrusted()`、`authenticatedUrl()`、`authorizeIndex()`、`browserPeer`，以及 `webServer.register()`、`protocol` 和 **`readResource()` 资源 API**：

- `/?token=...` 原样委托 `authorizeIndex()`，不替代原生恢复认证。
- OAuth 成功后，在服务端通过 `authenticatedUrl()` 与 `authorizeIndex()` 获取原生 Cookie，不自行签名、不读取签名密钥。启动 token 仅用于进程内请求，不传给浏览器或飞书。
- 成功响应是无可见内容的 HTML，以零延迟 meta refresh 导航到同源 `/`，结束跨站重定向链，使原生 SameSite=Strict Cookie 可用于后续导航。
- 已认证的 `/` 先经过原生 `authorizeIndex()` 校验，再用 `webServer.readResource(new Request(new URL('/index.html', origin)), connection.browserPeer)` 内部读取 DSH 首页并返回。浏览器不重定向到 `/index.html`，地址栏保持 `/`；不得省略前置原生认证。

首页资源假定为 `/index.html`。清单下限 >=0.2.1-rc.3 不保证较旧版本提供所需资源 API。兼容验证使用提取的 DSH 0.2.2-rc.1 原生模块；升级后需重跑测试并验证真实页面，不能将提取模块测试视为完整浏览器验收。

登录状态只存于单进程内存：最多 256 个待处理 state，300 秒过期，同时最多 16 个 provider 交换流程。容量耗尽可返回 503；这些限制不是按 IP 限流或 DoS 防护。协议端点、PKCE 配对和官方参考见 [README 的飞书协议参考](<README.md#飞书协议参考>)。

## 构建与测试

```sh
npm ci
npm run build:client
npm run check
npm test
```

[包清单](<package.json>)固定 esbuild 版本，依赖由[锁文件](<package-lock.json>)锁定；不需传入外部 esbuild 路径。[构建脚本](<build-client.mjs>)生成[浏览器 bundle](<client.js>)，修改[客户端源码](<client-source.js>)或[表单逻辑](<settings-form.js>)后应重新构建并提交相应产物。此流程不执行 npm 发布。

`./client` 导出浏览器 bundle，`dsh.client.platform` 为 `web`，注入 `@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-settings` 和 `@deepseek-ai/dsh-client-ui-plugin-manager`。卡片使用原生 locale 与 Switch，中英文包元数据通过 `./locale/*.json` 导出。

可选的兼容测试从环境变量读取自行提取的 DSH 模块路径：

```sh
DSH_NATIVE_CONNECTION_JS="$EXTRACTED_CONNECTION_JS" npm test
DSH_NATIVE_WEBSERVER_JS="$EXTRACTED_WEBSERVER_JS" \
DSH_NATIVE_FRONTEND_JS="$EXTRACTED_FRONTEND_JS" \
node --test test/root-native.test.js
DSH_INSTALLED_SETTINGS_CLIENT="$EXTRACTED_SETTINGS_CLIENT" \
DSH_INSTALLED_SETTINGS_SERVER="$EXTRACTED_SETTINGS_SERVER" \
node --test settings.test.js settings-browser.test.js
```

运行前将 `EXTRACTED_*` 变量设为对应提取模块文件；未提供输入的可选测试会跳过。认证测试在 VM 中使用随机密钥验证原生实现，不读取真实凭据。设置测试使用内存 fixture 执行提取的原生脱敏、mutation 和官方 `ConfigFormController`；构建产物测试覆盖插槽注册、三字段表单、回调显示、Secret 草稿、revision 保存与释放。这些不是实际浏览器或真实飞书登录测试。

手动验收应检查 bundle 已启用、原生 token 可恢复、配置草稿及冲突处理、匿名根路径入口，以及真实授权后返回 `/` 且地址栏不变。不要在公开日志或 issue 中记录授权码、Cookie、Secret 或原生 token。
