/**
 * Bot AI for Spades — Card play logic.
 *
 * Bidding is in ai/bidding.js, strategy in ai/strategy.js,
 * card memory in ai/memory.js, utilities in ai/helpers.js.
 */

import { RANK_VALUE, getCardValue } from './game/constants.js';
import {
  groupBySuit, pickHighest, pickLowest, pickRandom, pickMiddleCard,
  pickTopFromShortestSuit, getValidLeads, getCurrentWinner, getEffectiveValue,
} from './ai/helpers.js';
import { buildCardMemory, isMasterCard, isKnownVoid, anyOpponentVoid, suitCutRisk, countGuaranteedWinners } from './ai/memory.js';
import { calculateDisposition, estimateOpponentDisposition, signalWithFollow, signalDuck } from './ai/strategy.js';

// Re-export bidding functions so socketHandlers.js import path stays the same
export { botBid, evaluateBlindNil } from './ai/bidding.js';

// --- CARD PLAY ---

export function botPlayCard(hand, gameState, botId) {
  const { currentTrick, bids, tricksTaken, players, spadesBroken, teamLookup, mode } = gameState;
  const botIndex = players.findIndex(p => p.id === botId);

  // Use teamLookup for dynamic partner/opponent finding
  const partnerIds = teamLookup ? teamLookup.getPartnerIds(botId) : [];
  const opponentIds = teamLookup ? teamLookup.getOpponentIds(botId) : [];
  const partnerId = partnerIds[0] || null;
  const partnerBid = partnerId ? bids[partnerId] : undefined;
  const botBidVal = bids[botId];
  const botTricks = tricksTaken[botId] || 0;
  const partnerTricks = partnerIds.reduce((sum, id) => sum + (tricksTaken[id] || 0), 0);

  // Opponent IDs — use first two for backward compat with nil-bust logic
  const opp1Id = opponentIds[0] || null;
  const opp2Id = opponentIds[1] || null;
  const opp1Bid = opp1Id ? bids[opp1Id] : 0;
  const opp2Bid = opp2Id ? bids[opp2Id] : 0;

  const teamBid = (botBidVal || 0) + partnerIds.reduce((sum, id) => sum + (bids[id] === 0 ? 0 : bids[id] || 0), 0);
  const teamTricks = botTricks + partnerTricks;
  const needMore = teamBid > teamTricks;
  const tricksNeeded = teamBid - teamTricks;
  const partnerIsNil = partnerId ? partnerBid === 0 : false;
  const botIsNil = botBidVal === 0;
  const oppBid = opponentIds.reduce((sum, id) => sum + (bids[id] || 0), 0);
  const oppTricks = opponentIds.reduce((sum, id) => sum + (tricksTaken[id] || 0), 0);
  const opp1IsNil = opp1Id ? opp1Bid === 0 : false;
  const opp2IsNil = opp2Id ? opp2Bid === 0 : false;
  const seatPosition = currentTrick.length;

  const memory = buildCardMemory(hand, gameState, botId, mode);

  const ctx = {
    needMore, tricksNeeded, partnerIsNil, botIsNil, spadesBroken,
    opp1IsNil, opp2IsNil, teamTricks, teamBid, oppTricks, oppBid,
    botTricks, botBidVal, partnerId, players, botIndex,
    opp1Id, opp2Id, opponentIds, seatPosition, partnerBid, partnerTricks,
    memory,
    rawCardsPlayed: gameState.cardsPlayed || [],
  };

  // Calculate our duck/set disposition and estimate opponent's
  ctx.disposition = calculateDisposition(hand, ctx);
  ctx.oppDisposition = estimateOpponentDisposition(currentTrick, ctx);

  // React to opponent disposition
  if (ctx.oppDisposition > 0 && needMore) ctx.urgentBid = true;
  if (ctx.oppDisposition > 1 && ctx.partnerBid > 0 && ctx.partnerTricks < ctx.partnerBid) {
    ctx.compensateForPartner = true;
  }
  if (ctx.oppDisposition < 0 && ctx.disposition <= 0 && !needMore) {
    ctx.disposition -= 0.5; // Both teams ducking = avoid books harder
  }
  if (ctx.oppDisposition > 1 && !needMore) {
    ctx.disposition += 0.5; // Defensive aggression
  }

  // Guaranteed-to-make detection
  ctx.canGuaranteeBid = false;
  if (needMore && !botIsNil) {
    if (countGuaranteedWinners(hand, memory) >= tricksNeeded) {
      ctx.canGuaranteeBid = true;
    }
  }

  // Derived booleans
  const effectivelyMadeBid = !needMore || ctx.canGuaranteeBid;
  ctx.setMode = effectivelyMadeBid && ctx.disposition > 0 && oppTricks < oppBid;
  ctx.duckMode = effectivelyMadeBid && ctx.disposition < 0;

  // Count inevitable winners — used for consolidation (dump on partner's tricks to avoid extra books)
  ctx.inevitableWinners = hand.filter(c => isMasterCard(c, memory));

  if (currentTrick.length === 0) {
    return botLead(hand, ctx);
  } else {
    return botFollow(hand, currentTrick, ctx);
  }
}

