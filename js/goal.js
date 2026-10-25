import { createBridge } from './bridge.js';
import {
    getSettings, saveSettings,
    getKey, saveKey, getKeyVersion, hasKey,
    getPoints, savePoints,
    normChannel, overlayKey,
} from './storage.js';

const PALETTES = {
    default: { name: "Default", colors: ["#efa0d7", "#ec90be", "#e1719b", "#c54e69", "#9c2e34", "#511914", "#f6d1f4", "#e53a79", "#bb2a4a", "#9b2227", "#000000"] },
    yellow: { name: "Yellow", colors: ["#f6ce32", "#f0ad2b", "#d8a328", "#9c711c", "#745916", "#4f4210", "#fef83c", "#e53714", "#c32e11", "#94200c", "#000000"] },
    red: { name: "Red", colors: ["#e43236", "#c32b28", "#9b241b", "#7c1e10", "#58170f", "#3c0d03", "#ee9e9d", "#e43699", "#c32c60", "#9b2227", "#000000"] },
    green: { name: "Green", colors: ["#96f444", "#8be33a", "#79c92f", "#4f8d21", "#3c6d19", "#274e12", "#ccf79a", "#c86d1d", "#b64b15", "#77380f", "#000000"] },
    snow: { name: "Snow", colors: ["#fefbff", "#d9d7da", "#b5b3b6", "#8a898b", "#69686a", "#4a494a", "#fefbff", "#e6525b", "#bc333c", "#9b2227", "#000000"] },
    carbon: { name: "Carbon", colors: ["#69686a", "#5a585a", "#4a494a", "#3b3b3c", "#333334", "#262526", "#7a797a", "#ed9528", "#e97720", "#b65116", "#000000"] },
    ocean: { name: "Ocean", colors: ["#97d5fd", "#77b2fb", "#5e92fa", "#3e72f9", "#2c59bb", "#282e6f", "#b3f8fe", "#5a57f8", "#4341d4", "#2b22a8", "#000000"] },
    sapphire: { name: "Sapphire", colors: ["#7992e9", "#627ad6", "#5269c4", "#224ba9", "#18358f", "#0f216e", "#b3c5fc", "#431cb1", "#361687", "#2f105f", "#000000"] },
    grape: { name: "Grape", colors: ["#a995fa", "#946ef9", "#7a53f8", "#6025cb", "#532d8f", "#3e235f", "#c5b5fb", "#9e4478", "#7d2a60", "#661848", "#000000"] },
    emerald: { name: "Emerald", colors: ["#92f5ba", "#66c98f", "#449665", "#35765c", "#2b5e4b", "#214735", "#c5f8dc", "#ee9d4c", "#c9752b", "#a75617", "#000000"] },
    orange: { name: "Orange", colors: ["#f0ad31", "#ed952d", "#ea772c", "#e75d2d", "#ad441f", "#6f2b16", "#fae738", "#e65118", "#ad3911", "#6f2b16", "#000000"] },
    chocolate: { name: "Chocolate", colors: ["#c37d5d", "#a8644c", "#884d3d", "#70372e", "#592921", "#431c19", "#c69484", "#842a1b", "#6e1e10", "#5f1508", "#000000"] },
    cherry: { name: "Cherry", colors: ["#ed91d7", "#ea7abd", "#e0649a", "#c43e68", "#842334", "#511914", "#f6d1f4", "#479556", "#43764d", "#365e37", "#000000"] },
    chalk: { name: "Chalk", colors: ["#d9d7da", "#b5b3b6", "#939193", "#69686a", "#4a494a", "#2d2c2d", "#fefbff", "#717071", "#515151", "#3b3b3c", "#000000"] }
};

const DEFAULTS = {
    goalLabel: 'Meta Partner Plus 2',
    goalTarget: 200,
    goalBarColor: '#946ef9',
    goalBarEnabled: true,
    overlayWidth: 600,
    overlayHeight: 100,
    subTier1Points: 1,
    subTier2Points: 2,
    subTier3Points: 6,
    hideGiftedInOverlay: false,
    hidePrimeInOverlay: false,
    hideCommunityInOverlay: false,
    goalStyle: 'grape',
    goalDataSource: 'persist',
    startingPoints: 0,
    goalManualPoints: 0,
    fontColor: '#c5b5fb',
    backgroundColor: 'rgba(62, 35, 95, 0.35)',
};

let channel = '';
let settings = { ...DEFAULTS };
let goalCurrentPoints = 0;
let goalEnabled = true;
let overlayKeyVersion = '';
let validateTimer = null;
let bridge = null;

// DOM refs
const $goalLabel = document.getElementById('goal-label');
const $goalProgress = document.getElementById('goal-progress');
const $goalFill = document.getElementById('goal-fill');
const $goalContainer = document.getElementById('goal-container');
const $subEvents = document.getElementById('sub-events');
const $setupNotice = document.getElementById('setup-notice');
const $obsUrl = document.getElementById('obs-url');

