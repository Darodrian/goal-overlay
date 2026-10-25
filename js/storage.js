// Per-channel localStorage helpers for the goal overlay.
// Both dashboard.html and index.html live on the same origin (GitHub Pages),
// so localStorage is shared between them.

const STORAGE_PREFIX = 'goal_overlay_';

function norm(channel) {
    return String(channel || '').trim().toLowerCase();
}

function storageKey(channel, suffix) {
    return STORAGE_PREFIX + norm(channel) + '_' + suffix;
}

function storageGet(key, def) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? def : v;
    } catch (e) {
        return def;
    }
}

function storageSet(key, val) {
    try {
        localStorage.setItem(key, String(val));
    } catch (e) {
        // private mode / quota exceeded
    }
}

// ---- channel settings ----
export function getSettings(channel, defaults) {
    const raw = storageGet(storageKey(channel, 'settings'), null);
    if (!raw) return { ...defaults };
    try {
        const parsed = JSON.parse(raw);
        return { ...defaults, ...parsed };
    } catch (e) {
        return { ...defaults };
    }
}

export function saveSettings(channel, settings) {
    storageSet(storageKey(channel, 'settings'), JSON.stringify(settings));
}

// ---- secret key per channel ----
export function getKey(channel) {
    return storageGet(storageKey(channel, 'key'), '');
}
export function saveKey(channel, key) {
    storageSet(storageKey(channel, 'key'), key);
}
export function hasKey(channel) {
    return getKey(channel).length > 0;
}

export function generateKey(len = 24) {
    const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
    const n = alphabet.length;
    const limit = 256 - (256 % n);
    const out = [];
    while (out.length < len) {
        const bytes = new Uint8Array(len * 2);
        crypto.getRandomValues(bytes);
        for (const b of bytes) {
            if (b < limit) out.push(alphabet[b % n]);
            if (out.length === len) break;
        }
    }
    return out.join('');
}

// ---- goal points persistence ----
export function getPoints(channel) {
    const raw = storageGet(storageKey(channel, 'points'), '0');
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}
export function savePoints(channel, points) {
    storageSet(storageKey(channel, 'points'), Math.max(0, Math.floor(points)));
}

// ---- URL helpers ----
export function norm(channel) {
    return String(channel || '').trim().toLowerCase();
}
export function hashParam(name) {
    return String(new URLSearchParams(location.hash.slice(1)).get(name) || '').trim();
}
export function normChannel() {
    return norm(hashParam('c'));
}
export function overlayKey() {
    return hashParam('k');
}
