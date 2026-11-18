/* global estimateTabWeight, formatMb */
if (typeof importScripts === "function") {
  try {
    importScripts("estimate.js");
  } catch (e) {
    /* loaded via manifest scripts array on Safari */
  }
}

const metricsByTab = new Map();

function browserAPI() {
  return typeof browser !== "undefined" ? browser : chrome;
}

const api = browserAPI();

function originFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch (e) {
    return null;
  }
}

async function sampleTab(tabId) {
  try {
    const response = await api.tabs.sendMessage(tabId, { type: "sample-now" });
    if (response && response.metrics) {
      metricsByTab.set(tabId, response.metrics);
    }
  } catch (e) {
    /* no content script (chrome pages, permission, etc.) */
  }
}

async function buildSnapshot() {
  const tabs = await api.tabs.query({});
  const rows = [];

  for (const tab of tabs) {
    if (tab.id == null) continue;
    if (!metricsByTab.has(tab.id)) {
      await sampleTab(tab.id);
    }
    const metrics = metricsByTab.get(tab.id) || null;
    const estimate = estimateTabWeight({
      url: tab.url,
      discarded: tab.discarded,
      audible: tab.audible,
      pinned: tab.pinned,
      active: tab.active,
      lastAccessed: tab.lastAccessed,
      metrics: metrics
    });
    rows.push({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || "Untitled",
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || "",
      pinned: Boolean(tab.pinned),
      audible: Boolean(tab.audible),
      discarded: Boolean(tab.discarded),
      active: Boolean(tab.active),
      mb: estimate.mb,
      factors: estimate.factors,
      label: formatMb(estimate.mb),
      hasMetrics: Boolean(metrics)
    });
  }

  rows.sort((a, b) => b.mb - a.mb || a.title.localeCompare(b.title));
  const totalMb = rows.reduce((sum, row) => sum + row.mb, 0);

  return {
    generatedAt: Date.now(),
    totalMb: totalMb,
    totalLabel: formatMb(totalMb),
    tabs: rows
  };
}

async function clearCookiesForOrigin(origin) {
  if (!origin) return { removed: 0 };
  const cookies = await api.cookies.getAll({ url: origin });
  let removed = 0;
  for (const cookie of cookies) {
    const proto = cookie.secure ? "https:" : "http:";
    const host = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    const cookieUrl = proto + "//" + host + cookie.path;
    try {
      await api.cookies.remove({ url: cookieUrl, name: cookie.name, storeId: cookie.storeId });
      removed += 1;
    } catch (e) {
      /* continue */
    }
  }
  return { removed: removed };
}

async function clearSiteData(tabId) {
  const tab = await api.tabs.get(tabId);
  const origin = originFromUrl(tab.url || "");
  const cookieResult = await clearCookiesForOrigin(origin);
  let storageResult = null;
  try {
    storageResult = await api.tabs.sendMessage(tabId, { type: "clear-origin-storage" });
  } catch (e) {
    storageResult = { error: "page-not-reachable" };
  }
  return {
    origin: origin,
    cookiesRemoved: cookieResult.removed,
    storage: storageResult,
    note: "Safari does not expose full HTTP cache clearing to extensions. Cookies and page storage were cleared where possible."
  };
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "metrics" && sender.tab && sender.tab.id != null) {
    metricsByTab.set(sender.tab.id, message.metrics);
    return false;
  }

  if (message.type === "get-snapshot") {
    buildSnapshot()
      .then((snapshot) => sendResponse({ ok: true, snapshot: snapshot }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "close-tab") {
    api.tabs
      .remove(message.tabId)
      .then(() => {
        metricsByTab.delete(message.tabId);
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "close-tabs") {
    const ids = message.tabIds || [];
    api.tabs
      .remove(ids)
      .then(() => {
        ids.forEach((id) => metricsByTab.delete(id));
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "toggle-pin") {
    api.tabs
      .get(message.tabId)
      .then((tab) => api.tabs.update(message.tabId, { pinned: !tab.pinned }))
      .then((tab) => sendResponse({ ok: true, pinned: tab.pinned }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "activate-tab") {
    api.tabs
      .update(message.tabId, { active: true })
      .then((tab) => api.windows.update(tab.windowId, { focused: true }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "clear-site") {
    clearSiteData(message.tabId)
      .then((result) => sendResponse({ ok: true, result: result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});

api.tabs.onRemoved.addListener((tabId) => {
  metricsByTab.delete(tabId);
});

api.alarms.create("refresh-badge", { periodInMinutes: 1 });
api.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "refresh-badge") return;
  try {
    const snapshot = await buildSnapshot();
    const top = snapshot.tabs[0];
    const text = top ? String(Math.min(999, top.mb)) : "";
    await api.action.setBadgeText({ text: text });
    await api.action.setBadgeBackgroundColor({ color: "#1F4B3A" });
  } catch (e) {
    /* ignore */
  }
});
