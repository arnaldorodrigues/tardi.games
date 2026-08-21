# Releasing and deploying

Push to `main` and the game is live on tardi.games a few minutes later. What
happens in between, and the ways it silently does not.

---

## The chain

1. Push to `main`.
2. `.github/workflows/release.yml` runs `juxhouse/tardi.games-release@main`.
3. The action, on Node 24, for **every** subfolder of `games/` that has a
   `package.json`: `npm ci` (or `npm install` with a warning if there is no
   lockfile), then `npm run build`.
4. Every game must have produced `dist/`, or the action errors and exits.
5. Each game's `dist/` **contents** are zipped flat into `{game-name}.zip`.
6. A release is cut, tagged `release{YY-MM-DD_HH-mm-ss}` in UTC, with every zip
   attached.
7. The Tardi platform polls public GitHub repos named `tardi.games` every couple
   of minutes and deploys the newest release.

Players find a game by searching the GitHub account name or the game name.

---

## The trap that costs a release

**The build loop and the packaging loop both cover every game, and the packaging
loop exits 1 on the first game missing `dist/`. The publish step is skipped
entirely.** So one broken game means *no release at all*, including for games
that built perfectly.

This happened on the first push here. The template's `tic-tac-toe` had
`@juxhouse/tardi-build` 0.1.3 pinned in its committed lockfile. 0.1.3 writes
`hand.js` and `table.js` to the game root, not `dist/`. The action reported:

```
tic-tac-toe built no dist/ folder. Update @juxhouse/tardi-build.
```

and cut nothing, even though `tetris` had already built and zipped. Fixed by
bumping that lockfile to 0.1.6 (`af0dc2c`). `tic-tac-toe` was later removed
(`b768f37`), which is also why only `tetris.zip` ships now.

If you add a second game, it inherits this coupling. A half-finished game sitting
in `games/` will take the working one offline.

---

## Verifying a release actually happened

Do not trust a green-looking command. Two specific failures seen here:

- **`gh run watch --exit-status` returned exit code 0 for a run that failed.**
  Read the run's own status, not the watcher's exit code.
- A tail of the workflow log shows `✓ Complete job` even on a failed run,
  because the job cleanup steps succeed.

The reliable check:

```bash
gh run list --limit 3 --json status,conclusion,headSha \
  --jq '.[] | "\(.status) \(.conclusion) \(.headSha[0:7])"'

gh release view --json tagName,assets \
  --jq '"tag: \(.tagName)", (.assets[] | "  \(.name)  \(.size) bytes")'
```

Then prove the artifact is the code you wrote, not a stale build:

```bash
gh release download --repo arnaldorodrigues/tardi.games --pattern 'tetris.zip'
unzip -o -q tetris.zip -d tetris
grep -c 'someStringYouJustAdded' tetris/table.js   # must be >= 1
```

A zip should contain exactly `hand.js`, `table.js`, `game.json`, `assets/`.

---

## History of this repo

| Commit | What |
|---|---|
| `e9d4c91` | Tetris added. Release **failed** because of tic-tac-toe. |
| `af0dc2c` | Bumped tic-tac-toe to tardi-build 0.1.6. Release succeeded with both zips. |
| `b768f37` | Removed tic-tac-toe. Release now ships `tetris.zip` only. |

Recovering tic-tac-toe if it is ever wanted: it is in git history before
`b768f37`, and in the `juxhouse/tardi.games` template.

---

## Local build, exactly as CI does it

CI uses `npm ci`, which installs strictly from the lockfile. `npm install` can
quietly resolve differently, so reproduce failures with `ci`:

```bash
cd games/tetris
rm -rf dist node_modules
npm ci
npm run build
ls dist          # assets  game.json  hand.js  table.js
```

Confirm the bundle really is ES5 before shipping. Matches inside core-js
*comments* are expected and fine:

```bash
grep -c '=>' dist/table.js        # 0
grep -c 'class ' dist/table.js    # 0
grep -n 'let '  dist/table.js     # only comment lines
```
