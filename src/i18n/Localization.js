import { ru } from './ru.js';
import { en } from './en.js';

const STORAGE_KEY = 'zarechnoe_language';

const TRANSLATIONS = {
    ru,
    en
};

export const SUPPORTED_LANGUAGES = [
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' }
];

function _detectInitialLanguage() {
    if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && TRANSLATIONS[saved]) return saved;
        } catch (e) {}
    }
    return 'ru';
}

let _currentLang = _detectInitialLanguage();
const _listeners = new Set();

export function getLanguage() {
    return _currentLang;
}

export function t(key, params = null) {
    if (!key) return '';
    const dict = TRANSLATIONS[_currentLang] || TRANSLATIONS.ru;
    let text = dict[key];
    if (text === undefined) {
        text = TRANSLATIONS.ru[key];
    }
    if (text === undefined) {
        return key;
    }
    if (params && typeof params === 'object') {
        text = text.replace(/\{(\w+)\}/g, (match, pKey) => (
            params[pKey] !== undefined ? String(params[pKey]) : match
        ));
    }
    return text;
}

export function applyDOMTranslations(root = typeof document !== 'undefined' ? document : null) {
    if (!root) return;
    if (typeof document !== 'undefined') {
        document.documentElement.lang = _currentLang;
        document.title = t('app.title');
    }
    const nodes = root.querySelectorAll('[data-i18n]');
    for (const el of nodes) {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    }
    const htmlNodes = root.querySelectorAll('[data-i18n-html]');
    for (const el of htmlNodes) {
        const key = el.getAttribute('data-i18n-html');
        if (key) {
            el.innerHTML = t(key);
        }
    }
}

export function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return false;
    _currentLang = lang;
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) {}
    }
    applyDOMTranslations();
    for (const cb of _listeners) {
        try {
            cb(_currentLang);
        } catch (e) {
            console.error('Localization listener error:', e);
        }
    }
    return true;
}

export function onLanguageChange(callback) {
    if (typeof callback === 'function') {
        _listeners.add(callback);
        return () => _listeners.delete(callback);
    }
    return () => {};
}

export default {
    t,
    getLanguage,
    setLanguage,
    applyDOMTranslations,
    onLanguageChange,
    SUPPORTED_LANGUAGES
};

