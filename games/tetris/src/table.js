import { startMatch, sendToAllHands, endMatch } from '@juxhouse/tardi-core/table'
import {
  newBoard,
  spawn,
  tryMove,
  tryRotate,
  dropDistance,
  lock,
  clearLines,
  addGarbage,
  createBag,
  gravityFor,
  levelFor,
  attackFor,
  collides,
} from './shared/tetris-rules.js'
import { mountTable } from './table-view.js'

// The table owns every well, every falling piece and the clock. A hand is only a
// controller: it sends an intent and never simulates anything.
//
// That split is what makes a real-time game work on this platform. Hand to table
// is the direction with the strong guarantee (every message, in order, no
// duplicates, even across a reconnect), and that is the direction the player's
// button presses travel. Table to hand may drop messages, so the hands are sent
// only a scoreboard, never a board they would have to animate.

var TICK = 50 // ms between simulation steps
var BROADCAST_MS = 250 // floor on how often the hands hear from us
var COUNTDOWN_MS = 3000

var view = mountTable(document.body)

var players = [] // whoever is in the match right now
var wells = {} // playerId -> well state, kept across a brief disconnect
var phase = 'waiting'
var countdownLeft = 0
var victorId = null

var dirty = false
var sinceBroadcast = 0

startMatch({ onMessage: onMessage, onPlayersChange: onPlayersChange })
setInterval(tick, TICK)
render()

function onPlayersChange(info) {
  players = info.players || []

  // A player who arrives mid-match gets a live well and joins the fight.
  for (var i = 0; i < players.length; i++) {
    var id = players[i].playerId
    if (!wells[id]) wells[id] = newWell(phase === 'playing')
  }

  if (phase === 'waiting' && players.length > 0) {
    phase = 'countdown'
    countdownLeft = COUNTDOWN_MS
  }

  if (phase === 'playing') checkForWinner()

  dirty = true
  render()
}

function onMessage(message) {
  var well = wells[message.playerId]
  if (phase !== 'playing' || !well || !well.alive || !well.piece) return

  var action = message.messageFromHand

  if (action === 'left') {
    tryMove(well.board, well.piece, -1, 0)
  } else if (action === 'right') {
    tryMove(well.board, well.piece, 1, 0)
  } else if (action === 'rotate') {
    tryRotate(well.board, well.piece)
  } else if (action === 'soft') {
    if (tryMove(well.board, well.piece, 0, 1)) {
      well.fallMs = 0
    } else {
      settle(message.playerId, well)
    }
  } else if (action === 'drop') {
    well.piece.y += dropDistance(well.board, well.piece)
    settle(message.playerId, well)
  }

  render()
}

function tick() {
  if (phase === 'countdown') {
    var before = Math.ceil(countdownLeft / 1000)
    countdownLeft -= TICK
    if (countdownLeft <= 0) {
      begin()
    } else if (Math.ceil(countdownLeft / 1000) !== before) {
      dirty = true // a new number on the clock is worth telling the hands about
    }
  } else if (phase === 'playing') {
    for (var i = 0; i < players.length; i++) {
      var id = players[i].playerId
      var well = wells[id]
      if (!well || !well.alive) continue

      well.fallMs += TICK
      if (well.fallMs >= gravityFor(well.lines)) {
        well.fallMs = 0
        if (!tryMove(well.board, well.piece, 0, 1)) settle(id, well)
      }
    }
  }

  sinceBroadcast += TICK
  if (dirty && sinceBroadcast >= BROADCAST_MS) flush()

  render()
}

function begin() {
  phase = 'playing'
  countdownLeft = 0

  // Everyone starts from the same clean slate, whatever happened while waiting.
  for (var i = 0; i < players.length; i++) {
    wells[players[i].playerId] = newWell(true)
  }
  flush()
}

