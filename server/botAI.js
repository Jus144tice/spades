/**
 * Bot AI for Spades — Card play logic.
 *
 * Bidding is in ai/bidding.js, strategy in ai/strategy.js,
 * card memory in ai/memory.js, utilities in ai/helpers.js.
 */

import { RANK_VALUE, getCardValue } from './game/constants.js';
import {
  groupBySuit, pickHighest, pickLowest, pickRandom, pickMiddleCard, pickByDisposition,
  pickTopFromShortestSuit, getValidLeads, getCurrentWinner, getEffectiveValue,
} from './ai/helpers.js';
import { buildCardMemory, isMasterCard, isKnownVoid, anyOpponentVoid, suitCutRisk, countGuaranteedWinners } from './ai/memory.js';
import { calculateDisposition, estimateOpponentDisposition, signalWithFollow, signalDuck } from './ai/strategy.js';

// Re-export bidding functions so socketHandlers.js import path stays the same
export { botBid, evaluateBlindNil } from './ai/bidding.js';
import { getDesperationContext } from './ai/bidding.js';

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
  const botStillNeeds = Math.max(0, (botBidVal || 0) - botTricks);

  const memory = buildCardMemory(hand, gameState, botId, mode);

  const ctx = {
    needMore, tricksNeeded, partnerIsNil, botIsNil, spadesBroken,
    opp1IsNil, opp2IsNil, teamTricks, teamBid, oppTricks, oppBid,
    botTricks, botBidVal, partnerId, players, botIndex,
    opp1Id, opp2Id, opponentIds, seatPosition, partnerBid, partnerTricks,
    botStillNeeds,
    memory,
    rawCardsPlayed: gameState.cardsPlayed || [],
  };

  // Nil-bust context: track which opponent bid nil and if they're already busted
  ctx.nilOppId = null;
  ctx.nilOppBusted = false;
  if (opp1IsNil) {
    ctx.nilOppId = opp1Id;
    ctx.nilOppBusted = (tricksTaken[opp1Id] || 0) > 0;
  } else if (opp2IsNil) {
    ctx.nilOppId = opp2Id;
    ctx.nilOppBusted = (tricksTaken[opp2Id] || 0) > 0;
  }

  // Partner nil busted: penalty is locked in, their tricks help us make bid
  ctx.partnerNilBusted = partnerIsNil && partnerTricks > 0;

  // Accumulated books from prior rounds — needed for disposition and play decisions
  ctx.teamAccumulatedBooks = 0;
  ctx.bookThreshold = 10;
  if (gameState.books && teamLookup) {
    const teamKey = teamLookup.getTeamKey(botId);
    ctx.teamAccumulatedBooks = gameState.books[teamKey] || 0;
  }
  if (gameState.settings && gameState.settings.bookThreshold) {
    ctx.bookThreshold = gameState.settings.bookThreshold;
  }
  ctx.booksBudget = ctx.bookThreshold - ctx.teamAccumulatedBooks;

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

  // Nil-bust spoiler: partner's nil got busted — opponents likely overextended
  // Stop protecting (penalty is locked in) and try to set their bid instead
  if (ctx.partnerNilBusted) {
    const oppStillNeeds = Math.max(0, oppBid - oppTricks);
    if (oppStillNeeds > 0) {
      ctx.disposition = Math.max(ctx.disposition, 1.5);
    }
  }

  // --- DESPERATION CONTEXT ---
  // Check if opponents are about to win — override disposition for survival
  ctx.desperateSet = false;
  ctx.desperateBookDump = false;
  const tricksPerRound = mode ? mode.tricksPerRound : 13;

  if (gameState.scores && botId) {
    const opponentBids = opponentIds.map(id => bids[id] || 0);
    const desp = getDesperationContext(gameState, botId, partnerBid, opponentBids);

    if (desp.desperate) {
      const totalTricksPlayed = teamTricks + oppTricks;
      const tricksLeft = tricksPerRound - totalTricksPlayed;
      const oppStillNeeds = Math.max(0, desp.oppBidTotal - oppTricks);

      // Can we still set them? (they still need tricks and there are enough left)
      if (oppStillNeeds > 0 && tricksLeft > 0) {
        // Set mode: take as many tricks as possible to deny opponents
        ctx.desperateSet = true;
        ctx.disposition = Math.max(ctx.disposition, 2.5); // hard set override
      } else if (oppStillNeeds <= 0) {
        // Opponents already made their bid — set is impossible
        // Pivot to book-dump: force opponents to take extra tricks (books)
        if (desp.bookSetViable) {
          ctx.desperateBookDump = true;
          ctx.disposition = Math.min(ctx.disposition, -2.5); // hard duck — let them win tricks
        }
      }

      // Mid-round pivot: if we were trying to set but it's now hopeless, dump books
      if (ctx.desperateSet && oppStillNeeds > 0 && tricksLeft > 0) {
        // Calculate if we can realistically deny enough tricks
        const ourPotential = hand.filter(c => isMasterCard(c, memory)).length + (botStillNeeds > 0 ? 0 : 1);
        if (ourPotential < oppStillNeeds && desp.bookSetViable) {
          // Can't set — pivot to book-dump
          ctx.desperateSet = false;
          ctx.desperateBookDump = true;
          ctx.disposition = Math.min(ctx.disposition, -2);
        }
      }
    }
  }

  // Guaranteed-to-make detection — based on bot's PERSONAL remaining needs
  ctx.canGuaranteeBid = false;
  ctx.guaranteedWinners = 0;
  if (!botIsNil) {
    const guaranteed = countGuaranteedWinners(hand, memory);
    ctx.guaranteedWinners = guaranteed;
    if (guaranteed >= botStillNeeds) {
      ctx.canGuaranteeBid = true;
    }
  }

  // Count masters in hand — used to decide if we can spare any for consolidation
  ctx.mastersInHand = hand.filter(c => isMasterCard(c, memory));
  ctx.mastersToSpare = Math.max(0, ctx.mastersInHand.length - botStillNeeds);

  // --- DISPOSITION-DRIVEN PLAY ---
  // Disposition is a spectrum, not a binary switch.
  // Only commit fully to SET or DUCK with strong signals.
  // Moderate values (-1 to 1) = play normally, don't overcommit.

  const bidSafelyMade = !needMore;
  const effectivelyMadeBid = bidSafelyMade || ctx.canGuaranteeBid;

  // Require strong disposition for full mode commitment
  ctx.setMode = effectivelyMadeBid && ctx.disposition >= 1 && oppTricks < oppBid;
  ctx.duckMode = effectivelyMadeBid && ctx.disposition <= -1;

  // Desperation overrides normal mode logic
  if (ctx.desperateSet) {
    ctx.setMode = true;
    ctx.duckMode = false;
  } else if (ctx.desperateBookDump) {
    ctx.setMode = false;
    ctx.duckMode = true;
  }

  // MAKE PRIORITY: protect bot's personal bid, trust partner for theirs
  // But respect trick buffer — don't go all-out when there's plenty of room
  const totalTricksPlayed = teamTricks + oppTricks;
  ctx.tricksRemaining = tricksPerRound - totalTricksPlayed;
  ctx.trickBuffer = ctx.tricksRemaining - tricksNeeded; // free tricks beyond what team needs

  if (needMore && !bidSafelyMade && !ctx.desperateSet && !ctx.desperateBookDump) {
    if (botStillNeeds > 0) {
      const personalBuffer = ctx.tricksRemaining - botStillNeeds;
      // Near book penalty: only override duck when absolutely no room
      const tightThreshold = ctx.booksBudget <= 3 ? 0 : 1;
      if (personalBuffer <= tightThreshold) {
        ctx.duckMode = false;
      }
      // With more buffer, leave duckMode as disposition set it — play selectively
    } else if (ctx.tricksRemaining > 0) {
      // Bot made its bid, partner still needs — trust partner
      // Only step in if partner is clearly struggling
      const partnerPace = tricksNeeded / ctx.tricksRemaining;
      if (partnerPace > 0.7 || ctx.compensateForPartner) {
        ctx.duckMode = false;
      }
    }
  }

  // Set achieved: opponents can't make their bid and ours is safe — duck to avoid books
  if ((ctx.setMode || ctx.desperateSet) && !needMore) {
    const oppStillNeeds = Math.max(0, oppBid - oppTricks);
    if (oppStillNeeds > ctx.tricksRemaining) {
      ctx.setMode = false;
      ctx.desperateSet = false;
      ctx.duckMode = true;
    }
  }

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
  if (ctx.partnerIsNil && !ctx.partnerNilBusted) return leadToProtectNil(validCards, hand, ctx);
  if ((ctx.opp1IsNil || ctx.opp2IsNil) && !ctx.nilOppBusted) return leadToBustNil(validCards, hand, ctx);

  // Desperation book-dump: lead low cards to force opponents to take tricks
  if (ctx.desperateBookDump) return leadBookDump(validCards, hand, ctx);

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