// --- LEADING ---

function botLead(hand, ctx) {
  const validCards = getValidLeads(hand, ctx.spadesBroken);

  if (ctx.botIsNil) return leadAsNil(validCards);
  if (ctx.partnerIsNil) return leadToProtectNil(validCards, hand, ctx);
  if (ctx.opp1IsNil || ctx.opp2IsNil) return leadToBustNil(validCards, ctx);

  if (ctx.needMore) {
    if (ctx.canGuaranteeBid) {
      if (ctx.setMode) return leadInSetMode(validCards, hand, ctx);
      if (ctx.duckMode) return leadGuaranteedThenDuck(validCards, hand, ctx);
    }
    return leadWhenNeedingTricks(validCards, hand, ctx);
  }

  return ctx.setMode
    ? leadInSetMode(validCards, hand, ctx)
    : leadInDuckMode(validCards, hand, ctx);
}

function leadAsNil(validCards) {
  const groups = groupBySuit(validCards);
  let bestCard = null;
  let bestLen = -1;

  for (const [suit, cards] of Object.entries(groups)) {
    const lowest = cards[cards.length - 1];
    if (cards.length > bestLen ||
        (cards.length === bestLen && getCardValue(lowest) < getCardValue(bestCard))) {
      bestCard = lowest;
      bestLen = cards.length;
    }
  }
  return bestCard || pickLowest(validCards);
}

function leadToProtectNil(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');
  const memory = ctx.memory;

  if (offSuit.length > 0) {
    // Prioritize leading suits where nil partner IS void — they can shed dangerous cards
    const partnerVoidSuits = offSuit.filter(c => isKnownVoid(ctx.partnerId, c.suit, memory));
    if (partnerVoidSuits.length > 0) {
      // Lead masters from partner's void suits (we win, partner sheds)
      const voidMasters = partnerVoidSuits.filter(c => isMasterCard(c, memory));
      if (voidMasters.length > 0) return pickTopFromShortestSuit(voidMasters, hand);
      // Lead high cards from partner's void suits
      return pickHighest(partnerVoidSuits);
    }

    // Lead master cards — guaranteed to win, protects nil partner
    const masters = offSuit.filter(c => isMasterCard(c, memory));
    if (masters.length > 0) {
      // Prefer masters from suits that are safe (opponents won't ruff, partner won't win)
      const safeMasters = masters.filter(c =>
        !isKnownVoid(ctx.partnerId, c.suit, memory) &&
        !anyOpponentVoid(c.suit, ctx.opponentIds, memory)
      );
      if (safeMasters.length > 0) return pickTopFromShortestSuit(safeMasters, hand);
      // At least avoid suits partner is void in (partner might ruff and take a trick)
      const noPartnerVoid = masters.filter(c => !isKnownVoid(ctx.partnerId, c.suit, memory));
      if (noPartnerVoid.length > 0) return pickTopFromShortestSuit(noPartnerVoid, hand);
      return pickTopFromShortestSuit(masters, hand);
    }

    const aces = offSuit.filter(c => c.rank === 'A');
    if (aces.length > 0) return pickTopFromShortestSuit(aces, hand);

    const kings = offSuit.filter(c => c.rank === 'K');
    if (kings.length > 0) return pickTopFromShortestSuit(kings, hand);

    // Lead high cards from short suits
    const groups = groupBySuit(offSuit);
    let shortestSuit = null;
    let shortestLen = 14;
    for (const [suit, cards] of Object.entries(groups)) {
      const suitLen = hand.filter(c => c.suit === suit).length;
      if (suitLen < shortestLen) {
        shortestLen = suitLen;
        shortestSuit = suit;
      }
    }
    if (shortestSuit) return groups[shortestSuit][0];
    return pickHighest(offSuit);
  }

  return pickHighest(spades);
}

