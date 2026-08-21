# Testing and verification

What is proven, how to prove more, and the browser traps that will otherwise eat
an hour each.

---

## The headless suite

```bash
cd games/tetris
npm test             # 33 tests against src/shared/tetris-rules.js
npm run test:mutate  # 11 deliberate bugs, all must be caught
```

The rules module is pure, so it needs no DOM and no platform. `test/rules.test.mjs`
loads the source as a `data:` URL rather than importing it, for two reasons:
`tetris-rules.js` is ESM inside a package with no `"type": "module"`, so a plain
import fails; and loading from a string is what lets the mutation runner swap in
a broken copy without touching the file on disk.

### Mutation testing is the point

A green suite proves nothing until it has been seen go red. `npm run test:mutate`
applies each bug in `MUTATIONS` and fails if the suite still passes. **A survivor
is a hole in the suite, and the fix is a new assertion, not a shrug.**

This has already caught two real holes:

1. **Removing the right-wall check survived.** Out-of-range columns made
   `board[y][x]` read `undefined`, which counts as occupied, so the wall appeared
   to hold anyway. It only breaks *above the ceiling*, where that lookup is
   skipped. Nothing covered that until the mutation survived.
2. **Removing wall kicks survived.** The original kick test rotated an I piece
   against a wall, but an I piece rotates entirely inside its own on-board box
   and never needs a kick. The replacement uses a vertical T pushed left until
   its empty box column hangs off the board, which genuinely requires one.

Both are the same lesson: a test can exercise the right function and still assert
nothing about the branch you care about.

Add a mutation whenever you add a rule. If the target string no longer exists the
runner counts it as a survivor rather than skipping quietly.

---

## What the suite does not cover

Everything with a screen or a socket: rendering, layout, input, the platform
protocol, and the multiplayer interaction. Those need a real browser.

### Verified in a browser (2026-08-20, against the built bundle)

- 12 rapid presses on the hand's real button drive the piece flush to each wall
  with its width preserved, which also exercises the ordering guarantee.
- Rotation kicks off the wall.
- DROP slams the piece to the floor in one press.
- Player 1's presses leave player 2's well untouched.
- A full match runs to `endMatch`; the harness's own banner confirms the winner
  reached the platform, the loser's well dims and reads OUT, and both hands
  disable their buttons.
- Table layout is clean from 1492x254 up to 1642x834 with four wells: no overlap,
  no page scroll, no container overflow.
- Hand is clean at 375x667, 393x852, 360x640 and 740x360, smallest tap target
  111px.
- Zero game-originated console errors. All console noise is webpack-dev-server's
  HMR socket (`Invalid Host/Origin header`) and does not exist in a build.

### NOT verified: garbage

**Clearing two or more rows is supposed to send garbage to every opponent. That
has never been observed happening in a running browser.**

What *is* proven, at unit level: the attack table `[0, 0, 1, 2, 4]`; that garbage
rows rise from the bottom; that one batch shares a single hole column; that
existing stack is pushed up rather than overwritten; and that garbage through the
ceiling is a top out. The wiring in `settle()` is four lines. So the risk is low
but real.

Three attempts failed, none because the game misbehaved:

1. A random-placement bot never completed a row in 47 pieces.
2. A "drop into the deepest column" heuristic was pathological and funnelled
   every piece into column 0.
3. A "drop into the shallowest column" bot ran 120 pieces against a match that
   had **already ended**, so every button was disabled and nothing registered.

**To close this:** the cheapest honest check is to play a real round with a
second phone and clear two rows at once. Watch the opponent's well rise, with one
hole column, in slate grey (`rgb(100, 116, 139)`). A better automated route is a
bot that reads the ghost piece to price each landing column properly, or seeding
`Math.random` so the piece order is deterministic and a clearing sequence can be
scripted.

---

## Driving the real UI

The dev harness at `http://localhost:3142/dev/` puts the table and two hands in
one page as same-origin `srcdoc` iframes, so a script in the parent can reach
into all three with `frame.contentDocument`.

Reading the table's well back out of the DOM:

```js
const frameOf = (label) => Array.from(document.querySelectorAll('.col'))
  .find(c => c.textContent.trim().startsWith(label)).querySelector('iframe')
const tableDoc = frameOf('Table (TV)').contentDocument

const EMPTY = 'rgb(15, 23, 42)'
const grid = (n) => {
  const cells = Array.from(tableDoc.querySelectorAll('.tt-grid')[n].querySelectorAll('.tt-cell'))
  return Array.from({ length: 20 }, (_, y) =>
    cells.slice(y * 10, y * 10 + 10)
      .map(c => c.style.backgroundColor === EMPTY ? '.' : '#').join(''))
}
```

Three cell classes are distinguishable by colour: empty is `rgb(15, 23, 42)`, a
real block is one of the eight piece/garbage colours, and anything else is the
landing shadow. Garbage is `rgb(100, 116, 139)`.

Press a real button the way a player does, through the element's own handlers:

```js
const press = (doc, label, n) => {
  const b = doc.querySelector('[aria-label="' + label + '"]')
  for (let i = 0; i < n; i++) {
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }
}
```

### Standalone pages for sizes the harness will not give you

The harness pins the table iframe at about 443x387 and ignores attempts to resize
it, so TV-sized layout cannot be checked there. Build a page that stands in for
the platform, serve it next to a `dist/` build, and you control the viewport
completely. The intents are listed in
[platform-contract.md](platform-contract.md); the two traps are posting on
`window` `load` and putting the game script inside `<body>`.

Useful shapes, all used on 2026-08-20:

- a page that feeds the table four named players and fills the window
- the same for one hand
- a page of phone-sized iframes (375x667, 393x852, 360x640, 740x360) all loading
  the hand page, to check every size in one screenshot

Serve a build rather than the dev server when you can: it is closer to what
ships. `python3 -m http.server` over a directory holding `dev/index.html` (copied
from `node_modules/@juxhouse/tardi-build/harness/`), `game.json`, and `dist/` is
enough.

### Geometry assertions worth keeping

```js
// no page scrollbars
d.scrollWidth <= d.clientWidth && d.scrollHeight <= d.clientHeight
// nothing overflowing its container, ignoring intentional scrollers
el.scrollWidth <= el.clientWidth + 1
// the status must not be overlapped by the wells
statusRect.bottom <= topmostWellRect.top + 1
// every control on screen, unoccluded, and thumb-sized
doc.elementFromPoint(cx, cy) === btn && rect.width >= 44 && rect.height >= 44
```

Scope overflow checks to `.tt-wrap *`. The Chrome extension injects a
`browser-mcp-container` element into `body` that reports overflow and is not part
of the game.

---

## Browser traps that already cost time

**Verify what is actually being served.** Port 3142 was already occupied by a
different game's dev server, and `/game.json` was quietly serving *tic-tac-toe*.
Browsing straight to it would have verified the wrong game. Check `game.json` and
grep the served bundle for a string you just wrote before trusting anything.

**A hidden tab throttles timers to tens of seconds.** `document.hidden` being
true makes `setTimeout(30)` take 23 seconds, which stalls the game's own 50ms
tick and makes every wait look like a hang. Either bring the tab to the front, or
yield with a `MessageChannel` post, which is an ordinary task and is not
throttled:

```js
const ch = new MessageChannel(), waiting = []
ch.port1.onmessage = () => { const r = waiting.shift(); if (r) r() }
const yieldTask = () => new Promise(r => { waiting.push(r); ch.port2.postMessage(0) })
```

**Reuse that one channel.** Creating a `MessageChannel` per yield leaks two ports
each time and wedges the renderer after a few thousand.

**A CDP timeout does not cancel the page's loop.** When an injected script times
out, it keeps running in the page. An aborted 120-iteration loop kept hammering
buttons and jammed the tab. Reload, or close the tab and open a new one, before
retrying.

**Check the match is still live before driving it.** A long automated run can end
the match; after that every button is disabled and presses silently do nothing,
which looks exactly like a broken input path. Read a hand's `.tt-btn` `disabled`
state and the table headline first.

**Do not race gravity.** Comparing a piece's position before and after a single
press is flaky, because it may lock and be replaced in between. Assert something
gravity cannot affect: gravity changes rows, never columns, so "press left 12
times, the piece is now flush against the left wall" is stable. Firing the
presses in one synchronous burst removes the race entirely.
