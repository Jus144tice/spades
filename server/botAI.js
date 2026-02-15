import { RANK_VALUE } from './game/constants.js';

/**
 * Bot AI for Spades - plays with realistic strategy:
 * - Smart bidding: aces=1, kings=0.5, spade length, void/short suit ruffing, nil detection
 * - Nil protection mode when partner bids nil
 * - Opponent nil breaking tactics
 * - Position-aware play (2nd seat vs 4th seat)
 * - Bag avoidance when bid is met
 */

// --- BIDDING ---

export function botBid(hand, partnerBid, opponentBids, gameState) {
  const spades = hand.filter(c => c.suit === 'S');
  const hearts = hand.filter(c => c.suit === 'H');
  const diamonds = hand.filter(c => c.suit === 'D');
  const clubs = hand.filter(c => c.suit === 'C');
  const suits = { H: hearts, D: diamonds, C: clubs };

  const sortedSpades = [...spades].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

  // --- Nil evaluation (do this first) ---
  const nilViable = evaluateNil(hand, sortedSpades, spades, suits, partnerBid);
  if (nilViable) return 0;

  let tricks = 0;

  // --- Count spade tricks ---
  // High spades are very reliable. With more spades, mid spades become winners too.
  const spadeCount = spades.length;
  for (let i = 0; i < sortedSpades.length; i++) {
    const val = RANK_VALUE[sortedSpades[i].rank];
    if (val === 14) {
      tricks += 1; // Ace of spades always wins
    } else if (val === 13) {
      tricks += 0.9; // King of spades almost always wins
    } else if (val === 12) {
      // Queen is good with 3+ spades or with A/K above it
      if (i >= 2 || spadeCount >= 3) tricks += 0.7;
      else tricks += 0.3;
    } else if (val === 11) {
      // Jack needs length
      if (spadeCount >= 4) tricks += 0.5;
      else if (spadeCount >= 3 && i >= 2) tricks += 0.3;
    } else if (val === 10 && spadeCount >= 5) {
      tricks += 0.3; // 10 of spades in a long suit
    }
  }

  // Extra long spade tricks (5th+ spade in a long suit often wins)
  if (spadeCount >= 5) tricks += (spadeCount - 4) * 0.4;

  // --- Count off-suit tricks ---
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const topVal = RANK_VALUE[sorted[0].rank];
    const len = sorted.length;

    if (topVal === 14) {
      tricks += 1; // Ace always wins
      if (len >= 2 && RANK_VALUE[sorted[1].rank] === 13) {
        tricks += 0.8; // King behind Ace is very strong
        if (len >= 3 && RANK_VALUE[sorted[2].rank] === 12) {
          tricks += 0.5; // Q behind A-K in 3+ suit
        }
      }
    } else if (topVal === 13) {
      // Lone King or short King - risky
      if (len === 1) tricks += 0.3; // Might get trumped or Ace is out
      else if (len === 2) tricks += 0.4;
      else tricks += 0.5; // Protected King in long suit
    } else if (topVal === 12 && len >= 3) {
      tricks += 0.2; // Queen in long suit, marginal
    }
  }

  // --- Void/short suit ruffing potential ---
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0 && spadeCount >= 1) {
      // Void = guaranteed ruff if suit is led
      tricks += Math.min(spadeCount - countHighSpades(sortedSpades), 1.0);
      // Can ruff at least once per void
    } else if (suitCards.length === 1 && spadeCount >= 2) {
      tricks += 0.5; // Singleton = likely ruff after one round
    } else if (suitCards.length === 2 && spadeCount >= 3) {
      tricks += 0.2; // Doubleton with good spade backup
    }
  }

  let bid = Math.round(tricks);

  // --- Adjustments based on partner/opponent bids ---

  // If partner bid nil, we need to cover - bid more aggressively
  if (partnerBid === 0) {
    bid = Math.max(bid, 3);
    // We'll be leading a lot and trying to win tricks - add confidence
    bid = Math.min(13, bid + 1);
  }

  // If combined team bid feels too high relative to 13, trim slightly
  if (partnerBid !== undefined && partnerBid !== null && partnerBid > 0) {
    const combinedBid = bid + partnerBid;
    if (combinedBid > 10) {
      // Be conservative - trim back on marginal tricks
      bid = Math.max(1, bid - 1);
    }
  }

  // Don't bid 0 unless going nil - minimum bid is 1
  bid = Math.max(1, bid);
  bid = Math.min(13, bid);

  return bid;
}