function leadToBustNil(validCards, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');

  if (offSuit.length > 0) {
    const midCards = offSuit.filter(c => {
      const v = RANK_VALUE[c.rank];
      return v >= 8 && v <= 11;
    });
    if (midCards.length > 0) return pickRandom(midCards);

    const lowMid = offSuit.filter(c => RANK_VALUE[c.rank] >= 6 && RANK_VALUE[c.rank] <= 9);
    if (lowMid.length > 0) return pickRandom(lowMid);

    return pickLowest(offSuit);
  }

  return pickLowest(validCards);
}

function leadWhenNeedingTricks(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');
  const memory = ctx.memory;

  // If opponents are setting us, cash guaranteed winners before they get trumped
  if (ctx.urgentBid || ctx.compensateForPartner) {
    const masters = offSuit.filter(c => isMasterCard(c, memory));
    if (masters.length > 0) {
      // Prefer masters in suits opponents aren't cutting
      const safeMasters = masters.filter(c => !anyOpponentVoid(c.suit, ctx.opponentIds, memory));
      if (safeMasters.length > 0) return pickTopFromShortestSuit(safeMasters, hand);
      return pickTopFromShortestSuit(masters, hand);
    }

    if (spades.length > 0) {
      const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 12);
      if (highSpades.length > 0) return highSpades[0];
    }
  }

  // Lead master cards first — prefer suits opponents can't cut
  const offSuitMasters = offSuit.filter(c => isMasterCard(c, memory));
  if (offSuitMasters.length > 0) {
    const safeMasters = offSuitMasters.filter(c => !anyOpponentVoid(c.suit, ctx.opponentIds, memory));
    if (safeMasters.length > 0) return pickTopFromShortestSuit(safeMasters, hand);
    // Masters are still guaranteed winners even if opponents ruff... wait, no.
    // Off-suit masters can be trumped! Only lead into opponent voids if we have no safe alternative.
    return pickTopFromShortestSuit(offSuitMasters, hand);
  }

  const groups = groupBySuit(offSuit);

  // Lead Aces from suits opponents aren't cutting
  const aces = offSuit.filter(c => c.rank === 'A' && !anyOpponentVoid(c.suit, ctx.opponentIds, memory));
  if (aces.length > 0) return pickTopFromShortestSuit(aces, hand);
  // Fallback: lead any Ace even if risky
  const allAces = offSuit.filter(c => c.rank === 'A');
  if (allAces.length > 0) return pickTopFromShortestSuit(allAces, hand);

  // Lead Kings from suits where we have strength AND opponents aren't cutting
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 2 && RANK_VALUE[cards[0].rank] === 13 &&
        !anyOpponentVoid(suit, ctx.opponentIds, memory)) {
      return cards[0];
    }
  }
  // Fallback: King from any suit with strength
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 2 && RANK_VALUE[cards[0].rank] === 13) return cards[0];
  }

  // Lead from long suits with strength (prefer safe suits)
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 4 && RANK_VALUE[cards[0].rank] >= 12 &&
        !anyOpponentVoid(suit, ctx.opponentIds, memory)) {
      return cards[0];
    }
  }

  // Lead master spades
  if (spades.length > 0) {
    const masterSpades = spades.filter(c => isMasterCard(c, memory));
    if (masterSpades.length > 0) return masterSpades[0];
    const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 13);
    if (highSpades.length > 0) return highSpades[0];
  }

  // Lead from short suits to create voids (prefer suits opponents aren't cutting)
  if (offSuit.length > 0) {
    let shortestSuit = null;
    let shortestLen = 14;
    for (const [suit, cards] of Object.entries(groups)) {
      const suitLen = hand.filter(c => c.suit === suit).length;
      if (suitLen > 0 && suitLen < shortestLen && suitLen <= 2 &&
          !anyOpponentVoid(suit, ctx.opponentIds, memory)) {
        shortestLen = suitLen;
        shortestSuit = suit;
      }
    }
    // Fallback: short suits even if opponents cut
    if (!shortestSuit) {
      for (const [suit, cards] of Object.entries(groups)) {
        const suitLen = hand.filter(c => c.suit === suit).length;
        if (suitLen > 0 && suitLen < shortestLen && suitLen <= 2) {
          shortestLen = suitLen;
          shortestSuit = suit;
        }
      }
    }
    if (shortestSuit) return pickLowest(groups[shortestSuit]);
  }

  if (offSuit.length > 0) return pickHighest(offSuit);
  return pickHighest(validCards);
}

