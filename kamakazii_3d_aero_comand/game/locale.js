/* game/locale.js
   Lightweight translation module for KAMIKAZZI 3D.
   Loads JSON locale files from /locales/, caches them, and provides
   a t(key) function that returns the translated string for the
   active locale, falling back to English for any missing key.

   Usage:
     import { t, setLocale, getLocale, getAvailableLocales } from './locale.js';
     t('btn.startFlying')           // → "Start Flying"
     setLocale('ja')                // switch to Japanese
     t('btn.startFlying')           // → "出撃"

   Locale is persisted in localStorage under 'kamikazzi_locale'.

   DOM translation:
     <h1 data-i18n="title"></h1>
     <input data-i18n-placeholder="briefings.placeholder">
     <div data-i18n-html="hint"></div>
     <span data-i18n-attr="aria-label:settings.language"></span>
   Call applyDOMTranslations() after locale change to re-render.
*/

const STORAGE_KEY = 'kamikazzi_locale';
const FALLBACK_LOCALE = 'en';

let currentLocale = FALLBACK_LOCALE;
let cache = {};
let availableLocales = [];
let localeRegistry = {};
let readyPromise = null;

// ---- Core translation ----

export function t(key, ...args) {
  const bundle = cache[currentLocale] || cache[FALLBACK_LOCALE] || {};
  let val = bundle[key];
  if (val === undefined || val === null) {
    const enBundle = cache[FALLBACK_LOCALE] || {};
    val = enBundle[key];
  }
  if (val === undefined || val === null) return key;
  if (args.length > 0) {
    val = val.replace(/\{(\d+)\}/g, (_, idx) => {
      const i = parseInt(idx, 10);
      return i < args.length ? String(args[i]) : '';
    });
  }
  return val;
}

export function setLocale(code) {
  if (code === currentLocale && cache[code]) {
    applyDOMTranslations();
    return Promise.resolve();
  }
  return loadLocale(code).then(() => {
    currentLocale = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
    document.documentElement.lang = code.replace(/_/g, '-');
    applyDOMTranslations();
    window.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale: code } }));
  });
}

export function getLocale() { return currentLocale; }

export function getLocaleInfo() {
  return localeRegistry[currentLocale] || { name: 'English', nativeName: 'English', flag: '🇺🇸' };
}

export function getAvailableLocales() { return availableLocales.slice(); }

export function isLocaleLoaded(code) { return !!cache[code]; }

export function init() {
  if (readyPromise) return readyPromise;
  readyPromise = loadLocaleRegistry().then(() => {
    const saved = getSavedLocale();
    return loadLocale(saved).then(() => {
      currentLocale = saved;
      document.documentElement.lang = saved.replace(/_/g, '-');
      applyDOMTranslations();
    });
  });
  return readyPromise;
}

// ---- DOM translation ----

/** Walk the DOM and translate elements with data-i18n attributes. */
export function applyDOMTranslations() {
  // data-i18n: replace textContent
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  // data-i18n-html: replace innerHTML (for strings with <br> etc.)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (key) el.innerHTML = t(key);
  });
  // data-i18n-placeholder: set placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  // data-i18n-attr: set arbitrary attribute "attrName:translationKey"
  document.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const val = el.getAttribute('data-i18n-attr');
    if (!val) return;
    const colon = val.indexOf(':');
    if (colon === -1) return;
    const attr = val.slice(0, colon);
    const key = val.slice(colon + 1);
    if (attr && key) el.setAttribute(attr, t(key));
  });
  // data-i18n-title: set title attribute
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
  // Update <html lang>
  document.documentElement.lang = currentLocale.replace(/_/g, '-');
  // Update the language picker UI if it exists
  const langSelect = document.getElementById('langSelect');
  if (langSelect) langSelect.value = currentLocale;
}

// ---- Internal ----

function getSavedLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && availableLocales.some(l => l.code === saved)) return saved;
  } catch (_) {}
  return FALLBACK_LOCALE;
}

async function loadLocaleRegistry() {
  try {
    const res = await fetch('/locales/locales.json');
    const data = await res.json();
    localeRegistry = {};
    availableLocales = [];
    for (const [code, info] of Object.entries(data)) {
      localeRegistry[code] = info;
      availableLocales.push({ code, ...info });
    }
  } catch (_) {
    localeRegistry = { en: { name: 'English', nativeName: 'English', flag: '🇺🇸' } };
    availableLocales = [{ code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' }];
  }
}

async function loadLocale(code) {
  if (cache[code]) return cache[code];
  try {
    const res = await fetch(`/locales/${code}.json`);
    const data = await res.json();
    cache[code] = data;
    return data;
  } catch (_) {
    cache[code] = {};
    return {};
  }
}
