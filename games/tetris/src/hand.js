import { joinMatch, sendToTable } from '@juxhouse/tardi-core/hand'
import { mountHand } from './hand-view.js'
import { lineCount } from './shared/skin.js'

// The hand is a controller and nothing else: it sends the button that was
// pressed and lets the table decide whether that move was legal. It holds no
// board and no piece, so there is no local state to drift out of step with the
// TV, and it can be sent nothing but a scoreboard.

var state = null
var me = null

var update = mountHand(document.body, onPress)

joinMatch({ onStateChange: onStateChange })
render()

function onStateChange(envelope) {
  state = envelope.messageFromTable
  me = state ? find(state.players, envelope.playerId) : null
  render()
}

function onPress(action) {
  if (!playing()) return
  sendToTable(action)
}

function playing() {
  return state !== null && state.phase === 'playing' && me !== null && me.alive
}

function render() {
  update(headline(), subhead(), me ? me.next : '', playing())
}

function headline() {
  if (!state) return 'Waiting for the table...'
  if (state.phase === 'waiting') return 'Waiting for players...'
  if (state.phase === 'countdown') return 'Get ready: ' + state.countdown
  if (state.phase === 'over') {
    if (state.victorId === null) return 'Game over'
    return me && state.victorId === me.playerId ? 'You win!' : winnerNick() + ' wins'
  }
  if (me && !me.alive) return "You're out"
  return me ? lineCount(me.lines) : 'Playing'
}

function subhead() {
  if (!state) return ''
  if (state.phase === 'countdown') return 'Watch the TV, not your phone'
  if (state.phase === 'over') return me ? lineCount(me.lines) + ' cleared' : ''
  if (me && !me.alive) return 'Watch the rest of the round on the TV'
  if (state.phase === 'playing') return 'Level ' + (me ? me.level : 1) + '  ·  next'
  return ''
}

function winnerNick() {
  var winner = find(state.players, state.victorId)
  return winner && winner.nick ? winner.nick : 'Someone'
}

function find(players, playerId) {
  if (!players) return null
  for (var i = 0; i < players.length; i++) {
    if (players[i].playerId === playerId) return players[i]
  }
  return null
}
