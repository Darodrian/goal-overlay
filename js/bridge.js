// Version fija de CDN: la sala usa Supabase Realtime (broadcast, self:false).
// El panel y el overlay se unen a la misma sala (llamada por la clave secreta)
// y el servidor Supabase reenvía los mensajes entre perfiles de navegador distintos,
// por lo que funciona aunque el overlay corra dentro de OBS.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SUPA_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

export function createBridge(room) {
    const handlers = { status: [], hello: [], set: [], addPoints: [], resetPoints: [], keyChanged: [] };
    let channel = null;
    let client = null;
    let subscribed = false;

    async function getClient() {
        if (!client) {
            const mod = await import(SUPA_MODULE);
            client = mod.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        return client;
    }

    function listen(event, fn) {
        channel.on('broadcast', { event }, (msg) => fn((msg && msg.payload) || {}));
    }

    async function connect() {
        const c = await getClient();
        channel = c.channel(room, { config: { broadcast: { self: false } } });
        listen('hello', (p) => handlers.hello.forEach((h) => h(p)));
        listen('set', (p) => handlers.set.forEach((h) => h(p)));
        listen('addPoints', (p) => handlers.addPoints.forEach((h) => h(p)));
        listen('resetPoints', (p) => handlers.resetPoints.forEach((h) => h(p)));
        listen('keyChanged', (p) => handlers.keyChanged.forEach((h) => h(p)));
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(arg);
            };
            const timer = setTimeout(() => finish(reject, new Error('TIMED_OUT')), 15000);
            channel.subscribe((status) => {
                handlers.status.forEach((h) => h(status));
                if (status === 'SUBSCRIBED') { subscribed = true; finish(resolve); }
                else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') { subscribed = false; finish(reject, new Error(status)); }
            });
        });
    }

    function send(event, payload) {
        if (!channel) return;
        channel.send({ type: 'broadcast', event, payload });
    }

    return {
        connect,
        async leave() {
            if (channel && client) await client.removeChannel(channel);
            channel = null;
            subscribed = false;
        },
        isConnected: () => subscribed,
        sendHello(payload) { send('hello', payload); },
        sendSet(payload) { send('set', payload); },
        sendAddPoints(payload) { send('addPoints', payload); },
        sendResetPoints(payload) { send('resetPoints', payload); },
        sendKeyChanged(payload) { send('keyChanged', payload); },
        onStatus(fn) { handlers.status.push(fn); },
        onHello(fn) { handlers.hello.push(fn); },
        onSet(fn) { handlers.set.push(fn); },
        onAddPoints(fn) { handlers.addPoints.push(fn); },
        onResetPoints(fn) { handlers.resetPoints.push(fn); },
        onKeyChanged(fn) { handlers.keyChanged.push(fn); },
    };
}
