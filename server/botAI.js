import { RANK_VALUE } from './game/constants.js';

/**
 * Bot AI for Spades - plays with realistic strategy:
 * - Smart bidding based on hand strength
 * - Covers partner's nil bids
 * - Tries to set opponents when possible
 * - Minimizes books (overtricks) when bid is already met
 * - Leads strategically
 */

// --- BIDDING ---

export function botBid(hand, partnerBid, opponentBids, gameState) {
  const spades = hand.filter(c => c.suit === 'S');
  const hearts = hand.filter(c => c.suit === 'H');
  const diamonds = hand.filter(c => c.suit === 'D');
  const clubs = hand.filter(c => c.suit === 'C');

  let tricks = 0;

  // Count sure spade tricks (high spades)
  const sortedSpades = [...spades].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  for (let i = 0; i < sortedSpades.length; i++) {
    const val = RANK_VALUE[sortedSpades[i].rank];
    if (val >= 14 - i) { // A is always good, K is good if you have 2+, Q if 3+, etc.
      tricks++;
    }
  }

  // Count off-suit winners (Aces and Kings in long suits)
  for (const suit of [hearts, diamonds, clubs]) {
    if (suit.length === 0) continue;
    const sorted = [...suit].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

    if (sorted.length > 0 && RANK_VALUE[sorted[0].rank] === 14) {
      tricks++; // Ace
      if (sorted.length > 1 && RANK_VALUE[sorted[1].rank] === 13) {
        tricks += 0.5; // King with Ace backup
      }
    } else if (sorted.length > 0 && RANK_VALUE[sorted[0].rank] === 13 && sorted.length >= 3) {
      tricks += 0.5; // Protected King
    }
  }

  // Count void/short suit ruff potential
  for (const suit of [hearts, diamonds, clubs]) {
    if (suit.length === 0 && spades.length > 2) {
      tricks += 1; // Void with spades to ruff
    } else if (suit.length === 1 && spades.length > 3) {
      tricks += 0.5; // Singleton with spade backup
    }
  }

  let bid = Math.round(tricks);

  // Consider nil - only with a weak hand and no high spades
  const highestSpade = sortedSpades.length > 0 ? RANK_VALUE[sortedSpades[0].rank] : 0;
  const totalHighCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length; // Q, K, A

  if (bid <= 1 && totalHighCards <= 1 && highestSpade <= 10 && spades.length <= 3) {
    // Consider nil - check if we have escape cards
    const hasLowCards = hand.filter(c => RANK_VALUE[c.rank] <= 6).length >= 8;
    if (hasLowCards) {
      return 0; // Go nil
    }
  }

  // Don't bid 0 unless going nil - minimum bid is 1
  bid = Math.max(1, bid);

  // Cap at 13
  bid = Math.min(13, bid);

  // If partner bid nil, bid slightly more aggressively (we need to cover)
  if (partnerBid === 0) {
    bid = Math.max(bid, 2);
    // Add a trick for nil cover support
    bid = Math.min(13, bid + 1);
  }

  return bid;
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

  // Determine opponent ids
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
  const partnerIsNil = partnerBid === 0;
  const botIsNil = botBidVal === 0;
  const oppBid = (opp1Bid || 0) + (opp2Bid || 0);
  const oppTricks = (tricksTaken[opp1Id] || 0) + (tricksTaken[opp2Id] || 0);
  const oppsNeedMore = oppBid > oppTricks;
  const opp1IsNil = opp1Bid === 0;
  const opp2IsNil = opp2Bid === 0;

  if (currentTrick.length === 0) {
    return botLead(hand, {
      needMore, partnerIsNil, botIsNil, spadesBroken,
      opp1IsNil, opp2IsNil, teamTricks, teamBid, oppTricks, oppBid,
      botTricks, botBidVal,
    });
  } else {
    return botFollow(hand, currentTrick, {
      needMore, partnerIsNil, botIsNil, spadesBroken,
      opp1IsNil, opp2IsNil, teamTricks, teamBid, oppTricks, oppBid,
      partnerId, players, botIndex, botTricks, botBidVal,
    });
  }
}

