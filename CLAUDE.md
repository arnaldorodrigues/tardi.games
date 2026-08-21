# tardi.games

Games for the [tardi.games](https://tardi.games) party platform: a TV shows the
game, phones are the controllers.

This repo is `arnaldorodrigues/tardi.games`. It currently holds one game,
`games/tetris` (Tardi Tetris, 2 to 4 players).

---

## Rules that hold for every game here

**The repo must stay public and must stay named `tardi.games`.** The platform
discovers games by polling public GitHub repos with exactly that name. Renaming
it or making it private delists every game in it.

**Never commit `dist/`.** It is gitignored on purpose. The release action builds
it in CI. The official `SDK.md` still says to commit `hand.js` and `table.js` at
the game root: that is out of date, do not follow it. See
[context/platform-contract.md](context/platform-contract.md).

**One broken game blocks every game's release.** The release action builds every
subfolder of `games/` and exits on the first failure, so nothing gets published,
not even the games that built fine. Before adding or touching a game, know that
its build failing takes the others down with it.
See [context/release-pipeline.md](context/release-pipeline.md).

**Write ES5 in `src/`.** The build transpiles, but `@juxhouse/tardi-core` is
hand-written ES5 and the target is a 2018 Tizen TV browser (Chromium 38 to 56).
Match the existing code: `var`, `function`, no arrow functions, no `const`/`let`,
no template literals, no classes, no spread.

**No modern CSS.** No CSS grid, no flex `gap`, no `aspect-ratio`. Flexbox,
margins and viewport units only. Anything that has to hold a ratio gets sized in
pixels from JS.

**Style:** single quotes, no semicolons, 90 columns. `games/tetris/.prettierrc`
pins this so the workspace formatter reinforces it instead of fighting it.

---

## The one design constraint that shapes everything

The platform's delivery guarantees are asymmetric:

- **Hand to Table:** every message arrives, in order, no duplicates, even across
  a reconnect.
- **Table to Hand:** messages may be **dropped**. Only the most recent one is
  guaranteed.

So: **the Table owns all state and the Hand owns none.** The Hand sends the
button that was pressed and renders only what it is told. Never give a Hand a
board to animate or any state it has to keep in step with the TV. This is what
makes a real-time game work here at all despite the GDK advising turn-based or
light-action games only.

---

## Commands

Run these from inside a game folder, for example `games/tetris`:

```
npm install          # first time
npm run dev          # dev harness at http://localhost:3142/dev/ (port is hardcoded)
npm run build        # writes dist/ (bundles + game.json + assets)
npm test             # 33 headless rules tests
npm run test:mutate  # breaks the rules on purpose, proves the suite notices
```

Releasing is just `git push` to `main`. A GitHub Action builds every game, zips
each `dist/`, and cuts a release. The platform picks it up within a few minutes.

---

## Before saying a change works

`npm test` passing is necessary and not sufficient: it only covers the pure rules
module. Anything touching rendering, input, layout or the platform protocol has
to be driven in a real browser. The recipe, including the standalone test pages
that let you size the table and hand freely, is in
[context/testing.md](context/testing.md).

**Known unverified gap:** clearing 2 or more rows is supposed to send garbage
rows to every opponent. The mechanics are unit-tested and the wiring is four
lines in `settle()`, but **a line clear triggering garbage has never been
observed in a running browser**. If garbage is broken, that is where it hides.
Details and what was tried are in [context/testing.md](context/testing.md).

---

## Deeper context, read when relevant

| File | Read it when |
|------|--------------|
| [context/platform-contract.md](context/platform-contract.md) | Working with the SDK, the postMessage protocol, `game.json`, platform limits, or hitting something the official docs get wrong |
| [context/release-pipeline.md](context/release-pipeline.md) | A release failed, nothing appeared on tardi.games, or adding a second game |
| [context/tetris-design.md](context/tetris-design.md) | Changing anything in `games/tetris`: file map, why each decision was made, the layout and rendering approach |
| [context/testing.md](context/testing.md) | Verifying any change: the test suite, mutation testing, driving the real UI, and the browser traps that will waste an hour |