function leadGuaranteedThenDuck(validCards, hand, ctx) {
  // We can guarantee our bid but want to minimize books.
  const memory = ctx.memory;
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');

  if (ctx.tricksNeeded > 0) {
    // Prefer off-suit masters (less likely to create extra books than spade masters)
    const offSuitMasters = offSuit.filter(c => isMasterCard(c, memory));
    if (offSuitMasters.length > 0) return pickTopFromShortestSuit(offSuitMasters, hand);

    const masterSpades = spades.filter(c => isMasterCard(c, memory));
    if (masterSpades.length > 0) return masterSpades[0];
  }

  return leadInDuckMode(validCards, hand, ctx);
}

function leadInSetMode(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');
  const memory = ctx.memory;

  // Lead master spades to pull opponent trumps
  if (spades.length > 0) {
    const masterSpades = spades.filter(c => isMasterCard(c, memory));
    if (masterSpades.length > 0) return masterSpades[0];
    const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 12);
    if (highSpades.length > 0) return highSpades[0];
  }

  // Lead master off-suit cards (prefer suits opponents can't cut — force them to follow)
  const masters = offSuit.filter(c => isMasterCard(c, memory));
  if (masters.length > 0) {
    const safeMasters = masters.filter(c => !anyOpponentVoid(c.suit, ctx.opponentIds, memory));
    if (safeMasters.length > 0) return pickTopFromShortestSuit(safeMasters, hand);
    return pickTopFromShortestSuit(masters, hand);
  }

  // Lead from suits where opponents are known void — force them to waste spades
  if (offSuit.length > 0) {
    const groups = groupBySuit(offSuit);
    for (const [suit, cards] of Object.entries(groups)) {
      if (anyOpponentVoid(suit, ctx.opponentIds, memory) && cards.length > 0) {
        return pickLowest(cards); // Lead low — make them trump a worthless card
      }
    }
  }

  // Lead from short suits to create voids for future ruffing
  if (offSuit.length > 0) {
    const groups = groupBySuit(offSuit);
    let shortestSuit = null;
    let shortestLen = 14;
    for (const [suit, cards] of Object.entries(groups)) {
      const suitLen = hand.filter(c => c.suit === suit).length;
      if (suitLen > 0 && suitLen < shortestLen) {
        shortestLen = suitLen;
        shortestSuit = suit;
      }
    }
    if (shortestSuit && shortestLen <= 2) return pickLowest(groups[shortestSuit]);
    return pickHighest(offSuit);
  }

  return pickHighest(validCards);
}

