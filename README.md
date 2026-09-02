# Mahjong Solitaire

A small, offline mahjong solitaire game, built to be installed on an Android
phone and played without a network connection.

No frameworks, no build step, no dependencies. Plain HTML, CSS and JavaScript,
about 45 kB of code plus 105 kB of icons. Open `index.html` and it runs.

## What it does

- **Three boards** — Garden (88 tiles, one flat layer), Pyramid (120, fits an
  upright phone) and the classic Turtle (144).
- **Every deal can be won.** Boards are built backwards from a known solution
  rather than filled at random, so you are never handed an impossible one.
- **Shuffle keeps that promise.** Rearranging the remaining tiles uses the same
  dealer, so the board is still winnable afterwards — not merely different.
- Unlimited undo, hints, a timer, and a best time per board.
- Closing the app mid-game and coming back later resumes exactly where you were.
- Tiles you cannot lift are dimmed, so the ones in play stand out. This can be
  switched off.
- Sound effects are generated in the browser; there are no audio files.

## Getting it onto a phone

The game needs to be served over HTTPS once, so the phone can cache it. After
that it never needs the network again.

1. Put these files anywhere that serves static files over HTTPS — GitHub Pages
   and a Netlify drop are both free and take a couple of minutes.
2. Open the address in **Chrome on the phone**.
3. Menu (⋮) → **Add to Home screen**.

Android installs it as a WebAPK: it gets its own launcher icon and its own
window with no browser bar, and works in aeroplane mode.

To try it on this machine first:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

`localhost` counts as a secure origin, so offline caching works there too.

## Changing it

The pieces are deliberately separate:

| File             | Holds                                                     |
|------------------|-----------------------------------------------------------|
| `js/layouts.js`  | Board shapes, as tile coordinates                          |
| `js/tiles.js`    | The 144-tile set and the SVG drawing of each face          |
| `js/engine.js`   | Rules, dealing, shuffling — no DOM, no browser needed      |
| `js/ui.js`       | Screen, input, saved games                                 |
| `sw.js`          | The offline cache                                          |

**After editing any file, bump `CACHE` in `sw.js`** (`mahjong-v1` → `mahjong-v2`).
That is what tells installed copies to pick up the new version; without it they
will happily keep serving the old one.

Adding a board means adding one entry to `LAYOUTS` in `js/layouts.js`. Anything
whose tile count is even will work, and the dealer will guarantee it is solvable.

## Sending it as a single file

```sh
node tools/bundle.mjs        # -> dist/mahjong.html
```

Folds styles, scripts, artwork and the icon into one 66 kB HTML file with no
dependencies, for emailing to someone directly. It plays exactly the same and
still saves progress, but it cannot be installed to a home screen — that needs
a hosted URL. Prefer the hosted route where you can.

## Tests

```sh
node tools/test-engine.mjs   # rules and dealing
node tools/test-ui.cjs       # the interface, driven through its real handlers
```

`test-engine` deals 900 boards and wins each one by replaying its recorded
solution. `test-ui` runs the actual `js/ui.js` against a small stub DOM
(`tools/dom-stub.cjs`) and plays a full game by clicking tiles, so undo,
shuffle, hints, dead ends and saved games are all exercised for real.

`tools/screenshot.html` loads the game in an exactly phone-sized frame, for
taking screenshots.

## Known limitation

You can still play yourself into a corner — that is mahjong, not a bug. If the
last tiles end up stacked in a single column, only the top one is ever free and
no rearrangement can match them. The game detects this, says so plainly, hides
the shuffle button (which cannot help) and offers undo instead, which always
reopens the board.
