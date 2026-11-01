// Per-channel localStorage helpers for the dashboard settings cache.
// Both dashboard.html and index.html live on the same origin (GitHub Pages),
// so localStorage is shared between them.

const STORAGE_PREFIX = 'goal_overlay_';

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

// ---- channel settings (dashboard local cache) ----
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

export function hasSettings(channel) {
    return storageGet(storageKey(channel, 'settings'), null) !== null;
}

// ---- URL helpers ----
export function norm(channel) {
    return String(channel || '').trim().toLowerCase();
}
export function hashParam(name) {
    return String(new URLSearchParams(location.hash.slice(1)).get(name) || '').trim();
}
export function searchParam(name) {
    return String(new URLSearchParams(location.search).get(name) || '').trim();
}
export function broadcasterId() {
    return hashParam('broadcaster_id') || searchParam('broadcaster_id');
}
