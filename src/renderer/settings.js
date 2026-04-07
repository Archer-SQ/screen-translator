const providerSelect = document.getElementById('provider');
const freeHint = document.getElementById('freeHint');
const configFields = document.getElementById('configFields');
const presetRow = document.getElementById('presetRow');
const apiKeyRow = document.getElementById('apiKeyRow');
const baseUrlRow = document.getElementById('baseUrlRow');
const presetSelect = document.getElementById('preset');
const cfgModel = document.getElementById('cfgModel');
const cfgApiKey = document.getElementById('cfgApiKey');
const cfgBaseUrl = document.getElementById('cfgBaseUrl');

// --- i18n ---
const I18N = {
  en: {
    hotkeyTranslate: 'Translate', hotkeyDismiss: 'Dismiss', hotkeyCache: 'Save Cache',
    record: 'Record', stop: 'Stop',
    targetLang: 'Target Language', provider: 'Provider',
    preset: 'Preset', model: 'Model',
    googleHint: 'Free, no API key required. Powered by Google Translate.',
    switchLang: '中文',
  },
  zh: {
    hotkeyTranslate: '翻译', hotkeyDismiss: '关闭浮层', hotkeyCache: '保存缓存',
    record: '录制', stop: '停止',
    targetLang: '目标语言', provider: '翻译服务',
    preset: '预设', model: '模型',
    googleHint: '免费，无需 API Key。由 Google 翻译提供支持。',
    switchLang: 'EN',
  },
};
let currentLang = 'zh';
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const t = I18N[currentLang][el.getAttribute('data-i18n')];
    if (t) el.textContent = t;
  });
  document.getElementById('langSwitch').textContent = I18N[currentLang].switchLang;
  document.querySelectorAll('.recordBtn').forEach(btn => {
    if (!btn.classList.contains('recording')) btn.textContent = I18N[currentLang].record;
  });
}
document.getElementById('langSwitch').addEventListener('click', () => {
  currentLang = currentLang === 'en' ? 'zh' : 'en';
  applyI18n(); localStorage.setItem('settingsLang', currentLang);
});
const savedLang = localStorage.getItem('settingsLang');
if (savedLang) currentLang = savedLang;
applyI18n();