function pointsForTier(tier) {
    const t = String(tier || '').toLowerCase();
    if (t === 'prime') return settings.subTier1Points;
    if (t === '3000' || t === '3' || t.includes('3000')) return settings.subTier3Points;
    if (t === '2000' || t === '2' || t.includes('2000')) return settings.subTier2Points;
    if (t === '1000' || t === '1' || t.includes('1000')) return settings.subTier1Points;
    // default to tier 1
    return settings.subTier1Points;
}

function tierName(tier) {
    const t = String(tier);
    if (t === '3000' || t === '3') return 'Tier 3';
    if (t === '2000' || t === '2') return 'Tier 2';
    if (t === '1000' || t === '1') return 'Tier 1';
    if (t === 'Prime' || t.toLowerCase() === 'prime') return 'Prime';
    return 'Tier ' + t;
}

function addSubEvent(username, tier, isGifted, isCommunity) {
    if (!$subEvents) return;

    const isPrime = String(tier).toLowerCase() === 'prime';
    if (isCommunity && settings.hideCommunityInOverlay) return;
    if (isGifted && !isCommunity && settings.hideGiftedInOverlay) return;
    if (isPrime && !isGifted && !isCommunity && settings.hidePrimeInOverlay) return;

    const name = tierName(tier);
    let text;
    if (isCommunity) {
        text = 'Community gifted ' + name + ' sub';
    } else if (isGifted) {
        text = username + ' gifted ' + name + ' sub';
    } else if (isPrime) {
        text = username + ' subscribed with Prime';
    } else {
        text = username + ' subscribed ' + name;
    }

    const item = document.createElement('div');
    item.className = 'sub-event';
    item.textContent = text;

    $subEvents.insertBefore(item, $subEvents.firstChild);

    while ($subEvents.children.length > 5) {
        $subEvents.removeChild($subEvents.lastChild);
    }

    setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => { if (item.parentNode) item.remove(); }, 500);
    }, 10000);
}

function isPrimeSub(userstate) {
    if (!userstate) return false;
    const plan = userstate['sub-plan'] || userstate['msg-param-sub-plan'] || userstate.plan;
    return plan === 'Prime' ||
           userstate['isPrime'] === true ||
           String(plan).toLowerCase() === 'prime';
}

function isCommunityGift(event, userstate) {
    return event.communityGift === true ||
           event.isCommunityGift === true ||
           event.giftType === 'community' ||
           event.isCommunity === true ||
           event.community_gift === true ||
           (userstate && (userstate['msg-param-gifted'] === 'community' || userstate['msg-param-promogift'] === '1'));
}

function isGiftedSub(event, userstate) {
    const gifted = event.gifted === true || event.amount === 'gift' ||
                   (userstate && (userstate['msg-param-gifted'] === '1' || userstate['msg-param-gifted'] === true));
    return gifted && !isCommunityGift(event, userstate);
}

function updateBar() {
    const pct = settings.goalTarget > 0
        ? Math.min(goalCurrentPoints / settings.goalTarget, 1) * 100
        : 0;
    $goalFill.style.width = pct + '%';
    $goalProgress.textContent = goalCurrentPoints + ' / ' + settings.goalTarget;
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
}

function applySize() {
    $goalContainer.style.width = settings.overlayWidth + 'px';
    $goalContainer.style.height = settings.overlayHeight + 'px';
}

function applyPalette(styleName) {
    const style = styleName || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!pal) return;
    document.documentElement.style.setProperty('--goal-color-1', pal.colors[1] || '#946ef9');
    document.documentElement.style.setProperty('--goal-color-2', pal.colors[2] || pal.colors[1] || '#7a53f8');
    document.documentElement.style.setProperty('--goal-color-3', pal.colors[7] || '#c5b5fb');
    document.documentElement.style.setProperty('--goal-color-border', pal.colors[10] || '#000000');
    document.documentElement.style.setProperty('--goal-color-track', pal.colors[5] || 'rgba(62, 35, 95, 0.6)');
    document.documentElement.style.setProperty('--goal-color-bg', pal.colors[5] ? 'rgba(' + parseInt(pal.colors[5].slice(1,3),16) + ', ' + parseInt(pal.colors[5].slice(3,5),16) + ', ' + parseInt(pal.colors[5].slice(5,7),16) + ', 0.35)' : 'rgba(62, 35, 95, 0.35)');
    document.documentElement.style.setProperty('--goal-color-text', pal.colors[6] || '#c5b5fb');
    document.documentElement.style.setProperty('--goal-color-text-shadow', pal.colors[10] || '#000000');
    document.body.dataset.goalStyle = style;
}

