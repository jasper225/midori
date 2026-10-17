const API = "http://localhost:4000";

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
  const { token, pending = {} } = await chrome.storage.local.get(["token", "pending"]);
  if (!token) return;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  try {
    // Refresh the tracked-site list
    const sitesRes = await fetch(`${API}/sites`, { headers });
    if (sitesRes.status === 401) return chrome.storage.local.remove(["token", "email"]);
    if (sitesRes.ok) {
      const { sites } = await sitesRes.json();
      await chrome.storage.local.set({ sites: sites.map((s) => s.domain) });
    }

    // Send accumulated usage, one request per date
    for (const [date, byDomain] of Object.entries(pending)) {
      const entries = Object.entries(byDomain).map(([domain, seconds]) => ({
        domain,
        seconds,
        scrollPx: 0, // content script fills this in later
      }));
      if (!entries.length) { delete pending[date]; continue; }

      const res = await fetch(`${API}/usage`, {
        method: "POST",
        headers,
        body: JSON.stringify({ date, entries }),
      });
      if (res.ok) delete pending[date];
    }
    await chrome.storage.local.set({ pending });
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
});