// Shared configuration for dashboard and overlay.
// Supabase project shared with miguelium-wisdom and animalese-overlay;
// state is keyed by Twitch broadcaster_id instead of a secret room key.
export const SUPABASE_URL = 'https://jljzewyxrfwluulxlmmt.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_elzdN-zBSd9k4-UDHZQztA_BHs5-WJc';

// Twitch app Client ID (public, safe in frontend). Set your own from dev.twitch.tv/console.
export const TWITCH_CLIENT_ID = '8ogyj5yo3y71lsorrm94x2sop5prtx';

// Twitch OAuth Edge Function (public URL; the client secret stays server-side).
// Use the format Supabase actually serves: https://<project-ref>.supabase.co/functions/v1/twitch-oauth
export const TWITCH_OAUTH_BASE = 'https://jljzewyxrfwluulxlmmt.supabase.co/functions/v1/twitch-oauth';