function evaluateNil(hand, sortedSpades, spades, suits, partnerBid) {
  const spadeCount = spades.length;
  const highestSpade = sortedSpades.length > 0 ? RANK_VALUE[sortedSpades[0].rank] : 0;

  // Disqualifiers for nil:
  // - Any spade Q or higher makes nil very risky
  if (highestSpade >= 12) return false;
  // - Jack of spades with 3+ spades is too risky
  if (highestSpade === 11 && spadeCount >= 3) return false;

  // Count high cards (cards that are hard to duck under)
  const highCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length; // Q, K, A
  if (highCards >= 2) return false; // Too many high cards

  // Count medium cards (J, 10) - these are risky
  const medCards = hand.filter(c => RANK_VALUE[c.rank] >= 10 && RANK_VALUE[c.rank] <= 11).length;
  if (highCards + medCards >= 4) return false; // Too much middle strength

  // Check off-suit vulnerability: any Ace or lone King is a nil killer
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    if (RANK_VALUE[sorted[0].rank] === 14) return false; // Off-suit Ace - can't duck
    if (RANK_VALUE[sorted[0].rank] === 13 && suitCards.length <= 2) return false; // Short King
  }

  // Check for enough low cards to safely duck
  const lowCards = hand.filter(c => RANK_VALUE[c.rank] <= 7).length;
  if (lowCards < 6) return false;

  // Prefer nil when partner has bid a healthy amount (3+)
  // so they can protect us
  if (partnerBid !== undefined && partnerBid !== null && partnerBid >= 3) {
    return true; // Partner is strong, we can go nil
  }

  // Even without partner info, go nil if hand is very weak
  if (lowCards >= 9 && highCards === 0 && highestSpade <= 8) {
    return true;
  }

  // If partner hasn't bid yet, be more conservative about nil
  if (partnerBid === undefined || partnerBid === null) {
    // Only nil with a truly awful hand
    return lowCards >= 8 && highCards === 0 && medCards <= 1 && highestSpade <= 9;
  }

  // Partner bid but bid low (1-2) - only nil if hand is weak enough
  return lowCards >= 8 && highCards === 0 && highestSpade <= 9;
}

function countHighSpades(sortedSpades) {
  let count = 0;
  for (const s of sortedSpades) {
    if (RANK_VALUE[s.rank] >= 12) count++;
    else break;
  }
  return count;
}

// --- CARD PLAY ---

export function botPlayCard(hand, gameState, botId) {
  const { currentTrick, bids, tricksTaken, players, spadesBroken } = gameState;
  const botIndex = players.findIndex(p => p.id === botId);
  const partnerIndex = (botIndex + 2) % 4;
  const partnerId = players[partnerIndex].id;
  const partnerBid = bids[partnerId];
  const botBidVal = bids[botId];
  const botTricks = tricksTaken[botId] || 0;
  const partnerTricks = tricksTaken[partnerId] || 0;

  const opp1Index = (botIndex + 1) % 4;
  const opp2Index = (botIndex + 3) % 4;
  const opp1Id = players[opp1Index].id;
  const opp2Id = players[opp2Index].id;
  const opp1Bid = bids[opp1Id];
  const opp2Bid = bids[opp2Id];

  // Team analysis
  const teamBid = (botBidVal || 0) + (partnerBid === 0 ? 0 : partnerBid || 0);
  const teamTricks = botTricks + partnerTricks;
  const needMore = teamBid > teamTricks;
  const tricksNeeded = teamBid - teamTricks;
  const partnerIsNil = partnerBid === 0;
  const botIsNil = botBidVal === 0;
  const oppBid = (opp1Bid || 0) + (opp2Bid || 0);
  const oppTricks = (tricksTaken[opp1Id] || 0) + (tricksTaken[opp2Id] || 0);
  const opp1IsNil = opp1Bid === 0;
  const opp2IsNil = opp2Bid === 0;
  const seatPosition = currentTrick.length; // 0=lead, 1=2nd, 2=3rd, 3=last

  const ctx = {
    needMore, tricksNeeded, partnerIsNil, botIsNil, spadesBroken,
    opp1IsNil, opp2IsNil, teamTricks, teamBid, oppTricks, oppBid,
    botTricks, botBidVal, partnerId, players, botIndex,
    opp1Id, opp2Id, seatPosition, partnerBid, partnerTricks,
  };

  if (currentTrick.length === 0) {
    return botLead(hand, ctx);
  } else {
    return botFollow(hand, currentTrick, ctx);
  }
}

