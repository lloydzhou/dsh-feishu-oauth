window.__ModuleLoader__.load({id:"dsh-feishu-oauth",factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// locale/en.json
var en_default = {
  meta: {
    title: "Feishu OAuth login",
    description: "Sign in to DSH with Feishu app authorization, with native token recovery"
  },
  settings: {
    title: "Feishu OAuth login",
    intro: "Sign in with the native token first, then configure Feishu. Configuration is available while OAuth is disabled. All authorized users of the app receive full access as the same DSH owner; there is no tenant or user allowlist.",
    enabled: "Enable Feishu login",
    appId: "Feishu App ID",
    appSecret: "Feishu App Secret",
    secretPlaceholder: "Leave blank to keep the saved secret",
    secretHint: "Enter the raw App Secret, not an environment variable name. Enter it on first setup; leave it blank to keep the saved value. Native settings reads redact secrets, so this field loads empty and clears after saving. The secret is stored in plaintext in the local profile configuration, not an encrypted vault.",
    callback: "Feishu redirect URL (read-only): ",
    callbackHint: "The callback is derived from the current address. Register this exact URL in Feishu. The backend uses the DSH listener protocol; TLS-terminating reverse proxies are not supported.",
    httpWarning: "LAN HTTP is allowed, but HTTP is not encrypted: App Secret, login credentials, and session traffic may be intercepted. Use only on trusted networks; native HTTPS is recommended.",
    saveHint: "Saving revokes pending Feishu logins; existing DSH sessions are unaffected. The native token remains available for recovery.",
    readOnly: "This deployment stores settings read-only.",
    saving: "Saving\u2026",
    save: "Save configuration",
    reload: "Reload configuration (discard draft)",
    saved: "Configuration saved. If login is unavailable, check the App ID, App Secret, and Feishu redirect URL. Reload configuration before editing again.",
    conflict: "Save was not accepted, possibly because of a concurrent change. Your draft is preserved; reload configuration and retry.",
    saveFailed: "Save failed. Check your connection and retry. Your draft is preserved.",
    unavailable: "Feishu settings are unavailable. Ensure the plugin is loaded and its plugin entry remains enabled.",
    invalidEnabled: "The switch value is invalid.",
    invalidAppId: "App ID must be text without leading or trailing whitespace.",
    invalidAppSecret: "App Secret must be text without leading or trailing whitespace.",
    missingAppId: "Enter an App ID and ensure an App Secret is saved before enabling login."
  }
};

// locale/zh.json
var zh_default = {
  meta: {
    title: "\u98DE\u4E66 OAuth \u767B\u5F55",
    description: "\u901A\u8FC7\u98DE\u4E66\u5E94\u7528\u6388\u6743\u767B\u5F55 DSH\uFF0C\u4FDD\u7559\u539F\u751F token \u6062\u590D\u5165\u53E3"
  },
  settings: {
    title: "\u98DE\u4E66 OAuth \u767B\u5F55",
    intro: "\u5148\u4F7F\u7528\u539F\u751F token \u767B\u5F55\uFF0C\u518D\u914D\u7F6E\u98DE\u4E66\u3002\u9ED8\u8BA4\u5173\u95ED\u4E0D\u5F71\u54CD\u914D\u7F6E\u3002\u5E94\u7528\u5185\u6709\u6388\u6743\u7684\u7528\u6237\u90FD\u83B7\u5F97\u540C\u4E00\u4E2A DSH owner \u7684\u5B8C\u6574\u6743\u9650\uFF1B\u65E0\u79DF\u6237\u6216\u7528\u6237\u767D\u540D\u5355\u3002",
    enabled: "\u542F\u7528\u98DE\u4E66\u767B\u5F55",
    appId: "\u98DE\u4E66 App ID",
    appSecret: "\u98DE\u4E66 App Secret",
    secretPlaceholder: "\u7559\u7A7A\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5",
    secretHint: "\u586B\u5199 App Secret \u539F\u59CB\u503C\uFF0C\u4E0D\u662F\u73AF\u5883\u53D8\u91CF\u540D\u3002\u9996\u6B21\u914D\u7F6E\u8BF7\u586B\u5199\uFF1B\u7559\u7A7A\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7684\u503C\u3002\u539F\u751F\u8BBE\u7F6E\u8BFB\u53D6\u4F1A\u79FB\u9664\u5BC6\u94A5\uFF0C\u5BC6\u7801\u6846\u59CB\u7EC8\u7A7A\u767D\u8F7D\u5165\uFF1B\u4FDD\u5B58\u540E\u4E5F\u4F1A\u6E05\u7A7A\u3002\u5BC6\u94A5\u4EE5\u660E\u6587\u4FDD\u5B58\u5728\u672C\u673A profile \u914D\u7F6E\u4E2D\uFF0C\u4E0D\u662F\u52A0\u5BC6\u4FDD\u9669\u5E93\u3002",
    callback: "\u98DE\u4E66\u91CD\u5B9A\u5411\u5730\u5740\uFF08\u53EA\u8BFB\uFF09\uFF1A",
    callbackHint: "\u56DE\u8C03\u7531\u5F53\u524D\u8BBF\u95EE\u5730\u5740\u81EA\u52A8\u751F\u6210\uFF1B\u8BF7\u5728\u98DE\u4E66\u540E\u53F0\u767B\u8BB0\u6B64\u7CBE\u786E\u5730\u5740\u3002\u540E\u7AEF\u4F7F\u7528 DSH \u76D1\u542C\u5668\u534F\u8BAE\uFF0C\u4E0D\u652F\u6301 TLS \u7EC8\u6B62\u53CD\u5411\u4EE3\u7406\u3002",
    httpWarning: "\u5141\u8BB8\u5C40\u57DF\u7F51 HTTP\uFF0C\u4F46 HTTP \u4E0D\u52A0\u5BC6\uFF1AApp Secret\u3001\u767B\u5F55\u51ED\u636E\u548C\u4F1A\u8BDD\u6D41\u91CF\u53EF\u80FD\u88AB\u7A83\u542C\u3002\u4EC5\u5728\u53EF\u4FE1\u7F51\u7EDC\u4F7F\u7528\uFF1B\u5EFA\u8BAE\u4F7F\u7528\u539F\u751F HTTPS\u3002",
    saveHint: "\u4FDD\u5B58\u4F1A\u64A4\u9500\u5C1A\u672A\u5B8C\u6210\u7684\u98DE\u4E66\u767B\u5F55\uFF1B\u5DF2\u6709 DSH \u767B\u5F55\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u3002\u539F\u751F token \u59CB\u7EC8\u53EF\u7528\u4E8E\u6062\u590D\u3002",
    readOnly: "\u672C\u90E8\u7F72\u7684\u914D\u7F6E\u4E3A\u53EA\u8BFB\u3002",
    saving: "\u4FDD\u5B58\u4E2D\u2026",
    save: "\u4FDD\u5B58\u914D\u7F6E",
    reload: "\u91CD\u65B0\u8F7D\u5165\u914D\u7F6E\uFF08\u653E\u5F03\u8349\u7A3F\uFF09",
    saved: "\u914D\u7F6E\u5DF2\u4FDD\u5B58\u3002\u82E5\u767B\u5F55\u672A\u51FA\u73B0\uFF0C\u8BF7\u786E\u8BA4 App ID\u3001App Secret \u548C\u98DE\u4E66\u56DE\u8C03\u5730\u5740\u3002\u7EE7\u7EED\u7F16\u8F91\u524D\u8BF7\u91CD\u65B0\u8F7D\u5165\u914D\u7F6E\u3002",
    conflict: "\u4FDD\u5B58\u672A\u88AB\u63A5\u53D7\uFF0C\u53EF\u80FD\u6709\u5E76\u53D1\u4FEE\u6539\u3002\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF1B\u8BF7\u91CD\u65B0\u8F7D\u5165\u914D\u7F6E\u540E\u91CD\u8BD5\u3002",
    saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF1B\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002",
    unavailable: "\u98DE\u4E66\u914D\u7F6E\u5C1A\u4E0D\u53EF\u7528\uFF0C\u8BF7\u786E\u8BA4\u63D2\u4EF6\u5DF2\u52A0\u8F7D\u4E14\u4FDD\u7559\u542F\u7528\u7684\u63D2\u4EF6\u884C\u3002",
    invalidEnabled: "\u5F00\u5173\u503C\u65E0\u6548\u3002",
    invalidAppId: "App ID \u5FC5\u987B\u4E3A\u6587\u672C\uFF0C\u4E14\u4E0D\u80FD\u5305\u542B\u9996\u5C3E\u7A7A\u683C\u3002",
    invalidAppSecret: "App Secret \u5FC5\u987B\u4E3A\u6587\u672C\uFF0C\u4E14\u4E0D\u80FD\u5305\u542B\u9996\u5C3E\u7A7A\u683C\u3002",
    missingAppId: "\u542F\u7528\u524D\u8BF7\u586B\u5199 App ID\uFF0C\u5E76\u786E\u4FDD\u5DF2\u4FDD\u5B58 App Secret\u3002"
  }
};

// src/client/settings-form.js
var fields = ["enabled", "appId", "appSecret"];
function pickSettings(value) {
  return { enabled: value.enabled, appId: value.appId, appSecret: "" };
}
function validateSettings(value, t = (key) => zh_default.settings[key]) {
  if (typeof value.enabled !== "boolean") return t("invalidEnabled");
  if (typeof value.appId !== "string" || value.appId.trim() !== value.appId) return t("invalidAppId");
  if (typeof value.appSecret !== "string" || value.appSecret.trim() !== value.appSecret) return t("invalidAppSecret");
  if (value.enabled && !value.appId) return t("missingAppId");
  return "";
}
function settingsOperations(value) {
  return fields.filter((key) => key !== "appSecret" || value.appSecret !== "").map((key) => ({ op: "set", path: [key], value: value[key] }));
}

// src/client/index.js
var inject = ["slots", "locale", "configForms"];
var LOCALE = "settings.feishuOAuth";
var hint = { fontSize: 12, opacity: 0.75, margin: "6px 0" };
var inputStyle = { display: "block", width: "100%", maxWidth: 600, boxSizing: "border-box", padding: 8, marginTop: 4, color: "inherit", background: "transparent", border: "1px solid currentColor", borderRadius: 6 };
function Editor({ t, value, revision, writable, save, reset }) {
  const [draft, setDraft] = (0, import_react.useState)(() => pickSettings(value));
  const [baseRevision] = (0, import_react.useState)(revision);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [saved, setSaved] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)("");
  const disabled = busy || saved || !writable;
  const change = (key, next) => {
    setDraft((current) => ({ ...current, [key]: next }));
    setMessage("");
  };
  const field = (key, type = "text", extra = {}) => (0, import_react.createElement)(
    "label",
    { key, style: { display: "block", margin: "14px 0" } },
    t(key),
    (0, import_react.createElement)("input", {
      ...extra,
      type,
      style: inputStyle,
      value: draft[key] ?? "",
      disabled,
      onChange: (event) => change(key, event.target.value)
    })
  );
  const submit = async (event) => {
    event.preventDefault();
    const error = validateSettings(draft, (key) => key);
    if (error) {
      setMessage(error);
      return;
    }
    setBusy(true);
    try {
      const accepted = await save(settingsOperations(draft), baseRevision);
      setSaved(accepted);
      if (accepted) setDraft((current) => ({ ...current, appSecret: "" }));
      setMessage(accepted ? "saved" : "conflict");
    } catch {
      setMessage("saveFailed");
    } finally {
      setBusy(false);
    }
  };
  return (0, import_react.createElement)(
    "form",
    { onSubmit: submit },
    (0, import_react.createElement)("h3", null, t("title")),
    (0, import_react.createElement)("p", { style: hint }, t("intro")),
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "10px 0" } },
      (0, import_react.createElement)("span", null, t("enabled")),
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Switch, { checked: draft.enabled, label: t("enabled"), disabled, onChange: (checked) => change("enabled", checked) })
    ),
    field("appId", "text", { autoComplete: "off" }),
    field("appSecret", "password", { autoComplete: "new-password", spellCheck: false, placeholder: t("secretPlaceholder") }),
    (0, import_react.createElement)("p", { style: hint }, t("secretHint")),
    (0, import_react.createElement)("p", { style: hint }, t("callback"), (0, import_react.createElement)("code", null, `${window.location.origin}/auth/feishu/callback`)),
    (0, import_react.createElement)("p", { style: hint }, t("callbackHint")),
    (0, import_react.createElement)("p", { style: hint, role: window.location.protocol === "http:" ? "alert" : void 0 }, t("httpWarning")),
    (0, import_react.createElement)("p", { style: hint }, t("saveHint")),
    !writable && (0, import_react.createElement)("p", { role: "status" }, t("readOnly")),
    (0, import_react.createElement)("button", { type: "submit", disabled }, t(busy ? "saving" : "save")),
    " ",
    (0, import_react.createElement)("button", { type: "button", disabled: busy, onClick: reset }, t("reload")),
    (0, import_react.createElement)("p", { role: "status", "aria-live": "polite" }, message ? t(message) : "")
  );
}
function Card(props) {
  const form = props.useConfig((view) => view);
  const [generation, setGeneration] = (0, import_react.useState)(0);
  if (form.status !== "ready") return (0, import_react.createElement)("p", { role: "status" }, props.t("unavailable"));
  return (0, import_react.createElement)(Editor, { key: generation, t: props.t, value: form.value, revision: form.revision, writable: form.writable, save: props.save, reset: () => setGeneration((value) => value + 1) });
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE, { en: en_default.settings, zh: zh_default.settings }));
  const form = ctx.configForms.get("feishu-oauth");
  ctx.effect(() => ctx.configForms.whileServed(["feishu-oauth"], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: "dsh-feishu-oauth",
    locale: LOCALE,
    inject: () => ({ hooks: { config: form }, save: (ops, revision) => form.mutate(ops, revision) })
  }, Card))));
}

return module.exports;}});
