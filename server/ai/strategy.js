import { RANK_VALUE } from '../game/constants.js';
import { pickHighest, pickLowest, pickMiddleCard, getEffectiveValue } from './helpers.js';
import { countGuaranteedWinners, isMasterCard } from './memory.js';

// --- DISPOSITION SYSTEM ---
// Returns a value: positive = SET mode (try to take tricks from opponents)
//                  negative = DUCK mode (avoid taking extra tricks / books)
//                  0 = neutral

export function calculateDisposition(hand, ctx) {
  const totalBids = ctx.teamBid + ctx.oppBid;
  const freeTricks = 13 - totalBids; // "free" tricks nobody bid on

  // Base disposition from free tricks
  // <=2 free: lean SET, >=4 free: lean DUCK, 3: neutral
  let disposition = 0;
  if (freeTricks <= 1) disposition = 2;
  else if (freeTricks === 2) disposition = 1;
  else if (freeTricks === 3) disposition = 0;
  else if (freeTricks === 4) disposition = -1;
  else disposition = -2; // 5+ free = heavy duck

  // If opponents already made their bid, can't set them — duck to avoid books
  if (ctx.oppTricks >= ctx.oppBid) {
    disposition = Math.min(disposition, -1);
  }

  // Look at current overtrick trajectory
  const teamBooks = Math.max(0, ctx.teamTricks - ctx.teamBid);
  if (teamBooks >= 2) {
    // Already have books - might as well play aggressively
    disposition += 1;
  } else if (teamBooks >= 1 && ctx.oppTricks < ctx.oppBid) {
    disposition += 0.5;
  }

  // Project guaranteed future winners (books we know are coming)
  const guaranteedFutureWins = countGuaranteedWinners(hand, ctx.memory);
  const projectedBooks = teamBooks + guaranteedFutureWins;
  if (ctx.teamTricks >= ctx.teamBid && projectedBooks >= 2) {
    disposition += 1;
  }

  // Partner signals (inferred from trick counts AND card choices)
  if (ctx.partnerBid > 0) {
    const partnerExcess = ctx.partnerTricks - ctx.partnerBid;
    if (partnerExcess >= 2) {
      disposition += 1;
    } else if (partnerExcess < 0 && ctx.teamTricks >= ctx.teamBid) {
      disposition -= 0.5;
    }

    disposition += readPartnerSignals(ctx);
  }

  return disposition;
}

// Guess whether opponents are in SET mode or DUCK mode (avoiding books)
export function estimateOpponentDisposition(currentTrick, ctx) {
  const totalBids = ctx.teamBid + ctx.oppBid;
  const freeTricks = 13 - totalBids;

  let oppDisp = 0;
  if (freeTricks <= 1) oppDisp = 2;
  else if (freeTricks === 2) oppDisp = 1;
  else if (freeTricks === 3) oppDisp = 0;
  else if (freeTricks === 4) oppDisp = -1;
  else oppDisp = -2;

  if (ctx.teamTricks >= ctx.teamBid) {
    oppDisp = Math.min(oppDisp, -1);
  }

  const oppBooks = Math.max(0, ctx.oppTricks - ctx.oppBid);
  if (oppBooks >= 2) {
    oppDisp += 1.5;
  } else if (oppBooks >= 1 && ctx.teamTricks < ctx.teamBid) {
    oppDisp += 0.5;
  }

  const totalTricksPlayed = ctx.teamTricks + ctx.oppTricks;
  const tricksLeft = 13 - totalTricksPlayed;
  if (ctx.oppTricks >= ctx.oppBid && tricksLeft >= 4) {
    oppDisp += 1;
  }

  // Read opponent plays in the current trick
  for (const play of currentTrick) {
    const isOpp = play.playerId === ctx.opp1Id || play.playerId === ctx.opp2Id;
    if (!isOpp) continue;

    if (currentTrick.length > 0 && currentTrick[0].card.suit !== 'S' && play.card.suit === 'S') {
      oppDisp += 1.5;
      const ledCard = currentTrick[0].card;
      const leaderIsUs = currentTrick[0].playerId === ctx.partnerId ||
        currentTrick[0].playerId === ctx.players[ctx.botIndex]?.id;
      if (leaderIsUs && RANK_VALUE[ledCard.rank] >= 13) {
        oppDisp += 1;
      }
    }

    if (currentTrick.length > 0) {
      const ledSuit = currentTrick[0].card.suit;
      if (play.card.suit !== ledSuit && play.card.suit !== 'S' && ledSuit !== 'S') {
        oppDisp -= 1;
      }
    }
  }

  return oppDisp;
}

// Read partner's card choices to infer their set/duck intent
function readPartnerSignals(ctx) {
  const memory = ctx.memory;
  if (!memory || memory.cardsPlayedCount === 0) return 0;

  const completedTricks = [];
  const rawPlayed = ctx.rawCardsPlayed || [];
  for (let i = 0; i < rawPlayed.length; i += 4) {
    if (i + 3 < rawPlayed.length) {
      completedTricks.push(rawPlayed.slice(i, i + 4));
    }
  }

  let signal = 0;
  let signalCount = 0;

  for (const trick of completedTricks) {
    const ledSuit = trick[0].card.suit;
    const partnerPlay = trick.find(t => t.playerId === ctx.partnerId);
    if (!partnerPlay) continue;

    const partnerCard = partnerPlay.card;
    const partnerLed = trick[0].playerId === ctx.partnerId;
    const partnerVal = RANK_VALUE[partnerCard.rank];

    if (partnerLed) {
      if (partnerVal >= 13) { signal += 0.5; signalCount++; }
      else if (partnerVal >= 11) { signal += 0.2; signalCount++; }
      else if (partnerVal <= 7) { signal -= 0.3; signalCount++; }
    } else {
      if (partnerCard.suit !== ledSuit) {
        if (partnerCard.suit === 'S') { signal += 0.4; signalCount++; }
        else {
          if (partnerVal >= 13) { signal -= 0.5; signalCount++; }
          else if (partnerVal <= 5) { signal -= 0.1; signalCount++; }
        }
      } else {
        const trickWinner = trick.reduce((winner, play) => {
          const wVal = getEffectiveValue(winner.card, ledSuit);
          const pVal = getEffectiveValue(play.card, ledSuit);
          return pVal > wVal ? play : winner;
        });
        if (trickWinner.playerId === ctx.partnerId && partnerVal >= 12) {
          signal += 0.3; signalCount++;
        }
      }
    }
  }

  if (signalCount > 0) {
    return Math.max(-1, Math.min(1, signal));
  }
  return 0;
}

// Signal disposition through card choice when following suit.
// High card = "I have strength, consider set mode"
// Low card = "I'm ducking, avoid books"
export function signalWithFollow(cardsOfSuit, winningValue, ctx) {
  const underCards = cardsOfSuit.filter(c => RANK_VALUE[c.rank] < winningValue);
  const playableCards = underCards.length > 0 ? underCards : cardsOfSuit;

  if (playableCards.length <= 1) return playableCards[0] || cardsOfSuit[0];

  if (ctx.disposition > 0 || ctx.setMode) {
    return pickHighest(playableCards);
  } else if (ctx.disposition < 0 || ctx.duckMode) {
    return pickLowest(playableCards);
  }

  return pickMiddleCard(playableCards) || pickLowest(playableCards);
}

// When ducking with multiple options, signal disposition with card choice
export function signalDuck(underCards, ctx) {
  if (underCards.length <= 1) return underCards[0];
  if (ctx.disposition > 0 || ctx.setMode) return pickHighest(underCards);
  return pickLowest(underCards);
}