function applyLiveSettings(s) {
    if (!s) return;
    settings = { ...settings, ...s };
    const style = settings.goalStyle || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!settings.goalBarColor) {
        settings.goalBarColor = pal.colors[1] || '#946ef9';
    }
    if ($goalLabel) $goalLabel.textContent = settings.goalLabel;
    if ($goalProgress) $goalProgress.textContent = goalCurrentPoints + ' / ' + settings.goalTarget;
    goalEnabled = settings.goalBarEnabled !== false;
    const bar = document.querySelector('.goal-bar');
    if (bar) bar.style.display = goalEnabled ? '' : 'none';
    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applyPalette(style);
    applySize();
    updateBar();
}

function initGoal() {
    settings = getSettings(channel, DEFAULTS);

    const style = settings.goalStyle || 'grape';
    const pal = PALETTES[style] || PALETTES.grape;
    if (!settings.goalBarColor) {
        settings.goalBarColor = pal.colors[1] || '#946ef9';
    }

    $goalLabel.textContent = settings.goalLabel;
    $goalProgress.textContent = '0 / ' + settings.goalTarget;

    goalEnabled = settings.goalBarEnabled !== false;
    if (!goalEnabled) {
        document.querySelector('.goal-bar').style.display = 'none';
    }

    document.documentElement.style.setProperty('--goal-color-1', settings.goalBarColor);
    applyPalette(style);
    applySize();
    updateBar();

    const manual = parseInt(settings.goalManualPoints, 10) || 0;
    if (manual > 0) {
        goalCurrentPoints = manual;
    } else if (settings.goalDataSource === 'reset') {
        goalCurrentPoints = 0;
    } else if (settings.goalDataSource === 'manual') {
        goalCurrentPoints = parseInt(settings.startingPoints, 10) || 0;
    } else {
        // persist
        goalCurrentPoints = getPoints(channel);
    }
    savePoints(channel, goalCurrentPoints);
    updateBar();

    overlayKeyVersion = getKeyVersion(channel);

    connectRoom();

    // Poll session validity so OBS (no BroadcastChannel from dashboard) also
    // gets invalidated when the dashboard regenerates the key.
    if (validateTimer) clearInterval(validateTimer);
    validateTimer = setInterval(validateSession, 3000);
}

// ---- supabase room (overlay <- dashboard) ----
async function connectRoom() {
    if (!channel || !key) return;
    try {
        const b = createBridge(key);
        b.onStatus((s) => {
            if (s === 'CHANNEL_ERROR') {
                $setupNotice.classList.add('show');
                $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + getKey(channel);
            }
        });
        b.onSet((payload) => {
            if (!validateSession()) return;
            const s = payload && payload.settings;
            if (!s) return;
            applyLiveSettings(s);
        });
        b.onAddPoints((payload) => {
            if (!validateSession()) return;
            const isGifted = payload.isGifted === true;
            const tier = payload.tier;
            const isPrime = isPrimeSub({ 'sub-plan': tier });
            if (isGifted && settings.hideGiftedInOverlay) {
                addSubEvent(payload.username || 'Viewer', tier, isGifted, false);
                return;
            }
            if (isPrime && !isGifted && settings.hidePrimeInOverlay) {
                addSubEvent(payload.username || 'Viewer', tier, isGifted, false);
                return;
            }
            addPoints(tier);
            addSubEvent(payload.username || 'Viewer', tier, isGifted, false);
        });
        b.onResetPoints((payload) => {
            if (!validateSession()) return;
            resetGoalPoints();
        });
        b.onKeyChanged((payload) => {
            disconnectOverlay('Key regenerated by dashboard.');
        });
        await b.connect();
        bridge = b;
        b.sendHello();
    } catch (e) {
        bridge = null;
        console.warn('[overlay] room unavailable, continuing without live updates', e?.message ?? e);
    }
}

function addPoints(tier) {
    goalCurrentPoints += pointsForTier(tier);
    savePoints(channel, goalCurrentPoints);
    updateBar();
}

function resetGoalPoints() {
    goalCurrentPoints = 0;
    savePoints(channel, goalCurrentPoints);
    updateBar();
}

// ---- session validation ----
// Ensures the overlay's key/version still matches what the dashboard has
// stored. If the dashboard generated a new key, this overlay's session is
// invalid and it must disconnect. Runs on BroadcastChannel messages and via
// polling so OBS (which doesn't receive BroadcastChannel from the dashboard)
// also gets invalidated.
function validateSession() {
    const storedKey = getKey(channel);
    const storedVersion = getKeyVersion(channel);
    if (!channel || !key) {
        disconnectOverlay('Missing key.');
        return false;
    }
    if (key !== storedKey) {
        // URL key is authoritative - sync it (important for OBS cross-context)
        saveKey(channel, key);
        overlayKeyVersion = getKeyVersion(channel);
        return true;
    }
    if (overlayKeyVersion !== storedVersion) {
        disconnectOverlay('Key changed. Generate a new overlay URL in the dashboard.');
        return false;
    }
    return true;
}