function leadToBustNil(validCards, hand, ctx) {
  const memory = ctx.memory;
  const nilId = ctx.nilOppId;
  const offSuit = validCards.filter(c => c.suit !== 'S');

  if (offSuit.length === 0) return pickLowest(validCards);

  // Prefer suits the nil player must follow (not void in)
  const nilFollows = offSuit.filter(c => !isKnownVoid(nilId, c.suit, memory));
  const pool = nilFollows.length > 0 ? nilFollows : offSuit;

  // Mid cards (7-J) are the trap range — too high for nil to duck easily,
  // too low for nil's partner to safely cover
  const midCards = pool.filter(c => {
    const v = RANK_VALUE[c.rank];
    return v >= 7 && v <= 11;
  });
  if (midCards.length > 0) {
    // Prefer suits with fewer remaining cards (tighter squeeze on nil)
    const groups = groupBySuit(midCards);
    let bestSuit = null;
    let bestRemaining = Infinity;
    for (const [suit, cards] of Object.entries(groups)) {
      const remaining = memory.suitRemaining[suit] || 13;
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        bestSuit = suit;
      }
    }
    if (bestSuit) return pickHighest(groups[bestSuit]);
    return pickHighest(midCards);
  }

  // No mid cards — lead highest low card from nil-follow suits (maximum pressure)
  const lowCards = pool.filter(c => RANK_VALUE[c.rank] <= 6);
  if (lowCards.length > 0) return pickHighest(lowCards);

  // Only high cards left — lead lowest high to save bigger cards
  return pickLowest(pool);
}

