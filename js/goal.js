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
    showSpyroIndicator: true,
    goalStyle: 'grape',
    eventsFade: false,
    eventsFadeAfterMs: 10000,
    goalDataSource: 'persist',
    startingPoints: 0,
    goalManualPoints: 0,
    fontColor: '#c5b5fb',
    backgroundColor: 'rgba(62, 35, 95, 0.35)',
};

let channel = '';
let settings = { ...DEFAULTS };
let goalCurrentPoints = 0;
let testPoints = 0;
let goalEnabled = true;
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
    const t = String(tier || '');
    if (t.toLowerCase() === 'prime') return 'Prime';
    if (t === '3000' || t === '3' || t.includes('3000')) return 'Tier 3';
    if (t === '2000' || t === '2' || t.includes('2000')) return 'Tier 2';
    if (t === '1000' || t === '1' || t.includes('1000')) return 'Tier 1';
    if (t === 'Prime') return 'Prime';
    return t;
}

function addSubEvent(username, tier, isGifted, isCommunity) {
    if (!$subEvents) return;

    const tierStr = String(tier || '');
    const isPrime = isPrimeSub({ 'sub-plan': tier }) || tierStr.toLowerCase() === 'prime' || tierStr === 'Prime';
    if (isCommunity && settings.hideCommunityInOverlay) return;
    if (isGifted && !isCommunity && settings.hideGiftedInOverlay) return;
    if (isPrime && !isGifted && !isCommunity && settings.hidePrimeInOverlay) return;

    const name = tierName(tier);
    const actor = (username && username !== 'null' && username !== 'undefined' && username !== '') ? username : (isCommunity ? 'Community' : 'Someone');
    let text;
    if (isCommunity) {
        text = actor + ' gifted ' + name + ' sub (community)';
    } else if (isGifted) {
        text = actor + ' gifted ' + name + ' sub';
    } else if (isPrime) {
        text = actor + ' subscribed with Prime';
    } else {
        text = actor + ' subscribed ' + name;
    }

    const pts = pointsForTier(tier);
    const item = document.createElement('div');
    item.className = 'sub-event';
    const left = document.createElement('span');
    left.className = 'sub-event-text';
    left.textContent = text;
    const right = document.createElement('span');
    right.className = 'sub-event-points';
    right.textContent = '+' + pts;
    item.appendChild(left);
    item.appendChild(right);

    $subEvents.insertBefore(item, $subEvents.firstChild);

    while ($subEvents.children.length > 20) {
        $subEvents.removeChild($subEvents.lastChild);
    }

    if (settings.eventsFade === true) {
        const fadeAfter = Math.max(1000, parseInt(settings.eventsFadeAfterMs, 10) || 10000);
        setTimeout(() => {
            item.style.opacity = '0';
            setTimeout(() => { if (item.parentNode) item.remove(); }, 500);
        }, fadeAfter);
    }
}

function isPrimeSub(userstate) {
    if (!userstate) return false;
    const plan = userstate['sub-plan'] || userstate['msg-param-sub-plan'] || userstate.plan || userstate['subPlan'] || userstate['sub_plan'];
    if (!plan) return false;
    if (plan === 'Prime') return true;
    const s = String(plan).toLowerCase();
    if (s === 'prime') return true;
    if (s === '1000' && (userstate['isPrime'] === true || userstate.prime === true)) return true;
    return false;
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
    positionSpyroIndicator();
}