function disconnectOverlay(reason) {
    try {
        if (bridge) { bridge.leave(); bridge = null; }
    } catch (e) {}
    try {
        if (window.ComfyJS && window.ComfyJS.Disconnect) {
            window.ComfyJS.Disconnect();
        }
    } catch (e) {}
    $setupNotice.classList.add('show');
    $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + getKey(channel);
    if (validateTimer) { clearInterval(validateTimer); validateTimer = null; }
    console.log('Goal Overlay session invalid: ' + reason);
}

function handleSubscriber(actor, tier, isGifted, isCommunity) {
    const isPrime = isPrimeSub({ 'sub-plan': tier }) || String(tier).toLowerCase() === 'prime';
    // If hidden in overlay, don't count for goal
    if (isCommunity && settings.hideCommunityInOverlay) {
        addSubEvent(actor, tier, isGifted, isCommunity);
        return;
    }
    if (isGifted && !isCommunity && settings.hideGiftedInOverlay) {
        addSubEvent(actor, tier, isGifted, isCommunity);
        return;
    }
    if (isPrime && !isGifted && !isCommunity && settings.hidePrimeInOverlay) {
        addSubEvent(actor, tier, isGifted, isCommunity);
        return;
    }
    addPoints(tier);
    addSubEvent(actor, tier, isGifted, isCommunity);
}

function initComfy() {
    if (!window.ComfyJS) {
        console.error('Goal Overlay: ComfyJS not loaded');
        return;
    }

    window.ComfyJS.onSubscriber = (channelName, username, message, userstate, methods) => {
        const tier = userstate && (userstate['sub-plan'] || userstate['msg-param-sub-plan'] || methods?.plan || '1000');
        handleSubscriber(username, tier, false, false);
    };

    window.ComfyJS.onSubGift = (channelName, username, sender, userstate, methods) => {
        const tier = userstate && (userstate['sub-plan'] || userstate['msg-param-sub-plan'] || methods?.plan || '1000');
        handleSubscriber(sender || username, tier, true, false);
    };

    window.ComfyJS.onCommunitySubGift = (channelName, username, userstate, methods) => {
        const tier = userstate && (userstate['sub-plan'] || userstate['msg-param-sub-plan'] || methods?.plan || '1000');
        handleSubscriber('Community', tier, true, true);
    };

    window.ComfyJS.onPrime = (channelName, username, message, userstate, methods) => {
        handleSubscriber(username, 'Prime', false, false);
    };

    window.ComfyJS.onResub = (channelName, username, months, message, userstate, methods) => {
        const tier = userstate && (userstate['sub-plan'] || userstate['msg-param-sub-plan'] || methods?.plan || '1000');
        handleSubscriber(username, tier, false, false);
    };

    window.ComfyJS.onGiftSubContinue = (channelName, username, sender, userstate) => {
        // some events don't fire; try to count based on plan if present
        const tier = userstate && (userstate['sub-plan'] || userstate['msg-param-sub-plan'] || '1000');
        handleSubscriber(sender || username, tier, true, false);
    };

    try {
        window.ComfyJS.Init(channel);
    } catch (e) {
        console.error('[overlay] ComfyJS init failed', e);
    }
}

window.addEventListener('message', (ev) => {
    try {
        if (ev.data && ev.data.type === 'goal-preview') {
            applyLiveSettings(ev.data.settings);
        }
    } catch (e) {}
});

// ---- entry point ----
channel = normChannel();
const key = overlayKey();

if (!channel) {
    $setupNotice.classList.add('show');
    $obsUrl.textContent = location.origin + location.pathname + '?c=yourchannel&k=yourkey';
    // still init with defaults for preview
    settings = { ...DEFAULTS };
    initGoal();
} else {
    // Use URL key as source of truth (critical for OBS Browser Source where localStorage may differ)
    const storedKey = getKey(channel);
    if (key) {
        if (storedKey !== key) {
            saveKey(channel, key);
            // also update key version to match
        }
        overlayKeyVersion = getKeyVersion(channel);
        initGoal();
        initComfy();
    } else if (storedKey) {
        $setupNotice.classList.add('show');
        $obsUrl.textContent = location.origin + location.pathname + '?c=' + channel + '&k=' + storedKey;
    } else {
        $setupNotice.classList.add('show');
        $obsUrl.textContent = location.origin + location.pathname + '?c=yourchannel&k=yourkey';
        settings = { ...DEFAULTS };
        initGoal();
    }
}

window.addPoints = addPoints;
window.resetGoalPoints = resetGoalPoints;
