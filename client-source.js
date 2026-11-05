import { createElement as h, useState } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import en from './locale/en.json' with { type: 'json' };
import zh from './locale/zh.json' with { type: 'json' };
import { pickSettings, validateSettings, settingsOperations } from './settings-form.js';

export const inject = ['slots', 'locale', 'configForms'];
const LOCALE = 'settings.feishuOAuth';
const hint = { fontSize: 12, opacity: 0.75, margin: '6px 0' };
const inputStyle = { display: 'block', width: '100%', maxWidth: 600, boxSizing: 'border-box', padding: 8, marginTop: 4, color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 6 };
function Editor({ t, value, revision, writable, save, reset }) {
  const [draft, setDraft] = useState(() => pickSettings(value));
  const [baseRevision] = useState(revision);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const disabled = busy || saved || !writable;
  const change = (key, next) => { setDraft(current => ({ ...current, [key]: next })); setMessage(''); };
  const field = (key, type = 'text', extra = {}) => h('label', { key, style: { display: 'block', margin: '14px 0' } }, t(key),
    h('input', { ...extra, type, style: inputStyle, value: draft[key] ?? '', disabled,
      onChange: event => change(key, event.target.value) }));
  const submit = async event => {
    event.preventDefault();
    const error = validateSettings(draft, key => key);
    if (error) { setMessage(error); return; }
    setBusy(true);
    try {
      const accepted = await save(settingsOperations(draft), baseRevision);
      setSaved(accepted);
      if (accepted) setDraft(current => ({ ...current, appSecret: '' }));
      setMessage(accepted ? 'saved' : 'conflict');
    }
    catch { setMessage('saveFailed'); }
    finally { setBusy(false); }
  };
  return h('form', { onSubmit: submit },
    h('h3', null, t('title')),
    h('p', { style: hint }, t('intro')),
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0' } },
      h('span', null, t('enabled')),
      h(Switch, { checked: draft.enabled, label: t('enabled'), disabled, onChange: checked => change('enabled', checked) })),
    field('appId', 'text', { autoComplete: 'off' }),
    field('appSecret', 'password', { autoComplete: 'new-password', spellCheck: false, placeholder: t('secretPlaceholder') }),
    h('p', { style: hint }, t('secretHint')),
    h('p', { style: hint }, t('callback'), h('code', null, `${window.location.origin}/auth/feishu/callback`)),
    h('p', { style: hint }, t('callbackHint')),
    h('p', { style: hint, role: window.location.protocol === 'http:' ? 'alert' : undefined }, t('httpWarning')),
    h('p', { style: hint }, t('saveHint')),
    !writable && h('p', { role: 'status' }, t('readOnly')),
    h('button', { type: 'submit', disabled }, t(busy ? 'saving' : 'save')), ' ',
    h('button', { type: 'button', disabled: busy, onClick: reset }, t('reload')),
    h('p', { role: 'status', 'aria-live': 'polite' }, message ? t(message) : ''));
}
function Card(props) {
  const form = props.useConfig(view => view);
  const [generation, setGeneration] = useState(0);
  if (form.status !== 'ready') return h('p', { role: 'status' }, props.t('unavailable'));
  return h(Editor, { key: generation, t: props.t, value: form.value, revision: form.revision, writable: form.writable, save: props.save, reset: () => setGeneration(value => value + 1) });
}
/** Use the native authenticated configuration service; no plugin-owned HTTP endpoint. */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE, { en: en.settings, zh: zh.settings }));
  const form = ctx.configForms.get('feishu-oauth');
  ctx.effect(() => ctx.configForms.whileServed(['feishu-oauth'], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-feishu-oauth', locale: LOCALE,
    inject: () => ({ hooks: { config: form }, save: (ops, revision) => form.mutate(ops, revision) }),
  }, Card))));
}
