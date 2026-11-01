// Caption shown in the overlay: user override first, then the Twitch goal
// description, then a friendly name for the goal type (Twitch goals may be
// created without a description, in which case the API returns an empty string).

const GOAL_TYPE_LABELS = {
    follower: 'Followers',
    subscription: 'Subscribers',
    subscription_count: 'Subscribers',
    new_subscription: 'Subscribers',
    new_subscription_count: 'Subscribers',
    new_bit: 'Bits',
    new_cheerer: 'Cheerers',
};

export function goalTypeLabel(type) {
    return GOAL_TYPE_LABELS[type] || '';
}

export function resolveGoalLabel(override, description, type) {
    const o = String(override || '').trim();
    if (o) return o;
    if (description) return description;
    return goalTypeLabel(type);
}
