(function () {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const listEl = document.getElementById("list");
  const summaryEl = document.getElementById("summary");
  const statusEl = document.getElementById("status");
  const bulkEl = document.getElementById("bulk");
  const selectedCountEl = document.getElementById("selected-count");
  const template = document.getElementById("row-template");
  const selected = new Set();
  let snapshot = null;
  let maxMb = 1;

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (e) {
      return url || "";
    }
  }

  function send(type, payload) {
    return api.runtime.sendMessage(Object.assign({ type: type }, payload || {}));
  }

  function updateBulk() {
    const count = selected.size;
    bulkEl.hidden = count === 0;
    selectedCountEl.textContent = count + " selected";
  }

  function render() {
    listEl.replaceChildren();
    if (!snapshot) return;

    summaryEl.textContent =
      snapshot.tabs.length + " tabs · " + snapshot.totalLabel + " combined";

    maxMb = Math.max(1, ...snapshot.tabs.map((t) => t.mb));

    snapshot.tabs.forEach((tab, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const checkbox = node.querySelector(".select");
      const title = node.querySelector(".title");
      const host = node.querySelector(".host");
      const weight = node.querySelector(".weight");
      const fill = node.querySelector(".bar-fill");
      const pinBtn = node.querySelector('[data-action="pin"]');

      title.textContent = tab.title;
      host.textContent = hostOf(tab.url) + (tab.hasMetrics ? "" : " · unsampled");
      weight.textContent = tab.label;
      fill.style.height = Math.max(12, Math.round((tab.mb / maxMb) * 100)) + "%";
      node.style.animationDelay = Math.min(index, 12) * 18 + "ms";

      checkbox.checked = selected.has(tab.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selected.add(tab.id);
        else selected.delete(tab.id);
        updateBulk();
      });

      if (tab.pinned) {
        pinBtn.textContent = "Unpin";
        pinBtn.classList.add("is-on");
      }

      node.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          const action = button.getAttribute("data-action");
          await handleAction(action, tab);
        });
      });

      listEl.appendChild(node);
    });

    updateBulk();
  }

  async function handleAction(action, tab) {
    if (action === "activate") {
      await send("activate-tab", { tabId: tab.id });
      return;
    }
    if (action === "close") {
      const result = await send("close-tab", { tabId: tab.id });
      if (result && result.ok) {
        selected.delete(tab.id);
        setStatus("Closed “" + tab.title + "”");
        await refresh();
      } else {
        setStatus((result && result.error) || "Could not close tab");
      }
      return;
    }
    if (action === "pin") {
      const result = await send("toggle-pin", { tabId: tab.id });
      if (result && result.ok) {
        setStatus(result.pinned ? "Pinned" : "Unpinned");
        await refresh();
      } else {
        setStatus((result && result.error) || "Could not update pin");
      }
      return;
    }
    if (action === "clear") {
      setStatus("Clearing site data…");
      const result = await send("clear-site", { tabId: tab.id });
      if (result && result.ok) {
        const r = result.result;
        setStatus(
          "Cleared " +
            (r.cookiesRemoved || 0) +
            " cookies" +
            (r.origin ? " for " + r.origin : "") +
            ". " +
            (r.note || "")
        );
      } else {
        setStatus((result && result.error) || "Clear failed");
      }
    }
  }

  async function refresh() {
    setStatus("");
    const result = await send("get-snapshot");
    if (!result || !result.ok) {
      summaryEl.textContent = "Could not read tabs";
      setStatus((result && result.error) || "Snapshot failed");
      return;
    }
    snapshot = result.snapshot;
    const liveIds = new Set(snapshot.tabs.map((t) => t.id));
    [...selected].forEach((id) => {
      if (!liveIds.has(id)) selected.delete(id);
    });
    render();
  }

  async function copyList() {
    if (!snapshot) return;
    const lines = snapshot.tabs.map(
      (tab, i) => i + 1 + ". " + tab.label + " — " + tab.title + " — " + tab.url
    );
    const text =
      "Tab Pressure snapshot (" +
      new Date(snapshot.generatedAt).toISOString() +
      ")\n" +
      "Combined " +
      snapshot.totalLabel +
      " across " +
      snapshot.tabs.length +
      " tabs\n\n" +
      lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied ranked list");
    } catch (e) {
      setStatus("Clipboard blocked");
    }
  }

  document.getElementById("refresh").addEventListener("click", () => {
    refresh();
  });
  document.getElementById("copy-list").addEventListener("click", () => {
    copyList();
  });
  document.getElementById("close-selected").addEventListener("click", async () => {
    const ids = [...selected];
    const result = await send("close-tabs", { tabIds: ids });
    if (result && result.ok) {
      selected.clear();
      setStatus("Closed " + ids.length + " tabs");
      await refresh();
    } else {
      setStatus((result && result.error) || "Bulk close failed");
    }
  });

  refresh();
})();
