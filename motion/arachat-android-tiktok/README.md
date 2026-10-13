# AraChat Android TikTok launch video

30-second vertical launch animation for AraChat Android, built as a deterministic HTML scene.

## Open locally

Open `index.html` in a browser. It autoplays as a 30-second loop.

## Frame-exact rendering

Open `index.html?render` and invoke `window.seek(seconds)` from a renderer. The animation does not start its own clock in render mode.

Examples:

- `window.seek(1.5)` — launch hook.
- `window.seek(5)` — chat-list screen.
- `window.seek(9)` — animated household conversation.
- `window.seek(13)` — search and calls.
- `window.seek(17)` — feature cards.
- `window.seek(21)` — settings.
- `window.seek(24.5)` — Ara parrot brand beat.
- `window.seek(28)` — final CTA.

## Notes

- Size: 1080 x 1920 at 30 fps.
- CTA: "Узнать о запуске Android" with `aramsg.ru/downloads`.
- The file uses the existing local AraChat parrot artwork at `apps/android/src/assets/arachat-parrot-icon.png`.
- The Android UI is reconstructed from the supplied UI references and source components, with personal data removed. If the supplied source screenshots are later saved as files, they can replace the matching reconstructed panels without changing timing or copy.