// --- LEADING ---

function botLead(hand, ctx) {
  const validCards = getValidLeads(hand, ctx.spadesBroken);

  // --- Bot is nil: lead lowest to avoid winning ---
  if (ctx.botIsNil) {
    return leadAsNil(validCards);
  }

  // --- Partner is nil: lead to protect partner ---
  if (ctx.partnerIsNil) {
    return leadToProtectNil(validCards, hand, ctx);
  }

  // --- Opponent is nil: try to bust them ---
  if (ctx.opp1IsNil || ctx.opp2IsNil) {
    return leadToBustNil(validCards, ctx);
  }

  // --- Normal play ---
  if (ctx.needMore) {
    return leadWhenNeedingTricks(validCards, hand, ctx);
  } else {
    return leadWhenAvoidingBags(validCards, hand, ctx);
  }
}

function leadAsNil(validCards) {
  // Lead from our longest suit with lowest card to minimize winning chance
  const groups = groupBySuit(validCards);
  let bestCard = null;
  let bestLen = -1;

  for (const [suit, cards] of Object.entries(groups)) {
    const lowest = cards[cards.length - 1]; // cards sorted desc, last is lowest
    // Prefer long suits (more escape opportunities) and low cards
    if (cards.length > bestLen ||
        (cards.length === bestLen && RANK_VALUE[lowest.rank] < RANK_VALUE[bestCard.rank])) {
      bestCard = lowest;
      bestLen = cards.length;
    }
  }
  return bestCard || pickLowest(validCards);
}

function leadToProtectNil(validCards, hand, ctx) {
  // Strategy: Win tricks with high cards so partner doesn't have to.
  // Lead Aces (guaranteed win), then Kings, then high spades.
  // Prefer leading from SHORT off-suits so we can ruff later to protect partner.

  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');

  if (offSuit.length > 0) {
    // Lead Aces first - guaranteed to win and protect partner
    const aces = offSuit.filter(c => c.rank === 'A');
    if (aces.length > 0) {
      // Lead ace from shortest suit (to void quickly for future ruffing)
      return pickFromShortestSuit(aces, hand);
    }

    // Lead Kings
    const kings = offSuit.filter(c => c.rank === 'K');
    if (kings.length > 0) {
      return pickFromShortestSuit(kings, hand);
    }

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
    if (shortestSuit) {
      return groups[shortestSuit][0]; // Highest from shortest suit
    }

    return pickHighest(offSuit);
  }

  // Only spades left - lead highest to pull out opponent spades
  // This protects partner from getting trumped later
  return pickHighest(spades);
}

function leadToBustNil(validCards, ctx) {
  // Lead mid-range cards that are hard to duck under
  // Ideal: 8-J range cards that might catch a nil bidder
  const offSuit = validCards.filter(c => c.suit !== 'S');

  if (offSuit.length > 0) {
    // Lead cards in the 8-J range - hard to duck
    const midCards = offSuit.filter(c => {
      const v = RANK_VALUE[c.rank];
      return v >= 8 && v <= 11;
    });
    if (midCards.length > 0) return pickRandom(midCards);

    // If no mid cards, lead low-medium to force plays
    const lowMid = offSuit.filter(c => RANK_VALUE[c.rank] >= 6 && RANK_VALUE[c.rank] <= 9);
    if (lowMid.length > 0) return pickRandom(lowMid);

    return pickLowest(offSuit); // At least make them play
  }

  // Leading spades against nil bidder - lead low spades
  // Nil bidder has to play above us or dump
  return pickLowest(validCards);
}