function leadWhenNeedingTricks(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');
  const memory = ctx.memory;
  const buffer = ctx.trickBuffer || 0;

  // Bot already made its personal bid and there's healthy buffer — lead passively
  // Let partner take their own tricks instead of gobbling everything up
  if (ctx.botStillNeeds <= 0 && buffer >= 2) {
    return leadInDuckMode(validCards, hand, ctx);
  }

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

// Book-dump lead: the goal is to force opponents to take tricks they don't want.
// Lead low cards in suits opponents must follow (not void in).
// Avoid leading in suits where we have masters — those would win and give US tricks.
function leadBookDump(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const memory = ctx.memory;

  if (offSuit.length > 0) {
    // Avoid our masters — we want to LOSE these tricks
    const nonMasters = offSuit.filter(c => !isMasterCard(c, memory));
    const candidates = nonMasters.length > 0 ? nonMasters : offSuit;

    // Prefer suits where opponents are NOT void (they must follow and might win)
    const oppMustFollow = candidates.filter(c => !anyOpponentVoid(c.suit, ctx.opponentIds, memory));
    const pool = oppMustFollow.length > 0 ? oppMustFollow : candidates;

    // Lead the second-lowest card from the longest suit
    // (save absolute lowest for later ducking, but lead low enough to lose)
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
    if (bestSuit) {
      const suitCards = groups[bestSuit];
      if (suitCards.length >= 3) return suitCards[suitCards.length - 2]; // second-lowest
      return pickLowest(suitCards);
    }
    return pickLowest(pool);
  }

  // Only spades — lead lowest to avoid winning
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

  if (ctx.partnerIsNil && !ctx.partnerNilBusted) {
    const nilCard = followToProtectNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (nilCard) return nilCard;
  }

  if ((ctx.opp1IsNil || ctx.opp2IsNil) && !ctx.nilOppBusted) {
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
  const nilId = ctx.nilOppId;
  if (!nilId) return null;

  const memory = ctx.memory;
  const nilPlayerPlayed = currentTrick.find(t => t.playerId === nilId);

  if (nilPlayerPlayed) {
    const nilIsWinning = getCurrentWinner(currentTrick).playerId === nilId;
    if (nilIsWinning) {
      // Nil is winning — duck under them so they take the trick!
      if (hasLedSuit) {
        const nilValue = getEffectiveValue(nilPlayerPlayed.card, ledSuit);
        const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < nilValue);
        if (underCards.length > 0) return pickHighest(underCards); // highest under = shed most
        // Can't duck — forced to play over. Play lowest to minimize
        return pickLowest(cardsOfSuit);
      }
      // Void in led suit — DON'T trump! Let nil keep their winning trick
      const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
      if (nonSpade.length > 0) return pickHighest(nonSpade); // shed high off-suit
      return pickLowest(hand); // only spades — shed lowest
    }
    // Nil played but isn't winning — they're safe this trick, play normally
    return null;
  }

  // Nil hasn't played yet
  if (hasLedSuit) {
    // If nil must follow this suit, play mid to squeeze them
    if (!isKnownVoid(nilId, ledSuit, memory)) {
      const midCards = cardsOfSuit.filter(c => {
        const v = RANK_VALUE[c.rank];
        return v >= 7 && v <= 11;
      });
      if (midCards.length > 0) return pickHighest(midCards);
    }
  } else {
    // We're void in led suit — if nil is also void, they might be forced to trump
    // Don't trump ourselves — let nil potentially self-bust
    if (isKnownVoid(nilId, ledSuit, memory)) {
      const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
      if (nonSpade.length > 0) return pickHighest(nonSpade);
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
        if (ctx.duckMode && ctx.canGuaranteeBid && ctx.mastersToSpare > 0) {
          // Consolidation: dump masters on partner's winning trick — but ONLY if we can spare them
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

    // Buffer-aware trick-taking: don't grab every trick when there's plenty of room
    const buffer = ctx.trickBuffer || 0;
    if (ctx.botStillNeeds <= 0 && buffer >= 2) {
      // Bot made its bid, partner still needs — play passively, let partner take theirs
      return signalWithFollow(cardsOfSuit, winningValue, ctx);
    }

    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) {
      // With healthy buffer, only beat if it's a cheap win (don't waste high cards)
      if (ctx.botStillNeeds > 0 && buffer >= 3) {
        const cheapBeaters = beaters.filter(c => getEffectiveValue(c, ledSuit) <= RANK_VALUE['J']);
        if (cheapBeaters.length > 0) return pickLowest(cheapBeaters);
        // No cheap beaters — only commit a high card if we really need it
        if (ctx.botStillNeeds >= 2) return pickLowest(beaters);
        return signalWithFollow(cardsOfSuit, winningValue, ctx);
      }

      if (ctx.urgentBid && ctx.seatPosition <= 1) {
        const safeBeaters = beaters.filter(c => getEffectiveValue(c, ledSuit) >= RANK_VALUE['Q']);
        if (safeBeaters.length > 0 && beaters.length > 1) return pickLowest(safeBeaters);
      }
      return pickLowest(beaters);
    }
    return signalWithFollow(cardsOfSuit, winningValue, ctx);
  }

  // Bid is met — play based on disposition spectrum
  const disp = ctx.disposition || 0;

  if (winnerIsPartner) {
    const partnerPlay = currentTrick.find(t => t.playerId === ctx.partnerId);
    const partnerIsMaster = partnerPlay && isMasterCard(partnerPlay.card, memory);

    // Never overtake partner's boss card or strong card
    if (partnerIsMaster || winningValue >= RANK_VALUE['J']) {
      // Hard duck: consolidate masters on partner's strong trick
      if (disp <= -2 && ctx.mastersToSpare > 0) {
        const mastersInSuit = cardsOfSuit.filter(c => isMasterCard(c, memory));
        if (mastersInSuit.length > 0 && cardsOfSuit.length > mastersInSuit.length) {
          return pickHighest(mastersInSuit);
        }
      }
      return pickByDisposition(cardsOfSuit, disp);
    }

    // Partner winning with vulnerable card
    if (disp >= 1) {
      // Set (soft/hard): try to overtake vulnerable winning card
      const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
      if (beaters.length > 0) return pickLowest(beaters);
    }
    // Shed on partner's trick based on disposition
    return pickByDisposition(cardsOfSuit, disp);
  }

  // Not partner winning
  if (disp >= 1) {
    // Set (soft/hard): try to win
    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) return pickLowest(beaters);
    return pickByDisposition(cardsOfSuit, disp);
  }

  if (disp <= -1) {
    // Duck (soft/hard): play under if possible, shed graduated
    const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
    if (underCards.length > 0) return pickByDisposition(underCards, disp);
    return pickLowest(cardsOfSuit);
  }

  // Neutral: duck if possible, don't force wins
  const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
  if (underCards.length > 0) return pickByDisposition(underCards, disp);
  // Can't duck — take cheaply if forced
  const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
  if (beaters.length > 0) return pickLowest(beaters);
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

  // Desperation book-dump: NEVER trump — let opponents take the trick
  // Shed our highest cards to avoid accidentally winning future tricks
  if (ctx.desperateBookDump) {
    if (nonSpade.length > 0) return pickHighest(nonSpade);
    return pickLowest(hand); // only spades left — shed lowest
  }

  // Never trump partner's winning card (with exceptions)
  if (winnerIsPartner) {
    const disp = ctx.disposition || 0;

    if (ctx.urgentBid && ctx.seatPosition === 2 && !winningCardIsMaster) {
      if (spades.length > 0 && ledSuit !== 'S') {
        const beaten = trumpBeaters(spades, currentTrick);
        if (beaten) return beaten;
      }
    }

    // Consolidation on partner's trick — graduated by disposition
    if (disp <= -2 && ctx.mastersToSpare > 0) {
      // Hard duck: aggressively dump masters
      const masterSpades = spades.filter(c => isMasterCard(c, memory));
      if (masterSpades.length > 0) return pickHighest(masterSpades);
      const masterNonSpade = nonSpade.filter(c => isMasterCard(c, memory));
      if (masterNonSpade.length > 0) return pickHighest(masterNonSpade);
    }
    if (disp <= -1) {
      // Soft/hard duck: dump high non-master spades and high off-suit
      if (spades.length > 1) {
        const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 10 && !isMasterCard(c, memory));
        if (highSpades.length > 0) return pickHighest(highSpades);
      }
      if (nonSpade.length > 0) return pickHighest(nonSpade);
    }

    // General dump — disposition-based selection
    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // Still need tricks
  if (ctx.needMore) {
    if (ctx.canGuaranteeBid && ctx.duckMode) {
      // Can guarantee bid but ducking — don't trump (save for guaranteed wins later)
      if (nonSpade.length > 0) return pickHighest(nonSpade);
      // Only spades: dump highest now so future leads are lower
      return forcedTrumpCard(spades, currentTrick);
    }

    if (ctx.canGuaranteeBid && ctx.setMode) {
      if (spades.length > 0 && ledSuit !== 'S') {
        const beaten = trumpBeaters(spades, currentTrick);
        if (beaten) return beaten;
      }
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      return pickLowest(hand);
    }

    // Buffer-aware trumping: don't waste spades when there's plenty of room
    const buffer = ctx.trickBuffer || 0;
    if (ctx.botStillNeeds <= 0 && buffer >= 2) {
      // Bot made its bid, partner still needs — don't trump, let partner handle it
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      // Only spades: dump highest now so future leads are lower
      return forcedTrumpCard(spades, currentTrick);
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

  // Bid met: disposition-based discard
  const disp = ctx.disposition || 0;

  if (disp >= 1) {
    // Set (soft/hard): trump to take tricks
    if (!winningCardIsMaster && spades.length > 0 && ledSuit !== 'S') {
      const beaten = trumpBeaters(spades, currentTrick);
      if (beaten) return beaten;
    }
    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // Neutral or duck: don't trump, shed cards based on disposition
  if (nonSpade.length > 0) return pickByDisposition(nonSpade, disp);
  // Only spades left — dump highest to shed dangerous cards, preserve low for future
  return forcedTrumpCard(spades, currentTrick);
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

// When void in led suit and only have spades, decide how to play.
// If we can duck under an existing trump, play the highest card that ducks.
// If we're going to win no matter what, dump our highest to shed it.
function forcedTrumpCard(spades, currentTrick) {
  const existingTrumps = currentTrick.filter(t => t.card.suit === 'S');
  if (existingTrumps.length > 0) {
    const highestTrump = Math.max(...existingTrumps.map(t => getCardValue(t.card)));
    const duckers = spades.filter(c => getCardValue(c) < highestTrump);
    if (duckers.length > 0) {
      // Can duck under existing trump — play highest ducker to shed dangerous card
      return pickHighest(duckers);
    }
  }
  // Going to win regardless — dump highest to preserve lower spades for future
  return pickHighest(spades);
}

// Smart discard: what to shed depends on disposition strength
function dumpCard(candidates, hand, ctx) {
  const disp = ctx.disposition || 0;

  // When trying to win tricks: dump from shortest suit to create voids
  if (ctx.needMore || disp >= 1) {
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
      return pickByDisposition(suitCards, disp);
    }
    return pickByDisposition(candidates, disp);
  }

  // Not trying to win — shed based on disposition spectrum
  return pickByDisposition(candidates, disp);
}
