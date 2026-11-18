(function () {
  const REPORT_ALARM_MS = 12000;

  function collectMetrics() {
    const media = document.querySelectorAll("video, audio, source").length;
    const iframes = document.querySelectorAll("iframe").length;
    const scripts = document.scripts ? document.scripts.length : 0;
    const canvases = document.querySelectorAll("canvas").length;
    const nodeCount = document.getElementsByTagName("*").length;
    let documentKb = 0;
    try {
      documentKb = Math.round((document.documentElement.outerHTML || "").length / 1024);
    } catch (e) {
      documentKb = 0;
    }

    let workerHint = 0;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) workerHint += 1;
    } catch (e) {
      /* ignore */
    }

    return {
      nodeCount: nodeCount,
      mediaCount: media,
      iframeCount: iframes,
      scriptCount: scripts,
      canvasCount: canvases,
      workerHint: workerHint,
      documentKb: documentKb,
      sampledAt: Date.now()
    };
  }

  function report() {
    const metrics = collectMetrics();
    try {
      browser.runtime.sendMessage({ type: "metrics", metrics: metrics });
    } catch (e) {
      /* extension context gone */
    }
  }

  report();
  setInterval(report, REPORT_ALARM_MS);

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "sample-now") {
      sendResponse({ metrics: collectMetrics() });
      return true;
    }
    if (message && message.type === "clear-origin-storage") {
      const result = { localStorage: false, sessionStorage: false, caches: false };
      try {
        localStorage.clear();
        result.localStorage = true;
      } catch (e) {
        /* ignore */
      }
      try {
        sessionStorage.clear();
        result.sessionStorage = true;
      } catch (e) {
        /* ignore */
      }
      if (window.caches && caches.keys) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .then(() => {
            result.caches = true;
            sendResponse(result);
          })
          .catch(() => sendResponse(result));
        return true;
      }
      sendResponse(result);
      return true;
    }
    return false;
  });
})();
