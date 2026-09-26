// Live rooms: a WebSocket to the server, with reconnecting if the internet blips.
import { auth } from './api.js';

const FINAL = { 4000: 'You joined from somewhere else.', 4002: 'That server is full.', 4003: 'You were removed from this server.', 4004: 'That project could not be opened.' };

// getTicket: async () => ({ ticket, ... }) asks the server for a fresh ticket every time we (re)connect.
// on: { message(m), open(info), drop(), closed(reason), error(text) }
export function openRoom(getTicket, on) {
  let ws = null, stopped = false, tries = 0, timer = 0;
  const url = (t) => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room?t=' + encodeURIComponent(t);
  async function connect() {
    if (stopped) return;
    let info;
    try { info = await getTicket(); } catch (e) { if (on.error) on.error(e.message); return; }
    if (stopped) return;
    try { ws = new WebSocket(url(info.ticket)); } catch (e) { if (on.error) on.error("Couldn't connect to the server."); return; }
    ws.onopen = () => { tries = 0; if (on.open) on.open(info); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } on.message(m); };
    ws.onclose = (e) => {
      if (stopped) return;
      if (FINAL[e.code]) { stopped = true; if (on.closed) on.closed(FINAL[e.code]); return; }
      if (on.drop) on.drop();
      if (tries++ < 6) timer = setTimeout(connect, Math.min(8000, 800 * 2 ** tries));
      else if (on.closed) on.closed('Lost the connection to the server.');
    };
  }
  connect();
  return {
    send(obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; },
    get ready() { return !!ws && ws.readyState === 1; },
    close() { stopped = true; clearTimeout(timer); if (ws) try { ws.close(1000); } catch (e) { /* already closed */ } },
  };
}
export const loggedIn = () => !!auth.token;
