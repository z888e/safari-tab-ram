/* global self */
/** Tab-weight estimate helpers. UI must label values as estimates — not Activity Monitor RAM. */

(function (root) {
  const HEAVY_HOST_HINTS = [
    { re: /(youtube|youtu\.be|netflix|twitch|vimeo|disney|hulu|primevideo)/i, mb: 220 },
    { re: /(figma|canva|miro|notion|airtable)/i, mb: 180 },
    { re: /(docs\.google|sheets\.google|slides\.google|drive\.google)/i, mb: 160 },
    { re: /(gmail|outlook\.live|office\.com|teams\.microsoft)/i, mb: 140 },
    { re: /(twitter|x\.com|facebook|instagram|linkedin|reddit)/i, mb: 120 },
    { re: /(maps\.google|openstreetmap)/i, mb: 150 },
    { re: /(github|gitlab|bitbucket)/i, mb: 90 }
  ];

  function hostHintMb(url) {
    try {
      const host = new URL(url).hostname;
      for (let i = 0; i < HEAVY_HOST_HINTS.length; i += 1) {
        if (HEAVY_HOST_HINTS[i].re.test(host)) return HEAVY_HOST_HINTS[i].mb;
      }
    } catch (e) {
      /* ignore */
    }
    return 0;
  }

  function estimateTabWeight(input) {
    const factors = [];
    const discarded = Boolean(input.discarded);
    const metrics = input.metrics || null;

    if (discarded) {
      return { mb: 8, factors: ["discarded"] };
    }

    let mb = 48;
    factors.push("base");

    if (input.audible) {
      mb += 36;
      factors.push("audio");
    }
    if (input.pinned) {
      mb += 12;
      factors.push("pinned");
    }
    if (input.active) {
      mb += 10;
      factors.push("active");
    }

    const hint = hostHintMb(input.url || "");
    if (hint > 0) {
      mb += hint * 0.35;
      factors.push("host");
    }

    if (metrics) {
      const nodes = Number(metrics.nodeCount) || 0;
      const media = Number(metrics.mediaCount) || 0;
      const iframes = Number(metrics.iframeCount) || 0;
      const scripts = Number(metrics.scriptCount) || 0;
      const canvases = Number(metrics.canvasCount) || 0;
      const workers = Number(metrics.workerHint) || 0;
      const docKb = Number(metrics.documentKb) || 0;

      mb += Math.min(120, nodes / 900);
      mb += Math.min(180, media * 14);
      mb += Math.min(80, iframes * 10);
      mb += Math.min(40, scripts * 0.35);
      mb += Math.min(90, canvases * 22);
      mb += Math.min(40, workers * 18);
      mb += Math.min(30, docKb / 180);

      if (nodes > 2000) factors.push("dom");
      if (media > 0) factors.push("media");
      if (iframes > 0) factors.push("iframes");
      if (canvases > 0) factors.push("canvas");
    } else {
      mb += 18;
      factors.push("no-sample");
    }

    const lastAccessed = Number(input.lastAccessed) || 0;
    if (lastAccessed > 0) {
      const idleMin = (Date.now() - lastAccessed) / 60000;
      if (idleMin > 30 && !input.active) {
        mb *= 0.85;
        factors.push("idle");
      }
    }

    return {
      mb: Math.max(6, Math.round(mb)),
      factors: factors
    };
  }

  function formatMb(mb) {
    if (mb >= 1000) return (mb / 1000).toFixed(1) + " GB est.";
    return mb + " MB est.";
  }

  root.estimateTabWeight = estimateTabWeight;
  root.formatMb = formatMb;
})(typeof self !== "undefined" ? self : this);