// The piece has come to rest: write it in, clear what it completed, hit the
// opponents with the garbage that earned, and hand the player their next piece.
function settle(playerId, well) {
  var landedInside = lock(well.board, well.piece)
  well.piece = null

  var cleared = clearLines(well.board)
  well.lines += cleared

  if (!landedInside) {
    knockOut(well)
  } else {
    var attack = attackFor(cleared)
    if (attack > 0) sendGarbage(playerId, attack)
  }

  if (well.alive) {
    well.piece = spawn(well.next)
    well.next = well.bag()
    well.fallMs = 0
    // No room left for a new piece is the other way to top out.
    if (collidesNow(well)) knockOut(well)
  }

  dirty = true
  checkForWinner()
}

function sendGarbage(fromPlayerId, rows) {
  for (var i = 0; i < players.length; i++) {
    var id = players[i].playerId
    if (id === fromPlayerId) continue

    var target = wells[id]
    if (!target || !target.alive) continue

    if (!addGarbage(target.board, rows)) {
      knockOut(target)
    } else if (target.piece && collidesNow(target)) {
      // The rising stack met the falling piece: lift the piece clear of it.
      var lifted = false
      for (var up = 1; up <= rows; up++) {
        target.piece.y -= 1
        if (!collidesNow(target)) {
          lifted = true
          break
        }
      }
      if (!lifted) knockOut(target)
    }
  }
}

function knockOut(well) {
  well.alive = false
  well.piece = null
}

function checkForWinner() {
  if (phase !== 'playing') return

  var alive = []
  for (var i = 0; i < players.length; i++) {
    var well = wells[players[i].playerId]
    if (well && well.alive) alive.push(players[i])
  }

  var solo = players.length < 2
  if (!solo && alive.length > 1) return
  if (solo && alive.length > 0) return

  phase = 'over'
  victorId = alive.length === 1 ? alive[0].playerId : null
  flush()
  endMatch({ victor: victorId })
}

function collidesNow(well) {
  return collides(well.board, well.piece, well.piece.cells, well.piece.x, well.piece.y)
}

function newWell(active) {
  var bag = createBag()
  return {
    board: newBoard(),
    bag: bag,
    piece: active ? spawn(bag()) : null,
    next: bag(),
    lines: 0,
    alive: true,
    fallMs: 0,
  }
}

// The hands get a scoreboard, never a board. Throttled, because a hand that
// misses one of these is guaranteed the next one anyway.
function flush() {
  dirty = false
  sinceBroadcast = 0

  var summary = []
  for (var i = 0; i < players.length; i++) {
    var player = players[i]
    var well = wells[player.playerId] || newWell(false)
    summary.push({
      playerId: player.playerId,
      nick: player.nick,
      lines: well.lines,
      level: levelFor(well.lines),
      alive: well.alive,
      next: well.alive && well.next ? well.next : '',
    })
  }

  sendToAllHands({
    phase: phase,
    countdown: Math.ceil(countdownLeft / 1000),
    victorId: victorId,
    players: summary,
  })
}

function render() {
  var shown = []
  for (var i = 0; i < players.length; i++) {
    var player = players[i]
    var well = wells[player.playerId]
    if (!well) continue

    shown.push({
      nick: player.nick,
      lines: well.lines,
      level: levelFor(well.lines),
      alive: well.alive,
      next: well.next,
      board: well.board,
      piece: well.piece,
      ghostY: well.piece ? well.piece.y + dropDistance(well.board, well.piece) : null,
    })
  }

  view.update(headline(), subhead(), shown)
}

function headline() {
  if (phase === 'waiting') return 'Waiting for players...'
  if (phase === 'countdown') return 'Starting in ' + Math.ceil(countdownLeft / 1000)
  if (phase === 'over') {
    if (victorId === null) return 'Game over'
    return nickOf(victorId) + ' wins!'
  }
  return 'Tardi Tetris'
}

function subhead() {
  if (phase === 'waiting') return 'Open the game on your phone to join'
  if (phase === 'countdown') return 'Clear 2 or more rows at once to bury everyone else'
  if (phase === 'playing') return 'Last one standing wins'
  return ''
}

function nickOf(playerId) {
  for (var i = 0; i < players.length; i++) {
    if (players[i].playerId === playerId) return players[i].nick || 'Player'
  }
  return 'Player'
}
