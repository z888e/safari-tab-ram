# Tab Pressure

Safari Web Extension that ranks open tabs by an **estimated** memory weight, then lets you close, pin, copy the list, or clear site cookies / page storage from one panel.

These numbers are **not** Activity Monitor RAM. Safari does not expose per-tab process memory or full HTTP cache clearing to extensions. The UI labels estimates and states that limit on cache clear.

## What it does

- Samples DOM size, media, iframes, canvases, and host hints per tab
- Sorts tabs by estimated weight (`MB est.` / `GB est.`)
- Close one tab or a multi-select batch
- Pin / unpin
- Copy a ranked snapshot to the clipboard
- Clear cookies for the tab origin and `localStorage` / `sessionStorage` / Cache Storage when the page can run a content script

## Develop in Safari (macOS)

1. Open `Tab Pressure/Tab Pressure.xcodeproj` in Xcode.
2. Select the **Tab Pressure** macOS scheme, sign with your Team.
3. Run. macOS opens the container app once; enable the extension in **Safari → Settings → Extensions**.
4. Grant the extension access to the sites you want sampled (**Always Allow** on relevant sites, or allow on all websites for full rankings).

### Regenerate the Xcode project

```bash
xcrun safari-web-extension-converter \
  "./Extension" \
  --project-location "." \
  --app-name "Tab Pressure" \
  --bundle-identifier "com.example.tab-pressure" \
  --macos-only \
  --swift \
  --force \
  --no-open \
  --no-prompt
```

Change the bundle identifier before shipping.

## Extension layout

```
Extension/
  manifest.json
  background.js      # tab snapshot, pin/close, cookie clear
  content.js         # page metrics + storage clear
  estimate.js        # weight heuristic
  popup.html|css|js  # ranked panel
  icons/
```

## Honest limits

| Goal | Support |
|------|---------|
| True per-tab RAM | Not available to Safari Web Extensions |
| Full HTTP cache wipe | Not available (`browsingData` missing) |
| Close / pin tabs | Supported |
| Cookie + page storage clear | Best-effort via `cookies` + content script |