function leadInDuckMode(validCards, hand, ctx) {
  // Avoid taking extra tricks (books).
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const memory = ctx.memory;

  if (offSuit.length > 0) {
    // Avoid leading master cards — they'll win and give us books
    const nonMasters = offSuit.filter(c => !isMasterCard(c, memory));
    const candidates = nonMasters.length > 0 ? nonMasters : offSuit;

    // Prefer suits where opponents are NOT void (so our low card stays low)
    const safeCandidates = candidates.filter(c => !anyOpponentVoid(c.suit, ctx.opponentIds, memory));
    const pool = safeCandidates.length > 0 ? safeCandidates : candidates;

    // Lead low from longest safe suit (long suits are harder to cut)
    const groups = groupBySuit(pool);
    let bestSuit = null;
    let bestLen = -1;
    for (const [suit, cards] of Object.entries(groups)) {
      const suitLen = hand.filter(c => c.suit === suit).length;
      if (suitLen > bestLen) {
        bestLen = suitLen;
        bestSuit = suit;
      }
    }
    if (bestSuit) return pickLowest(groups[bestSuit]);
    return pickLowest(pool);
  }

  return pickLowest(validCards);
}

// --- FOLLOWING ---

function botFollow(hand, currentTrick, ctx) {
  const ledSuit = currentTrick[0].card.suit;
  const hasLedSuit = hand.some(c => c.suit === ledSuit);
  const cardsOfSuit = hand.filter(c => c.suit === ledSuit);
  const nonSuitCards = hand.filter(c => c.suit !== ledSuit);

  const currentWinner = getCurrentWinner(currentTrick);
  const winnerIsPartner = currentWinner.playerId === ctx.partnerId;
  const winningValue = getEffectiveValue(currentWinner.card, ledSuit);

  if (ctx.botIsNil) return followAsNil(hand, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue);

  if (ctx.partnerIsNil) {
    const nilCard = followToProtectNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (nilCard) return nilCard;
  }

  if (ctx.opp1IsNil || ctx.opp2IsNil) {
    const bustCard = followToBustNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (bustCard) return bustCard;
  }

  if (hasLedSuit) {
    return followSuitNormal(cardsOfSuit, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx);
  } else {
    return discardNormal(hand, nonSuitCards, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx);
  }
}

function followAsNil(hand, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue) {
  if (hasLedSuit) {
    const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
    if (underCards.length > 0) return pickHighest(underCards);
    return pickLowest(cardsOfSuit);
  }

  const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
  if (nonSpade.length > 0) return pickHighest(nonSpade);
  return pickLowest(hand);
}

function followToProtectNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx) {
  const partnerPlayed = currentTrick.find(t => t.playerId === ctx.partnerId);

  if (partnerPlayed) {
    const partnerIsWinning = getCurrentWinner(currentTrick).playerId === ctx.partnerId;

    if (partnerIsWinning) {
      // Partner (nil) is winning — we MUST overtake them!
      if (hasLedSuit) {
        const partnerCardValue = getEffectiveValue(partnerPlayed.card, ledSuit);
        const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > partnerCardValue);
        if (beaters.length > 0) return pickLowest(beaters);
      }
      return null; // Can't follow suit — discardNormal handles trumping
    } else {
      // Partner played and is NOT winning — they're safe
      if (hasLedSuit) {
        const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
        if (beaters.length > 0) return pickLowest(beaters);
        return pickLowest(cardsOfSuit);
      }
      return null;
    }
  } else {
    // Partner hasn't played yet — play high to win before partner
    if (hasLedSuit) {
      const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
      if (beaters.length > 0) return pickHighest(beaters);
      return pickHighest(cardsOfSuit);
    }
    return null;
  }
}

function followToBustNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx) {
  const nilOppId = ctx.opp1IsNil ? ctx.opp1Id : (ctx.opp2IsNil ? ctx.opp2Id : null);
  if (!nilOppId) return null;

  const nilPlayerPlayed = currentTrick.find(t => t.playerId === nilOppId);

  if (nilPlayerPlayed) {
    const nilIsWinning = getCurrentWinner(currentTrick).playerId === nilOppId;
    if (nilIsWinning) {
      if (hasLedSuit) {
        const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < getEffectiveValue(nilPlayerPlayed.card, ledSuit));
        if (underCards.length > 0) return pickLowest(underCards);
      }
      if (!hasLedSuit) {
        const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
        if (nonSpade.length > 0) return pickLowest(nonSpade);
        return pickLowest(hand);
      }
    }
  } else {
    if (hasLedSuit && ctx.seatPosition <= 1) {
      const midCards = cardsOfSuit.filter(c => {
        const v = RANK_VALUE[c.rank];
        return v >= 7 && v <= 11;
      });
      if (midCards.length > 0) return pickRandom(midCards);
    }
  }

  return null;
}

function followSuitNormal(cardsOfSuit, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx) {
  const memory = ctx.memory;

  // Still need tricks
  if (ctx.needMore) {
    if (winnerIsPartner) {
      const partnerPlay = currentTrick.find(t => t.playerId === ctx.partnerId);
      const partnerIsMaster = partnerPlay && isMasterCard(partnerPlay.card, memory);

      // NEVER overtake partner's boss card — it's already winning, save your high cards
      if (partnerIsMaster || winningValue >= RANK_VALUE['K']) {
        if (ctx.duckMode && ctx.canGuaranteeBid) {
          // Consolidation: dump masters on partner's winning trick
          const mastersInSuit = cardsOfSuit.filter(c => isMasterCard(c, memory));
          if (mastersInSuit.length > 0 && cardsOfSuit.length > mastersInSuit.length) {
            return pickHighest(mastersInSuit);
          }
        }
        return signalWithFollow(cardsOfSuit, winningValue, ctx);
      }

      // Partner is winning but card isn't the boss — still play low unless urgent
      if (!ctx.compensateForPartner || ctx.seatPosition === 3) {
        return signalWithFollow(cardsOfSuit, winningValue, ctx);
      }
      // compensateForPartner + partner's card is vulnerable: fall through to try beating
    }

    if (ctx.canGuaranteeBid && ctx.setMode) {
      const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
      if (beaters.length > 0) return pickLowest(beaters);
      return signalWithFollow(cardsOfSuit, winningValue, ctx);
    }

    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) {
      if (ctx.urgentBid && ctx.seatPosition <= 1) {
        const safeBeaters = beaters.filter(c => getEffectiveValue(c, ledSuit) >= RANK_VALUE['Q']);
        if (safeBeaters.length > 0 && beaters.length > 1) return pickLowest(safeBeaters);
      }
      return pickLowest(beaters);
    }
    return signalWithFollow(cardsOfSuit, winningValue, ctx);
  }

  // Bid is met — play based on disposition

  if (ctx.setMode) {
    if (winnerIsPartner) {
      const partnerPlay = currentTrick.find(t => t.playerId === ctx.partnerId);
      const partnerIsMaster = partnerPlay && isMasterCard(partnerPlay.card, memory);
      // Never overtake partner's boss card or strong card
      if (partnerIsMaster || winningValue >= RANK_VALUE['J']) {
        return signalWithFollow(cardsOfSuit, winningValue, ctx);
      }
    }

    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) return pickLowest(beaters);
    return signalWithFollow(cardsOfSuit, winningValue, ctx);
  }

  // DUCK MODE: avoid taking tricks (book avoidance)
  if (winnerIsPartner) {
    // Consolidation: dump masters and high cards on partner's trick
    const mastersInSuit = cardsOfSuit.filter(c => isMasterCard(c, memory));
    if (mastersInSuit.length > 0 && cardsOfSuit.length > mastersInSuit.length) {
      return pickHighest(mastersInSuit);
    }
    // Even without masters, dump highest card — partner is taking anyway
    return pickHighest(cardsOfSuit);
  }
  // NOT partner winning — play as low as possible to avoid taking
  const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
  if (underCards.length > 0) return pickLowest(underCards);
  // Can't duck under — play absolute lowest to minimize damage
  return pickLowest(cardsOfSuit);
}