function leadWhenNeedingTricks(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');

  // Lead Aces first - guaranteed winners
  const aces = offSuit.filter(c => c.rank === 'A');
  if (aces.length > 0) return pickRandom(aces);

  // Lead A-K from same suit (cash the King knowing Ace already won or vice versa)
  const groups = groupBySuit(offSuit);
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 2 && RANK_VALUE[cards[0].rank] === 13) {
      // King-high in a suit - lead it to set up
      return cards[0];
    }
  }

  // Lead from long suits with strength (4+ cards with Q+)
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 4 && RANK_VALUE[cards[0].rank] >= 12) {
      return cards[0]; // Lead high from long suit to establish
    }
  }

  // Lead high spades to pull trumps if we have spade tricks to cash
  if (spades.length > 0) {
    const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 13);
    if (highSpades.length > 0) {
      return highSpades[0]; // Lead A or K of spades
    }
  }

  // Lead from short suits to set up a void for ruffing
  if (offSuit.length > 0) {
    let shortestSuit = null;
    let shortestLen = 14;
    for (const [suit, cards] of Object.entries(groups)) {
      const suitLen = hand.filter(c => c.suit === suit).length;
      if (suitLen > 0 && suitLen < shortestLen && suitLen <= 2) {
        shortestLen = suitLen;
        shortestSuit = suit;
      }
    }
    if (shortestSuit) {
      // Lead low from short suit to void it
      return pickLowest(groups[shortestSuit]);
    }
  }

  // Default: lead highest available
  if (offSuit.length > 0) return pickHighest(offSuit);
  return pickHighest(validCards);
}

function leadWhenAvoidingBags(validCards, hand, ctx) {
  // We've met our bid - try to lose the lead
  const offSuit = validCards.filter(c => c.suit !== 'S');

  if (offSuit.length > 0) {
    // Lead low from shortest off-suit to get rid of the lead
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
    if (shortestSuit) {
      return pickLowest(groups[shortestSuit]);
    }
    return pickLowest(offSuit);
  }

  // Only spades - lead lowest
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
  const winnerIsOpp = !winnerIsPartner;
  const winningValue = getEffectiveValue(currentWinner.card, ledSuit);

  // --- Bot is nil: try to lose ---
  if (ctx.botIsNil) {
    return followAsNil(hand, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, currentTrick);
  }

  // --- Partner is nil: protect them ---
  if (ctx.partnerIsNil) {
    const nilCard = followToProtectNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (nilCard) return nilCard;
    // Fall through to normal play if no nil-specific action needed
  }

  // --- Opponent is nil: try to bust them ---
  if ((ctx.opp1IsNil || ctx.opp2IsNil)) {
    const bustCard = followToBustNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (bustCard) return bustCard;
    // Fall through to normal play
  }

  // --- Normal following ---
  if (hasLedSuit) {
    return followSuitNormal(cardsOfSuit, ledSuit, winningValue, winnerIsPartner, ctx);
  } else {
    return discardNormal(hand, nonSuitCards, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx);
  }
}

function followAsNil(hand, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, currentTrick) {
  if (hasLedSuit) {
    // Play the highest card that still loses
    const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
    if (underCards.length > 0) return pickHighest(underCards); // Highest that still ducks
    // All our cards beat the current winner - play lowest to minimize damage
    return pickLowest(cardsOfSuit);
  }

  // Can't follow suit - dump our highest non-spade cards (get rid of dangerous cards)
  const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
  if (nonSpade.length > 0) return pickHighest(nonSpade);

  // Only spades left - play lowest (might trump and win, which is bad)
  return pickLowest(hand);
}

function followToProtectNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx) {
  const partnerPlayed = currentTrick.find(t => t.playerId === ctx.partnerId);

  if (partnerPlayed) {
    const partnerIsWinning = getCurrentWinner(currentTrick).playerId === ctx.partnerId;

    if (partnerIsWinning) {
      // Partner is winning - we MUST overtake them to save their nil
      if (hasLedSuit) {
        const partnerCardValue = getEffectiveValue(partnerPlayed.card, ledSuit);
        const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > partnerCardValue);
        if (beaters.length > 0) return pickLowest(beaters); // Beat partner with minimum
      }
      // Can't follow suit - trump to save partner
      if (!hasLedSuit && ledSuit !== 'S') {
        const spades = hand.filter(c => c.suit === 'S');
        const currentHighTrump = currentTrick
          .filter(t => t.card.suit === 'S')
          .reduce((max, t) => Math.max(max, RANK_VALUE[t.card.rank]), 0);
        const beatingSpades = spades.filter(c => RANK_VALUE[c.rank] > currentHighTrump);
        if (beatingSpades.length > 0) return pickLowest(beatingSpades);
        if (spades.length > 0 && currentHighTrump === 0) return pickLowest(spades);
      }
    }
  } else {
    // Partner hasn't played yet - play high to try to win before partner has to play
    // (especially if we're 2nd seat, we want to take the trick)
    if (ctx.seatPosition <= 1) {
      if (hasLedSuit) {
        // Play high to win and take the trick from partner
        const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
        if (beaters.length > 0) return pickHighest(beaters);
      }
    }
  }

  return null; // No nil-specific action, fall through to normal
}

function followToBustNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx) {
  // Check if nil bidder is in this trick
  const nilOppId = ctx.opp1IsNil ? ctx.opp1Id : (ctx.opp2IsNil ? ctx.opp2Id : null);
  if (!nilOppId) return null;

  const nilPlayerPlayed = currentTrick.find(t => t.playerId === nilOppId);

  if (nilPlayerPlayed) {
    // Nil bidder already played - if they're winning, let them win (busts nil)
    const nilIsWinning = getCurrentWinner(currentTrick).playerId === nilOppId;
    if (nilIsWinning) {
      // Play low - let the nil bidder keep the trick
      if (hasLedSuit) {
        const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < getEffectiveValue(nilPlayerPlayed.card, ledSuit));
        if (underCards.length > 0) return pickLowest(underCards);
      }
      // Discard low
      if (!hasLedSuit) {
        const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
        if (nonSpade.length > 0) return pickLowest(nonSpade);
        return pickLowest(hand);
      }
    }
  } else {
    // Nil bidder hasn't played yet - if we're before them, play strategically
    // Play a medium card that's hard to duck under
    if (hasLedSuit && ctx.seatPosition <= 1) {
      const midCards = cardsOfSuit.filter(c => {
        const v = RANK_VALUE[c.rank];
        return v >= 7 && v <= 11;
      });
      if (midCards.length > 0) return pickRandom(midCards);
    }
  }

  return null; // No bust-specific action
}

function followSuitNormal(cardsOfSuit, ledSuit, winningValue, winnerIsPartner, ctx) {
  if (ctx.needMore) {
    // Need tricks - try to win
    if (winnerIsPartner && ctx.seatPosition === 3) {
      // Partner is winning and we're last to play - play lowest (let partner have it)
      return pickLowest(cardsOfSuit);
    }
    if (winnerIsPartner && ctx.seatPosition === 2 && !ctx.partnerIsNil) {
      // Partner winning, we're 3rd, one more to play. If partner's card is strong, duck.
      if (winningValue >= RANK_VALUE['Q']) {
        return pickLowest(cardsOfSuit); // Partner has a good card, play low
      }
    }

    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) {
      // Win with cheapest winning card
      return pickLowest(beaters);
    }
    // Can't win - dump lowest
    return pickLowest(cardsOfSuit);

  } else {
    // Met our bid - avoid winning tricks (bag avoidance)
    if (winnerIsPartner) {
      return pickLowest(cardsOfSuit); // Let partner have it
    }
    // Try to play under the winning card
    const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
    if (underCards.length > 0) return pickHighest(underCards); // Highest losing card
    return pickLowest(cardsOfSuit); // Forced to potentially win
  }
}

