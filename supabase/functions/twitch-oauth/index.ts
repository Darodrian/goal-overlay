import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWITCH_AUTHORIZE = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS = "https://api.twitch.tv/helix/users";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID")!;
const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET")!;
// Base URL of this Edge Function, e.g. https://<project-ref>.supabase.co/functions/v1/twitch-oauth
const BASE_URL = Deno.env.get("BASE_URL")!;
// Fallback dashboard URL (used when no ?redirect param is passed).
const DASHBOARD_URL = Deno.env.get("DASHBOARD_URL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...extraHeaders },
    });
}

function redirect(url: string) {
    return new Response(null, {
        status: 302,
        headers: { Location: url },
    });
}

serve(async (req) => {
    const url = new URL(req.url);
    // Supabase Edge Functions route to /functions/v1/<name>/<path>
    // Strip the prefix so our route matching works regardless of deployment URL format.
    let path = url.pathname.replace(/\/+$/, "");
    const prefix = "/functions/v1/twitch-oauth";
    if (path.startsWith(prefix)) {
        path = path.slice(prefix.length) || "/";
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type",
            },
        });
    }

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
    };

    try {
        // ---- GET /twitch-oauth/authorize ----
        if (path === "/twitch-oauth/authorize" && req.method === "GET") {
            // Optional ?redirect=<dashboard_url> lets the caller choose where
            // Twitch redirects back after authorization. Falls back to
            // DASHBOARD_URL (keeps goal-overlay working unchanged).
            const redirectTarget = url.searchParams.get("redirect") ?? DASHBOARD_URL;
            // state is echoed back by Twitch on callback; carry the redirect
            // target inside it so we can return to the right dashboard.
            const state = `${crypto.randomUUID()}|${encodeURIComponent(redirectTarget)}`;
            const params = new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                redirect_uri: `${BASE_URL}/callback`,
                response_type: "code",
                scope: "channel:read:cheers channel:read:goals",
                state: state,
            });

            return redirect(`${TWITCH_AUTHORIZE}?${params.toString()}`);
        }

        // ---- GET /twitch-oauth/callback?code=...&state=... ----
        if (path === "/twitch-oauth/callback" && req.method === "GET") {
            const code = url.searchParams.get("code");
            const state = url.searchParams.get("state");
            const error = url.searchParams.get("error");

            // Recover the dashboard URL to redirect back to. state has the form
            // "<uuid>|<encoded-redirect-url>"; fall back to DASHBOARD_URL.
            let dashboardUrl = DASHBOARD_URL;
            if (state) {
                const sep = state.indexOf("|");
                if (sep !== -1) {
                    try {
                        dashboardUrl = decodeURIComponent(state.slice(sep + 1));
                    } catch { /* keep fallback */ }
                }
            }
            // Normaliza: quita barras finales para evitar rutas duplicadas
            // (ej. .../dashboard.html/dashboard.html).
            dashboardUrl = dashboardUrl.replace(/\/$/, "");

            const to = (pathname: string, params: Record<string, string> = {}) => {
                const p = new URLSearchParams(params);
                return `${dashboardUrl}/${pathname.replace(/^\/+/, "")}?${p.toString()}`;
            };

            if (error || !code) {
                return redirect(to("dashboard.html", { error: error ?? "missing_code" }));
            }

            // Exchange code for tokens
            const tokenRes = await fetch(TWITCH_TOKEN, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: TWITCH_CLIENT_ID,
                    client_secret: TWITCH_CLIENT_SECRET,
                    code,
                    grant_type: "authorization_code",
                    redirect_uri: `${BASE_URL}/callback`,
                }),
            });

            if (!tokenRes.ok) {
                const text = await tokenRes.text();
                return redirect(to("dashboard.html", { error: "token_exchange_failed" }));
            }

            const tokens = await tokenRes.json();
            const accessToken: string = tokens.access_token;
            const refreshToken: string = tokens.refresh_token;
            const expiresIn: number = tokens.expires_in;

            // Resolve broadcaster id from Twitch
            const usersRes = await fetch(TWITCH_USERS, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Client-Id": TWITCH_CLIENT_ID,
                },
            });

            if (!usersRes.ok) {
                return redirect(to("dashboard.html", { error: "user_lookup_failed" }));
            }

            const users = await usersRes.json();
            const user = users.data?.[0];
            if (!user) {
                return redirect(to("dashboard.html", { error: "user_not_found" }));
            }

            const broadcasterId = user.id;
            const broadcasterLogin = user.login;
            const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

            // Upsert tokens server-side
            const { error: upsertError } = await supabase
                .from("twitch_tokens")
                .upsert(
                    {
                        broadcaster_id: broadcasterId,
                        broadcaster_login: broadcasterLogin,
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        expires_at: expiresAt,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "broadcaster_id" }
                );

            if (upsertError) {
                console.error("upsert error", upsertError);
                return redirect(to("dashboard.html", { error: "token_save_failed" }));
            }

            // Redirect back to dashboard with the broadcaster selected
            return redirect(to("dashboard.html", { connected: broadcasterLogin, broadcaster_id: broadcasterId }));
        }

        // ---- POST /twitch-oauth/revoke ----
        if (path === "/twitch-oauth/revoke" && (req.method === "POST" || req.method === "GET")) {
            const broadcasterId = url.searchParams.get("broadcaster_id");
            if (!broadcasterId) {
                return json({ error: "missing broadcaster_id" }, 400, corsHeaders);
            }

            const { error: revokeError } = await supabase
                .from("twitch_tokens")
                .delete()
                .eq("broadcaster_id", broadcasterId);

            if (revokeError) {
                console.error("revoke error", revokeError);
                return json({ error: "revoke_failed" }, 500, corsHeaders);
            }

            return json({ ok: true }, 200, corsHeaders);
        }

        // ---- GET /twitch-oauth/token?broadcaster_id=... ----
        if (path === "/twitch-oauth/token" && req.method === "GET") {
            const broadcasterId = url.searchParams.get("broadcaster_id");
            if (!broadcasterId) {
                return json({ error: "missing broadcaster_id" }, 400);
            }

            const { data: row, error: fetchError } = await supabase
                .from("twitch_tokens")
                .select("*")
                .eq("broadcaster_id", broadcasterId)
                .single();

            if (fetchError || !row) {
                return json({ error: "no_token" }, 404);
            }

            let accessToken = row.access_token as string;
            let refreshToken = row.refresh_token as string;
            const expiresAt = new Date(row.expires_at as string).getTime();

            // Refresh if expired or expiring within 5 minutes
            if (Date.now() >= expiresAt - 5 * 60 * 1000) {
                const refreshRes = await fetch(TWITCH_TOKEN, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        grant_type: "refresh_token",
                        refresh_token: refreshToken,
                        client_id: TWITCH_CLIENT_ID,
                        client_secret: TWITCH_CLIENT_SECRET,
                    }),
                });

                if (refreshRes.ok) {
                    const refreshed = await refreshRes.json();
                    accessToken = refreshed.access_token;
                    if (refreshed.refresh_token) {
                        refreshToken = refreshed.refresh_token;
                    }
                    const newExpiresAt = new Date(
                        Date.now() + (refreshed.expires_in || 4 * 3600) * 1000
                    ).toISOString();

                    await supabase
                        .from("twitch_tokens")
                        .update({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                            expires_at: newExpiresAt,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("broadcaster_id", broadcasterId);
                } else {
                    // Refresh failed; token may be revoked
                    return json({ error: "token_expired" }, 401);
                }
            }

            return json({ access_token: accessToken }, 200, corsHeaders);
        }

        return json({ error: "not_found" }, 404);
    } catch (err) {
        console.error("edge function error", err);
        return json({ error: "internal_error" }, 500);
    }
});