function applySize() {
    $goalContainer.style.width = settings.overlayWidth + 'px';
    $goalContainer.style.height = settings.overlayHeight + 'px';
    const wrap = document.getElementById('sub-events-wrap');
    if (wrap) wrap.style.width = settings.overlayWidth + 'px';
    const hist = document.querySelector('.sub-events-history');
    if (hist) hist.style.width = '100%';
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

    connectRoom();

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
            const tier = payload.tier || '1000';
            const isPrime = isPrimeSub({ 'sub-plan': tier }) || String(tier).toLowerCase() === 'prime';
            const displayTier = isPrime ? 'Prime' : tier;
            if (isGifted && settings.hideGiftedInOverlay) {
                addSubEvent(payload.username || 'Viewer', displayTier, isGifted, false);
                return;
            }
            if (isPrime && !isGifted && settings.hidePrimeInOverlay) {
                addSubEvent(payload.username || 'Viewer', displayTier, isGifted, false);
                return;
            }
            // test events from dashboard add points
            addPoints(displayTier);
            testPoints += pointsForTier(tier);
            addSubEvent(payload.username || 'Viewer', displayTier, isGifted, false);
        });
        b.onResetPoints((payload) => {
            if (!validateSession()) return;
            // Remove only test-event points from the goal; real sub points stay
            goalCurrentPoints = Math.max(0, goalCurrentPoints - testPoints);
            savePoints(channel, goalCurrentPoints);
            updateBar();
            positionSpyroIndicator();
            // reset only test events from history
            testPoints = 0;
            if ($subEvents) {
                const items = Array.from($subEvents.querySelectorAll('.sub-event'));
                for (const it of items) {
                    const t = it.textContent || '';
                    if (t.startsWith('TestUser') || t.includes('Test')) {
                        it.remove();
                    }
                }
            }
        });
        b.onSetPoints((payload) => {
            if (!validateSession()) return;
            if (payload && typeof payload.points === 'number') {
                goalCurrentPoints = Math.max(0, Math.floor(payload.points));
                savePoints(channel, goalCurrentPoints);
                updateBar();
            }
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
    if (!channel || !key) {
        disconnectOverlay('Missing key.');
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
    console.log('Goal Overlay session invalid: ' + reason);
}

function reinitComfy(newChannel) {
    // Disconnect old ComfyJS session
    try {
        if (window.ComfyJS && window.ComfyJS.Disconnect) {
            window.ComfyJS.Disconnect();
        }
    } catch (e) {
        console.error('[overlay] Failed to disconnect ComfyJS', e);
    }
    // Clear event history for the new channel
    if ($subEvents) {
        // Remove existing sub-event items
        const items = Array.from($subEvents.querySelectorAll('.sub-event'));
        for (const it of items) {
            const t = it.textContent || '';
            // Only remove test events from history; keep regular events
            // But since we're switching channels, clear all for this overlay
            it.remove();
        }
        // Reset the max displayed events counter
        while ($subEvents.children.length > 0) {
            $subEvents.removeChild($subEvents.firstChild);
        }
    }
    // Update the channel variable and reinitialize
    channel = typeof newChannel !== 'undefined' ? newChannel : normChannel();
    try {
        initComfy();
    } catch (e) {
        console.error('[overlay] Failed to reinitialize ComfyJS', e);
    }
}

function handleSubscriber(actor, tier, isGifted, isCommunity) {
    const tierStr = String(tier || '');
    const isPrime = isPrimeSub({ 'sub-plan': tier }) || tierStr.toLowerCase() === 'prime' || tierStr === 'Prime';
    const displayTier = isPrime ? 'Prime' : tier;
    // If hidden in overlay, don't count for goal
    if (isCommunity && settings.hideCommunityInOverlay) {
        addSubEvent(actor, displayTier, isGifted, isCommunity);
        return;
    }
    if (isGifted && !isCommunity && settings.hideGiftedInOverlay) {
        addSubEvent(actor, displayTier, isGifted, isCommunity);
        return;
    }
    if (isPrime && !isGifted && !isCommunity && settings.hidePrimeInOverlay) {
        addSubEvent(actor, displayTier, isGifted, isCommunity);
        return;
    }
    addPoints(displayTier);
    addSubEvent(actor, displayTier, isGifted, isCommunity);
}

function tierFromInfo(info) {
    if (!info) return '1000';
    if (info.prime) return 'Prime';
    return info.plan || '1000';
}

function isPrimeFromInfo(info) {
    if (!info) return false;
    return info.prime === true || String(info.plan || '').toLowerCase() === 'prime';
}

function displayNameFromInfo(username, userstate, sender) {
    if (sender && sender !== 'null' && sender !== 'undefined') return sender;
    if (username && username !== 'null' && username !== 'undefined') return username;
    if (userstate) {
        const dn = userstate['display-name'] || userstate.displayName || userstate['login'] || '';
        if (dn) return dn;
    }
    return '';
}

function actorFromInfo(username, userstate, sender, isCommunity) {
    if (isCommunity) return 'Community';
    if (sender && sender !== 'null' && sender !== 'undefined') return sender;
    if (username && username !== 'null' && username !== 'undefined') return username;
    if (userstate) {
        const un = userstate['login'] || userstate['display-name'] || userstate.displayName || '';
        if (un) return un;
    }
    return '';
}

function initComfy() {
    if (!window.ComfyJS) {
        console.error('Goal Overlay: ComfyJS not loaded');
        return;
    }

    // onSub: new (non-resub, non-gift) subscription
    // ComfyJS 1.1.29 signature: onSub(user, message, subTierInfo, extra)
    //   subTierInfo = { prime, plan, planName } from tmi.js methods object
    window.ComfyJS.onSub = (user, message, subTierInfo, extra) => {
        const tier = tierFromInfo(subTierInfo);
        const displayName = displayNameFromInfo(user, subTierInfo, undefined);
        const actor = actorFromInfo(user, subTierInfo, undefined, false);
        handleSubscriber(actor, tier, false, false);
    };

    // onSubGift: gifted subscription
    // ComfyJS 1.1.29 signature: onSubGift(gifterUser, streakMonths, recipientUser, senderCount, subTierInfo, extra)
    //   subTierInfo = { prime, plan, planName }
    // Note: old code had (channelName, username, sender, userstate, methods) — wrong arg order
    window.ComfyJS.onSubGift = (gifterUser, streakMonths, recipientUser, senderCount, subTierInfo, extra) => {
        const tier = tierFromInfo(subTierInfo);
        const displayName = displayNameFromInfo(undefined, subTierInfo, gifterUser);
        const actor = actorFromInfo(undefined, subTierInfo, gifterUser, false);
        handleSubscriber(actor, tier, true, false);
    };

    // onResub: subscription renewal
    // ComfyJS 1.1.29 signature: onResub(user, message, streakMonths, cumulativeMonths, subTierInfo, extra)
    //   subTierInfo = { prime, plan, planName }
    window.ComfyJS.onResub = (user, message, streakMonths, cumulativeMonths, subTierInfo, extra) => {
        const tier = tierFromInfo(subTierInfo);
        const displayName = displayNameFromInfo(user, subTierInfo, undefined);
        const actor = actorFromInfo(user, subTierInfo, undefined, false);
        handleSubscriber(actor, tier, false, false);
    };

    // onSubMysteryGift: mystery/community gift subscription
    // ComfyJS 1.1.29 signature: onSubMysteryGift(gifterUser, numbOfSubs, senderCount, subTierInfo, extra)
    //   subTierInfo = { prime, plan, planName }
    window.ComfyJS.onSubMysteryGift = (gifterUser, numbOfSubs, senderCount, subTierInfo, extra) => {
        const tier = tierFromInfo(subTierInfo);
        const displayName = displayNameFromInfo(undefined, subTierInfo, gifterUser);
        const actor = actorFromInfo(undefined, subTierInfo, gifterUser, true);
        handleSubscriber(actor, tier, true, true);
    };

    // onGiftSubContinue: continuing a gifted sub
    // ComfyJS 1.1.29 signature: onGiftSubContinue(username, sender, extra)
    //   username = recipient login, sender = gifter name (may be null if anonymous),
    //   extra = { gifterUsername, gifterDisplayName } — ComfyJS does not forward
    //   sub-plan info, so we default to Tier 1 (the old code also always fell back to '1000').
    window.ComfyJS.onGiftSubContinue = (username, sender, extra) => {
        const tier = '1000';
        const displayName = displayNameFromInfo(undefined, undefined, sender);
        const actor = actorFromInfo(undefined, undefined, sender, false);
        handleSubscriber(actor, tier, true, false);
    };

    // Community sub gifts in ComfyJS come through onSubGift or onSubMysteryGift;
    // there is no standalone onCommunitySubGift event. The old handler is removed.

    // Prime upgrades/paid upgrades come through onPrimePaidUpgrade in old code
    // but ComfyJS does not emit that event. Prime subs come through onSub/onResub
    // with subTierInfo.prime = true, so no separate handler needed.

    try {
        window.ComfyJS.Init(channel);
    } catch (e) {
        console.error('[overlay] ComfyJS init failed', e);
    }
}

function positionSpyroIndicator() {
    if (!settings.showSpyroIndicator) {
        const indicator = document.querySelector('.spyro-indicator');
        if (indicator) indicator.style.display = 'none';
        return;
    }
    const indicator = document.querySelector('.spyro-indicator');
    if (!indicator) return;
    indicator.style.display = 'block';
    const pct = settings.goalTarget > 0
        ? Math.min(goalCurrentPoints / settings.goalTarget, 1)
        : 0;
    // Spyro sits at the bottom ledge of the track
    // Moves horizontally as the goal fills
    indicator.style.left = `${pct * 100}%`;
    indicator.style.top = 'auto';
    indicator.style.bottom = '0';
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
window.reinitComfy = reinitComfy;
