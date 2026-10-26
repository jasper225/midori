const server = "http://localhost:4000";

// Run storage-touching work one job at a time so events can't race each other.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn).catch(console.error));

const pad = (n) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Which tracked domain (if any) is the user actively looking at right now?
async function resolveCurrent() {
  const { sites = [] } = await chrome.storage.local.get("sites");
  if (!sites.length) return null;

  if ((await chrome.idle.queryState(60)) !== "active") return null;

  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return null;

  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab?.url || !/^https?:/.test(tab.url)) return null;

  const host = new URL(tab.url).hostname.replace(/^www\./, "");
  const domain = sites.find((d) => host === d || host.endsWith("." + d));
  return domain ? { domain, date: localDate(), since: Date.now() } : null;
}

// Bank the time spent on the previous domain, then start tracking the new one.
async function refreshNow() {
  const next = await resolveCurrent();
  const { current, pending = {} } = await chrome.storage.local.get(["current", "pending"]);

  if (current) {
    const secs = Math.round((Date.now() - current.since) / 1000);
    if (secs > 0 && secs < 3600) {
      pending[current.date] ??= {};
      pending[current.date][current.domain] =
        (pending[current.date][current.domain] ?? 0) + secs;
    }
  }
  await chrome.storage.local.set({ pending, current: next });
}

async function syncNow() {
  const { token, pending = {}, pendingScroll = {} } = await chrome.storage.local.get(["token", "pending", "pendingScroll"]);
  if (!token) return;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  try {
    // Refresh the tracked-site list
    const sitesRes = await fetch(`${server}/sites`, { headers });
    if (sitesRes.status === 401) return chrome.storage.local.remove(["token", "email"]);
    if (sitesRes.ok) {
      const { sites } = await sitesRes.json();
      await chrome.storage.local.set({ sites: sites.map((s) => s.domain) });
    }

    // Send accumulated usage, one request per date
    const dates = new Set([...Object.keys(pending), ...Object.keys(pendingScroll)]);
    
    for (const date of dates) {
      const secs = pending[date] ?? {};
      const px = pendingScroll[date] ?? {};
      const domains = new Set([...Object.keys(secs), ...Object.keys(px)]);
      
      const entries = [...domains].map((domain) => ({
        domain,
        seconds: secs[domain] ?? 0,
        scrollPx: px[domain] ?? 0,
      }));
      if (!entries.length) { 
        delete pending[date];
        delete pendingScroll[date]; 
        continue; 
      }
      const res = await fetch(`${server}/usage`, {
        method: "POST",
        headers,
        body: JSON.stringify({ date, entries }),
      });
      if (res.ok) { 
        delete pending[date];
        delete pendingScroll[date];
      }
    }
    await chrome.storage.local.set({ pending, pendingScroll });
  } catch (err) {
    console.warn("Sync failed, will retry:", err.message); // offline: keep pending
  }
}

const refresh = () => serial(refreshNow);
const fullSync = () => serial(async () => { await refreshNow(); await syncNow(); });

// Events that change what the user is looking at
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === "complete") refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(refresh);

// Periodic sync (service workers get killed, so alarms are the reliable timer)
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("sync", { periodInMinutes: 1 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("sync", { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener((a) => a.name === "sync" && fullSync());

// Popup asks for an immediate sync after login
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "sync") fullSync();

  if (msg.type === "scroll") {
    serial(async () => {
      const { sites = [], pendingScroll = {} } =
        await chrome.storage.local.get(["sites", "pendingScroll"]);

      const host = msg.host.replace(/^www\./, "");
      const domain = sites.find((d) => host === d || host.endsWith("." + d));
      if (!domain) return; // not a tracked site, discard

      const date = localDate();
      pendingScroll[date] ??= {};
      pendingScroll[date][domain] = (pendingScroll[date][domain] ?? 0) + msg.px;
      await chrome.storage.local.set({ pendingScroll });
    });
  }
});