function botLead(hand, ctx) {
  const validCards = getValidLeads(hand, ctx.spadesBroken);

  // If bot is nil, lead lowest card possible
  if (ctx.botIsNil) {
    return pickLowest(validCards);
  }

  // If partner is nil, lead high cards to take tricks away from partner
  if (ctx.partnerIsNil) {
    // Lead high off-suit cards to win tricks and protect partner
    const offSuit = validCards.filter(c => c.suit !== 'S');
    if (offSuit.length > 0) {
      return pickHighest(offSuit);
    }
    return pickHighest(validCards);
  }

  // If opponent is nil, lead low cards of their short suit to force them to take
  if (ctx.opp1IsNil || ctx.opp2IsNil) {
    // Lead low cards to try to force the nil bidder to take a trick
    const offSuit = validCards.filter(c => c.suit !== 'S');
    if (offSuit.length > 0) {
      // Lead mid-range cards that are tricky to duck
      const midCards = offSuit.filter(c => RANK_VALUE[c.rank] >= 8 && RANK_VALUE[c.rank] <= 12);
      if (midCards.length > 0) return pickRandom(midCards);
      return pickLowest(offSuit);
    }
  }

  // Need more tricks - lead strong cards
  if (ctx.needMore) {
    // Lead Aces first (guaranteed winners off-suit)
    const aces = validCards.filter(c => c.rank === 'A' && c.suit !== 'S');
    if (aces.length > 0) return pickRandom(aces);

    // Lead from long suits where we have strength
    const suitGroups = groupBySuit(validCards);
    for (const [suit, cards] of Object.entries(suitGroups)) {
      if (suit === 'S') continue;
      if (cards.length >= 3 && RANK_VALUE[cards[0].rank] >= 13) {
        return cards[0]; // Lead King from long suit
      }
    }

    // Lead spades if we have high ones and need tricks
    const spades = validCards.filter(c => c.suit === 'S');
    if (spades.length > 0 && RANK_VALUE[spades[0].rank] >= 13) {
      return spades[0];
    }

    return pickHighest(validCards);
  }

  // Don't need tricks (at or above bid) - lead low, avoid books
  // Try to lose the lead
  const offSuit = validCards.filter(c => c.suit !== 'S');
  if (offSuit.length > 0) {
    // Lead low from shortest suit
    const suitGroups = groupBySuit(offSuit);
    let shortestSuit = null;
    let shortestLen = 14;
    for (const [suit, cards] of Object.entries(suitGroups)) {
      if (cards.length < shortestLen) {
        shortestLen = cards.length;
        shortestSuit = suit;
      }
    }
    if (shortestSuit) {
      return pickLowest(suitGroups[shortestSuit]);
    }
  }

  return pickLowest(validCards);
}