// --- Provider presets ---
const PRESETS = {
  openai: [
    { value: '', label: 'Custom' },
    { value: 'openai', label: 'OpenAI', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
    { value: 'deepseek', label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
    { value: 'groq', label: 'Groq', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
    { value: 'siliconflow', label: 'SiliconFlow', model: 'Qwen/Qwen2.5-72B-Instruct', baseUrl: 'https://api.siliconflow.cn/v1' },
  ],
  claude: [
    { value: '', label: 'Custom' },
    { value: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com' },
    { value: 'minimax', label: 'MiniMax', model: 'MiniMax-M2.7', baseUrl: 'https://api.minimaxi.com/anthropic' },
  ],
};

// Provider field config: which fields to show
const PROVIDER_FIELDS = {
  google:  { preset: false, model: false, apiKey: false, baseUrl: false },
  openai:  { preset: true,  model: true,  apiKey: true,  baseUrl: true },
  claude:  { preset: true,  model: true,  apiKey: true,  baseUrl: true },
  deepl:   { preset: false, model: false, apiKey: true,  baseUrl: false },
  ollama:  { preset: false, model: true,  apiKey: false, baseUrl: true },
};

const PROVIDER_DEFAULTS = {
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  claude: { model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com' },
  deepl:  { model: '', baseUrl: '' },
  ollama: { model: 'qwen2.5', baseUrl: 'http://localhost:11434' },
};

function switchProvider(provider) {
  const fields = PROVIDER_FIELDS[provider] || PROVIDER_FIELDS.openai;

  if (provider === 'google') {
    freeHint.classList.remove('hidden');
    configFields.classList.add('hidden');
    return;
  }

  freeHint.classList.add('hidden');
  configFields.classList.remove('hidden');

  presetRow.classList.toggle('hidden', !fields.preset);
  apiKeyRow.classList.toggle('hidden', !fields.apiKey);
  baseUrlRow.classList.toggle('hidden', !fields.baseUrl);

  // Populate preset dropdown
  if (fields.preset && PRESETS[provider]) {
    presetSelect.innerHTML = '';
    PRESETS[provider].forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value; opt.textContent = p.label;
      presetSelect.appendChild(opt);
    });
  }

  // Load saved values for this provider
  const saved = currentConfig?.providers?.[provider] || {};
  cfgModel.value = saved.model || PROVIDER_DEFAULTS[provider]?.model || '';
  cfgApiKey.value = saved.apiKey || '';
  cfgBaseUrl.value = saved.baseUrl || PROVIDER_DEFAULTS[provider]?.baseUrl || '';
  cfgModel.placeholder = PROVIDER_DEFAULTS[provider]?.model || 'model';
  cfgBaseUrl.placeholder = PROVIDER_DEFAULTS[provider]?.baseUrl || 'base url';
}

providerSelect.addEventListener('change', () => {
  switchProvider(providerSelect.value);
  autoSave();
});

presetSelect.addEventListener('change', () => {
  const provider = providerSelect.value;
  const presets = PRESETS[provider];
  if (!presets) return;
  const p = presets.find(x => x.value === presetSelect.value);
  if (p && p.model) {
    cfgModel.value = p.model;
    cfgBaseUrl.value = p.baseUrl || '';
    autoSave();
  }
});

// --- Auto-save ---
let currentConfig = null;
let saveTimer = null;
function autoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 300);
}
async function doSave() {
  const provider = providerSelect.value;
  const config = {
    hotkey: document.getElementById('hotkey').value || 'shift+z+x',
    dismissKey: document.getElementById('dismissKey').value || 'escape',
    cacheKey: document.getElementById('cacheKey').value || 'shift+s',
    targetLanguage: document.getElementById('targetLanguage').value,
    provider,
    providers: currentConfig?.providers || {},
  };
  // Save current provider fields
  if (provider !== 'google') {
    config.providers[provider] = {
      ...(config.providers[provider] || {}),
      model: cfgModel.value.trim() || undefined,
      apiKey: cfgApiKey.value.trim() || undefined,
      baseUrl: cfgBaseUrl.value.trim() || undefined,
    };
  }
  currentConfig = config;
  await window.api.saveConfig(config);
}
document.querySelectorAll('input:not([data-hotkey]), select').forEach(el => {
  el.addEventListener('change', autoSave);
  el.addEventListener('input', autoSave);
});

// --- Hotkey recording ---
const CODE_TO_NAME = {
  KeyA:'a',KeyB:'b',KeyC:'c',KeyD:'d',KeyE:'e',KeyF:'f',KeyG:'g',KeyH:'h',
  KeyI:'i',KeyJ:'j',KeyK:'k',KeyL:'l',KeyM:'m',KeyN:'n',KeyO:'o',KeyP:'p',
  KeyQ:'q',KeyR:'r',KeyS:'s',KeyT:'t',KeyU:'u',KeyV:'v',KeyW:'w',KeyX:'x',
  KeyY:'y',KeyZ:'z',
  Digit0:'0',Digit1:'1',Digit2:'2',Digit3:'3',Digit4:'4',
  Digit5:'5',Digit6:'6',Digit7:'7',Digit8:'8',Digit9:'9',
  F1:'f1',F2:'f2',F3:'f3',F4:'f4',F5:'f5',F6:'f6',
  F7:'f7',F8:'f8',F9:'f9',F10:'f10',F11:'f11',F12:'f12',
  Space:'space',Enter:'enter',Tab:'tab',Escape:'escape',Backspace:'delete',
  Comma:',',Period:'.',Slash:'/',Semicolon:';',BracketLeft:'[',BracketRight:']',
};
let activeRecordBtn = null, activeRecordInput = null;
const recordedKeys = new Set();
document.querySelectorAll('.recordBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (activeRecordBtn === btn) stopRecording();
    else { if (activeRecordBtn) stopRecording(); startRecording(btn); }
  });
});
function startRecording(btn) {
  activeRecordBtn = btn;
  activeRecordInput = document.getElementById(btn.getAttribute('data-target'));
  btn.textContent = I18N[currentLang].stop;
  btn.style.background = '#f38ba8'; btn.classList.add('recording');
  activeRecordInput.value = '...'; activeRecordInput.style.borderColor = '#f38ba8';
  recordedKeys.clear();
  document.addEventListener('keydown', onRecordKey);
}
function stopRecording() {
  if (!activeRecordBtn) return;
  activeRecordBtn.textContent = I18N[currentLang].record;
  activeRecordBtn.style.background = ''; activeRecordBtn.classList.remove('recording');
  if (activeRecordInput) activeRecordInput.style.borderColor = '';
  document.removeEventListener('keydown', onRecordKey);
  recordedKeys.clear(); activeRecordBtn = null; activeRecordInput = null;
  autoSave();
}
function onRecordKey(e) {
  e.preventDefault(); e.stopPropagation();
  let mod = '';
  if (e.shiftKey) mod = 'shift'; else if (e.metaKey) mod = 'cmd';
  else if (e.altKey) mod = 'alt'; else if (e.ctrlKey) mod = 'ctrl';
  const key = CODE_TO_NAME[e.code];
  if (!key) return;
  if (!mod) { activeRecordInput.value = key; stopRecording(); return; }
  recordedKeys.add(key);
  activeRecordInput.value = mod + '+' + Array.from(recordedKeys).slice(0, 2).join('+');
  if (recordedKeys.size >= 2 || !e.shiftKey) stopRecording();
}
document.addEventListener('keyup', () => {
  if (activeRecordBtn && recordedKeys.size > 0) recordedKeys.clear();
});

// --- Load config ---
window.api.getConfig().then(config => {
  currentConfig = config;
  document.getElementById('hotkey').value = config.hotkey || 'shift+z+x';
  document.getElementById('dismissKey').value = config.dismissKey || 'escape';
  document.getElementById('cacheKey').value = config.cacheKey || 'shift+s';
  document.getElementById('targetLanguage').value = config.targetLanguage || 'zh-CN';
  providerSelect.value = config.provider || 'google';
  switchProvider(providerSelect.value);
});