function discardNormal(hand, nonSuitCards, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx) {
  const spades = hand.filter(c => c.suit === 'S');
  const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
  const memory = ctx.memory;
  const currentWinner = getCurrentWinner(currentTrick);
  const winningCardIsMaster = isMasterCard(currentWinner.card, memory);

  // Partner is nil: special handling
  if (ctx.partnerIsNil) {
    return discardWhenPartnerNil(hand, spades, nonSpade, currentTrick, ledSuit, currentWinner, ctx);
  }

  // Never trump partner's winning card (with exceptions)
  if (winnerIsPartner) {
    if (ctx.urgentBid && ctx.seatPosition === 2 && !winningCardIsMaster) {
      if (spades.length > 0 && ledSuit !== 'S') {
        const beaten = trumpBeaters(spades, currentTrick);
        if (beaten) return beaten;
      }
    }

    // Consolidation: dump inevitable winners on partner's trick to avoid extra books
    if (ctx.duckMode || (ctx.canGuaranteeBid && ctx.disposition < 0)) {
      // Dump highest spades first (most dangerous — they'll win future tricks)
      const masterSpades = spades.filter(c => isMasterCard(c, memory));
      if (masterSpades.length > 0) return pickHighest(masterSpades);
      // Dump any high spades (even non-masters can be forced to win later)
      if (spades.length > 1) {
        const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 10);
        if (highSpades.length > 0) return pickHighest(highSpades);
      }
      // Dump off-suit masters
      const masterNonSpade = nonSpade.filter(c => isMasterCard(c, memory));
      if (masterNonSpade.length > 0) return pickHighest(masterNonSpade);
      // Dump highest off-suit card
      if (nonSpade.length > 0) return pickHighest(nonSpade);
    }

    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // Still need tricks
  if (ctx.needMore) {
    if (ctx.canGuaranteeBid && ctx.duckMode) {
      // Can guarantee bid but ducking — don't trump (save for guaranteed wins later)
      if (nonSpade.length > 0) return pickHighest(nonSpade);
      // Only spades: dump lowest (save high spades for guaranteed tricks)
      return pickLowest(hand);
    }

    if (ctx.canGuaranteeBid && ctx.setMode) {
      if (spades.length > 0 && ledSuit !== 'S') {
        const beaten = trumpBeaters(spades, currentTrick);
        if (beaten) return beaten;
      }
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      return pickLowest(hand);
    }

    // Normal: trump to win
    if (spades.length > 0 && ledSuit !== 'S') {
      // Clever play: if partner is also void in this suit and hasn't played yet,
      // trump HIGH so partner can undercut with a low spade (shedding spades)
      const partnerAlsoVoid = ctx.partnerId && isKnownVoid(ctx.partnerId, ledSuit, memory);
      const partnerHasntPlayed = !currentTrick.find(t => t.playerId === ctx.partnerId);
      if (partnerAlsoVoid && partnerHasntPlayed && spades.length >= 2) {
        const beaten = trumpBeatersHigh(spades, currentTrick);
        if (beaten) return beaten;
      }
      const beaten = trumpBeaters(spades, currentTrick);
      if (beaten) return beaten;
    }

    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // Bid met: disposition-based
  if (ctx.setMode) {
    if (winningCardIsMaster) {
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      return pickLowest(hand);
    }

    if (spades.length > 0 && ledSuit !== 'S') {
      const beaten = trumpBeaters(spades, currentTrick);
      if (beaten) return beaten;
    }

    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // Duck mode: NEVER trump (that would take a trick = book), dump dangerous cards
  // Dump highest off-suit masters and high cards to shed future trick-winners
  const masterNonSpade = nonSpade.filter(c => isMasterCard(c, memory));
  if (masterNonSpade.length > 0) return pickHighest(masterNonSpade);
  if (nonSpade.length > 0) return pickHighest(nonSpade);
  // Only spades left — dump lowest to minimize winning future tricks
  return pickLowest(hand);
}

// Extracted: discard logic when partner bid nil
function discardWhenPartnerNil(hand, spades, nonSpade, currentTrick, ledSuit, currentWinner, ctx) {
  const partnerPlayed = currentTrick.find(t => t.playerId === ctx.partnerId);

  if (partnerPlayed) {
    const partnerIsWinning = currentWinner.playerId === ctx.partnerId;
    if (partnerIsWinning) {
      // Partner is winning — MUST trump to save them!
      if (spades.length > 0 && ledSuit !== 'S') {
        const beaten = trumpBeaters(spades, currentTrick);
        if (beaten) return beaten;
      }
      if (nonSpade.length > 0) return pickHighest(nonSpade);
      return pickLowest(hand);
    } else {
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      return pickLowest(hand);
    }
  } else {
    // Partner hasn't played yet — take the trick to prevent partner from winning
    if (spades.length > 0 && ledSuit !== 'S') {
      const beaten = trumpBeaters(spades, currentTrick);
      if (beaten) return beaten;
    }
    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }
}

// Find the lowest spade that beats all current trumps in the trick
function trumpBeaters(spades, currentTrick) {
  const currentHighTrump = currentTrick
    .filter(t => t.card.suit === 'S')
    .reduce((max, t) => Math.max(max, getCardValue(t.card)), 0);
  const beatingSpades = spades.filter(c => getCardValue(c) > currentHighTrump);
  if (beatingSpades.length > 0) return pickLowest(beatingSpades);
  if (currentHighTrump === 0 && spades.length > 0) return pickLowest(spades);
  return null;
}

// Like trumpBeaters but picks HIGH spade — used when partner can undercut below us
function trumpBeatersHigh(spades, currentTrick) {
  const currentHighTrump = currentTrick
    .filter(t => t.card.suit === 'S')
    .reduce((max, t) => Math.max(max, getCardValue(t.card)), 0);
  const beatingSpades = spades.filter(c => getCardValue(c) > currentHighTrump);
  if (beatingSpades.length > 0) return pickHighest(beatingSpades);
  if (currentHighTrump === 0 && spades.length > 0) return pickHighest(spades);
  return null;
}

// Smart discard: preserve range (keep highs and lows), dump middle cards first
function dumpCard(candidates, hand, ctx) {
  if (!ctx.needMore && !ctx.setMode) {
    // Duck mode: dump highest dangerous cards to avoid books
    const memory = ctx.memory;
    const masters = candidates.filter(c => isMasterCard(c, memory));
    const nonMasters = candidates.filter(c => !isMasterCard(c, memory));

    if (nonMasters.length === 0) return pickHighest(candidates);

    return pickMiddleCard(nonMasters) || pickHighest(nonMasters);
  }

  // Need tricks or set mode: dump from shortest suit to create voids
  const groups = groupBySuit(candidates);
  let shortestSuit = null;
  let shortestLen = 14;
  for (const [suit, cards] of Object.entries(groups)) {
    const suitLen = hand.filter(c => c.suit === suit).length;
    if (suitLen < shortestLen) {
      shortestLen = suitLen;
      shortestSuit = suit;
    }
  }
  if (shortestSuit) {
    const suitCards = groups[shortestSuit];
    if (suitCards.length === 1) return suitCards[0];
    return pickMiddleCard(suitCards) || pickLowest(suitCards);
  }
  return pickLowest(candidates);
}
