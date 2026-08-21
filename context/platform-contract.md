# The Tardi platform contract

What the platform actually gives a game, and where the official docs are wrong.

Official sources, both worth re-reading when they change:

- <https://github.com/juxhouse/tardi.games-gdk> (README and SDK.md)
- The GDK repo is cloned locally at `../tardi.games-gdk`

---

## Where the official docs are stale

Believe this file over `SDK.md` on these points. Each was confirmed against the
shipped packages and a real release.

**1. Build output goes to `dist/`, and is not committed.**
`SDK.md` says `npm run build` generates `hand.js` and `table.js` at the game root
and tells you to commit them. That was true of `@juxhouse/tardi-build` 0.1.3. As
of 0.1.6 the build writes the whole publishable game to `dist/`:

```
dist/
  hand.js
  table.js
  game.json      copied from the game root
  assets/        copied from the game root
```

The release action *requires* `dist/` and fails the game without it. `dist` is in
`.gitignore`; CI builds it. This exact mismatch broke the first release here.

**2. The template link in the GDK README points at a private repo.**
`juxhouse/tardi.games` is a private template. The "create from this template"
link 404s until someone at juxhouse invites you. The invite for this account was
accepted 2026-08-20.

**3. The dev harness ships inside `@juxhouse/tardi-build`.**
`SDK.md` does not mention it. A game needs no `dev/` folder of its own. The
harness lives at `node_modules/@juxhouse/tardi-build/harness/index.html` and is
served at `/dev/`. Drop your own `dev/index.html` in the game root to override
it.

---

## The two halves of a game

| | Table | Hand |
|---|---|---|
| Runs on | the TV, one per match | a phone, one per player |
| Entry point | `src/table.js` | `src/hand.js` |
| Interactive | no, view only | yes, this is the controller |
| Orientation | landscape | portrait or landscape |

Both run in iframes at sizes you do not control, so both must be fully
responsive. The Table's iframe in the dev harness is fixed at roughly 443x387,
which is nothing like a real TV: size-sweep separately (see
[testing.md](testing.md)).

## Consistency guarantees

Straight from `SDK.md`, and they drive the whole architecture:

- The Table receives **all** messages a Hand sends after the game starts, in
  order, without duplicates, even across a temporary disconnect.
- A Hand **may miss** messages from the Table, but is guaranteed the **most
  recent** one.
- A Hand only receives Table output produced after the Table consumed every
  message that Hand had sent (read-your-writes).

Consequence: put every real-time element on the Table and treat the Hand as a
dumb controller. A Hand that renders a board will stutter and lie.

---

## API

Six functions, that is the entire surface. No globals are injected; import them.

```js
// src/table.js
import { startMatch, sendToAllHands, endMatch } from '@juxhouse/tardi-core/table'

startMatch({
  onMessage: function (event) {
    // event.playerId       who pressed something
    // event.messageFromHand  whatever that hand sent, any JS value
  },
  onPlayersChange: function (event) {
    // event.players: [{ playerId, nick }, ...]   never null
  },
})

sendToAllHands(state)          // same payload to every hand
endMatch({ victor: playerId }) // null victor means a draw
```

```js
// src/hand.js
import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'

joinMatch({
  onStateChange: function (envelope) {
    // envelope.playerId          this hand's player
    // envelope.players           [{ playerId, nick }, ...]
    // envelope.messageFromTable  last thing the table broadcast, may be null
  },
})

sendToTable(action)
```

Rules the runtime enforces by throwing rather than failing quietly:

- `startMatch` and `joinMatch` may each be called **once**, and each **requires**
  its handler.
- A Hand's messages are **ignored** until it has received the first Table state.
  The Hand must treat the match as not started until then.

`playerId` is a number and `nick` is a human name such as "Cosmic Koala". Render
the nick, never the id.

---

## postMessage protocol

You never touch this when writing a game, but you need it to build standalone
test pages that stand in for the platform. Taken from the shipped harness.

| Direction | Intent | Payload |
|---|---|---|
| platform to table | `tardi.platform.notifyPlayersChange` | `players` |
| platform to table | `tardi.platform.sendToTable` | `playerId`, `payload` |
| table to platform | `tardi.table.sendMessageToHand` | forwarded to a hand as `tardi.table.sendGameStateToHand` |
| table to platform | `tardi.table.gameOver` | the `endMatch` result |
| platform to hand | `tardi.table.sendGameStateToHand` | `matchVersion`, `playerId`, `players`, `messageFromTable` |
| hand to platform | `tardi.hand.sendMessageToTable` | `message` |
| hand to platform | `tardi.hand.ackTableState` | `matchVersion` |

The core listens on `window` for `message` events and does not check the sender,
so a test page can post to itself. Two traps when doing that, both hit here:

- Post the first `notifyPlayersChange` on **`window` `load`**, not a short
  `setTimeout`. A parser-blocking `<script src>` can execute after a 50ms timer
  fires, so the listener may not be registered yet.
- Put the game's `<script>` inside `<body>`. The game calls
  `mount(document.body)` at execution time, and in a bare page with only head
  content `document.body` is still null.

---

## game.json

```json
{
  "title": "Tardi Tetris",
  "description": "One line, shown in the game picker.",
  "players": { "min": 2, "max": 4 }
}
```

`players.min` is not only a platform gate: the dev harness opens exactly that
many hands. Setting `min: 2` is what gives you two controllers to test with.

## Assets and limits

- `assets/thumbnail.png` must be 512x512.
- 100 files maximum per game, 25MB per file. Base64-inline large media if you
  approach the file count.
- No image tooling on this machine (no ImageMagick, no rsvg). The thumbnail here
  was generated by a throwaway Node script writing raw RGB through `zlib` into a
  hand-rolled PNG. `sips` can read dimensions to verify.

## Versions in use

| Package | Version | Note |
|---|---|---|
| `@juxhouse/tardi-core` | 0.1.2 | runtime, hand-written ES5 |
| `@juxhouse/tardi-build` | 0.1.6 | webpack + babel, dev harness, `dist/` output |

Both are pinned as `*` in `package.json`, so the **lockfile is the real pin**.
A stale lockfile is what broke the first release here.