function botFollow(hand, currentTrick, ctx) {
  const ledSuit = currentTrick[0].card.suit;
  const hasLedSuit = hand.some(c => c.suit === ledSuit);
  const cardsOfSuit = hand.filter(c => c.suit === ledSuit);
  const nonSuitCards = hand.filter(c => c.suit !== ledSuit);

  // Determine who's currently winning
  const currentWinner = getCurrentWinner(currentTrick);
  const winnerIsPartner = currentWinner.playerId === ctx.partnerId;
  const winningValue = getEffectiveValue(currentWinner.card, ledSuit);

  // Bot is nil - try to lose
  if (ctx.botIsNil) {
    if (hasLedSuit) {
      // Play lowest card of led suit, but try to stay under
      const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
      if (underCards.length > 0) return pickHighest(underCards); // Highest that still loses
      return pickLowest(cardsOfSuit); // Forced to win potentially
    }
    // Can't follow suit - dump highest non-spade
    const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
    if (nonSpade.length > 0) return pickHighest(nonSpade);
    // Only spades left - play lowest spade (might trump and win, bad for nil)
    return pickLowest(hand);
  }

  // Partner is nil - try to cover them (win tricks they might take)
  if (ctx.partnerIsNil) {
    const partnerPlayed = currentTrick.find(t => t.playerId === ctx.partnerId);
    if (partnerPlayed) {
      // Partner already played - if partner is winning, we must overtake
      const partnerWinning = getCurrentWinner(currentTrick).playerId === ctx.partnerId;
      if (partnerWinning) {
        // Must beat partner's card
        if (hasLedSuit) {
          const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > getEffectiveValue(partnerPlayed.card, ledSuit));
          if (beaters.length > 0) return pickLowest(beaters);
        }
        // Trump to save partner
        if (!hasLedSuit) {
          const spades = hand.filter(c => c.suit === 'S');
          if (spades.length > 0 && ledSuit !== 'S') {
            return pickLowest(spades);
          }
        }
      }
    }
  }

  // Try to break nil of opponent
  if ((ctx.opp1IsNil || ctx.opp2IsNil) && currentTrick.length === 3) {
    // We're last to play - if nil opponent hasn't played yet this shouldn't happen
    // But if they have and are currently losing, don't help them
  }

  if (hasLedSuit) {
    // Must follow suit
    if (ctx.needMore) {
      // Need tricks - try to win
      if (winnerIsPartner && currentTrick.length === 3) {
        // Partner is winning and we're last - play low
        return pickLowest(cardsOfSuit);
      }
      const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
      if (beaters.length > 0) {
        // Win with the lowest card that beats current winner
        return pickLowest(beaters);
      }
      // Can't win - dump lowest
      return pickLowest(cardsOfSuit);
    } else {
      // Don't need tricks - play low
      if (winnerIsPartner) {
        return pickLowest(cardsOfSuit); // Let partner have it
      }
      // Try to stay under
      const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
      if (underCards.length > 0) return pickHighest(underCards);
      return pickLowest(cardsOfSuit); // Forced to potentially win
    }
  }

  // Can't follow suit
  if (ctx.needMore) {
    // Trump with lowest spade to win
    const spades = hand.filter(c => c.suit === 'S');
    const currentHighTrump = currentTrick
      .filter(t => t.card.suit === 'S')
      .reduce((max, t) => Math.max(max, RANK_VALUE[t.card.rank]), 0);

    if (spades.length > 0 && ledSuit !== 'S') {
      if (winnerIsPartner && currentTrick.length >= 2) {
        // Partner winning - don't waste a trump, discard low instead
        const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
        if (nonSpade.length > 0) return pickLowest(nonSpade);
      }
      const beatingSpades = spades.filter(c => RANK_VALUE[c.rank] > currentHighTrump);
      if (beatingSpades.length > 0) return pickLowest(beatingSpades);
    }
    // Discard lowest card
    const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');
    if (nonSpade.length > 0) return pickLowest(nonSpade);
    return pickLowest(hand);
  } else {
    // Don't need tricks - discard highest cards to get rid of dangerous winners
    const nonSpade = hand.filter(c => c.suit !== 'S' && c.suit !== ledSuit);
    if (nonSpade.length > 0) return pickHighest(nonSpade); // Dump high off-suit
    // Only spades - play lowest
    return pickLowest(hand);
  }
}

// --- HELPERS ---

function getValidLeads(hand, spadesBroken) {
  if (spadesBroken) return hand;
  const nonSpades = hand.filter(c => c.suit !== 'S');
  if (nonSpades.length === 0) return hand; // All spades, forced to lead spade
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
  if (card.suit === 'S' && ledSuit !== 'S') return 100 + RANK_VALUE[card.rank]; // Trumps
  if (card.suit === ledSuit) return RANK_VALUE[card.rank];
  return 0; // Off-suit non-trump
}

function groupBySuit(cards) {
  const groups = {};
  for (const c of cards) {
    if (!groups[c.suit]) groups[c.suit] = [];
    groups[c.suit].push(c);
  }
  // Sort each group by value descending
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