function discardNormal(hand, nonSuitCards, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx) {
  const spades = hand.filter(c => c.suit === 'S');
  const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');

  if (ctx.needMore) {
    // Need tricks - consider trumping
    if (winnerIsPartner && ctx.seatPosition >= 2) {
      // Partner is winning - don't waste a trump, discard instead
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      // Only spades left - play lowest to conserve
      return pickLowest(hand);
    }

    // Try to trump to win the trick
    if (spades.length > 0 && ledSuit !== 'S') {
      const currentHighTrump = currentTrick
        .filter(t => t.card.suit === 'S')
        .reduce((max, t) => Math.max(max, RANK_VALUE[t.card.rank]), 0);
      const beatingSpades = spades.filter(c => RANK_VALUE[c.rank] > currentHighTrump);
      if (beatingSpades.length > 0) return pickLowest(beatingSpades);
      // Can't beat existing trump - discard
    }

    // Can't trump or not worth it - discard
    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);

  } else {
    // Met bid - discard high dangerous cards to avoid future bag wins
    if (nonSpade.length > 0) {
      // Dump highest off-suit cards from short suits
      return dumpCard(nonSpade, hand, ctx);
    }
    return pickLowest(hand);
  }
}

// Smart discard: dump high cards from short suits to create voids or shed danger
function dumpCard(candidates, hand, ctx) {
  // If we don't need more tricks, dump the highest dangerous card
  if (!ctx.needMore) {
    return pickHighest(candidates);
  }

  // If we need tricks, dump from shortest suit (to create a void for future ruffing)
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
    return pickLowest(groups[shortestSuit]); // Low from shortest suit
  }
  return pickLowest(candidates);
}

// --- HELPERS ---

function getValidLeads(hand, spadesBroken) {
  if (spadesBroken) return hand;
  const nonSpades = hand.filter(c => c.suit !== 'S');
  if (nonSpades.length === 0) return hand;
  return nonSpades;
}

function getCurrentWinner(trick) {
  const ledSuit = trick[0].card.suit;
  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const play = trick[i];
    const wIsSpade = winner.card.suit === 'S';
    const cIsSpade = play.card.suit === 'S';

    if (cIsSpade && !wIsSpade) {
      winner = play;
    } else if (cIsSpade && wIsSpade) {
      if (RANK_VALUE[play.card.rank] > RANK_VALUE[winner.card.rank]) winner = play;
    } else if (play.card.suit === ledSuit && winner.card.suit === ledSuit) {
      if (RANK_VALUE[play.card.rank] > RANK_VALUE[winner.card.rank]) winner = play;
    }
  }

  return winner;
}

function getEffectiveValue(card, ledSuit) {
  if (card.suit === 'S' && ledSuit !== 'S') return 100 + RANK_VALUE[card.rank];
  if (card.suit === ledSuit) return RANK_VALUE[card.rank];
  return 0;
}

function groupBySuit(cards) {
  const groups = {};
  for (const c of cards) {
    if (!groups[c.suit]) groups[c.suit] = [];
    groups[c.suit].push(c);
  }
  for (const suit of Object.keys(groups)) {
    groups[suit].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  }
  return groups;
}

function pickHighest(cards) {
  return cards.reduce((best, c) =>
    RANK_VALUE[c.rank] > RANK_VALUE[best.rank] ? c : best
  );
}

function pickLowest(cards) {
  return cards.reduce((best, c) =>
    RANK_VALUE[c.rank] < RANK_VALUE[best.rank] ? c : best
  );
}

function pickRandom(cards) {
  return cards[Math.floor(Math.random() * cards.length)];
}

// Pick a card from the shortest suit (by looking at full hand)
function pickFromShortestSuit(candidates, hand) {
  if (candidates.length === 1) return candidates[0];

  let best = candidates[0];
  let bestLen = hand.filter(c => c.suit === best.suit).length;

  for (let i = 1; i < candidates.length; i++) {
    const suitLen = hand.filter(c => c.suit === candidates[i].suit).length;
    if (suitLen < bestLen) {
      best = candidates[i];
      bestLen = suitLen;
    }
  }
  return best;
}
