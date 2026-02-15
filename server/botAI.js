import { RANK_VALUE } from './game/constants.js';

/**
 * Bot AI for Spades - plays with realistic strategy:
 * - Smart bidding: aces=1, kings=0.5, spade length, void/short suit ruffing, nil detection
 * - Nil protection mode when partner bids nil
 * - Opponent nil breaking tactics
 * - Position-aware play (2nd seat vs 4th seat)
 * - Dynamic duck/set disposition based on books remaining, hand analysis, and partner signals
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
  const spadeCount = spades.length;
  for (let i = 0; i < sortedSpades.length; i++) {
    const val = RANK_VALUE[sortedSpades[i].rank];
    if (val === 14) {
      tricks += 1;
    } else if (val === 13) {
      tricks += 0.9;
    } else if (val === 12) {
      if (i >= 2 || spadeCount >= 3) tricks += 0.7;
      else tricks += 0.3;
    } else if (val === 11) {
      if (spadeCount >= 4) tricks += 0.5;
      else if (spadeCount >= 3 && i >= 2) tricks += 0.3;
    } else if (val === 10 && spadeCount >= 5) {
      tricks += 0.3;
    }
  }

  if (spadeCount >= 5) tricks += (spadeCount - 4) * 0.4;

  // --- Count off-suit tricks ---
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const topVal = RANK_VALUE[sorted[0].rank];
    const len = sorted.length;

    if (topVal === 14) {
      tricks += 1;
      if (len >= 2 && RANK_VALUE[sorted[1].rank] === 13) {
        tricks += 0.8;
        if (len >= 3 && RANK_VALUE[sorted[2].rank] === 12) {
          tricks += 0.5;
        }
      }
    } else if (topVal === 13) {
      if (len === 1) tricks += 0.3;
      else if (len === 2) tricks += 0.4;
      else tricks += 0.5;
    } else if (topVal === 12 && len >= 3) {
      tricks += 0.2;
    }
  }

  // --- Void/short suit ruffing potential ---
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0 && spadeCount >= 1) {
      tricks += Math.min(spadeCount - countHighSpades(sortedSpades), 1.0);
    } else if (suitCards.length === 1 && spadeCount >= 2) {
      tricks += 0.5;
    } else if (suitCards.length === 2 && spadeCount >= 3) {
      tricks += 0.2;
    }
  }

  let bid = Math.round(tricks);

  // If partner bid nil, we need to cover
  if (partnerBid === 0) {
    bid = Math.max(bid, 3);
    bid = Math.min(13, bid + 1);
  }

  // Trim if combined team bid is too aggressive
  if (partnerBid !== undefined && partnerBid !== null && partnerBid > 0) {
    const combinedBid = bid + partnerBid;
    if (combinedBid > 10) {
      bid = Math.max(1, bid - 1);
    }
  }

  bid = Math.max(1, bid);
  bid = Math.min(13, bid);

  return bid;
}

function evaluateNil(hand, sortedSpades, spades, suits, partnerBid) {
  const spadeCount = spades.length;
  const highestSpade = sortedSpades.length > 0 ? RANK_VALUE[sortedSpades[0].rank] : 0;

  if (highestSpade >= 12) return false;
  if (highestSpade === 11 && spadeCount >= 3) return false;

  const highCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length;
  if (highCards >= 2) return false;

  const medCards = hand.filter(c => RANK_VALUE[c.rank] >= 10 && RANK_VALUE[c.rank] <= 11).length;
  if (highCards + medCards >= 4) return false;

  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    if (RANK_VALUE[sorted[0].rank] === 14) return false;
    if (RANK_VALUE[sorted[0].rank] === 13 && suitCards.length <= 2) return false;
  }

  const lowCards = hand.filter(c => RANK_VALUE[c.rank] <= 7).length;
  if (lowCards < 6) return false;

  if (partnerBid !== undefined && partnerBid !== null && partnerBid >= 3) {
    return true;
  }

  if (lowCards >= 9 && highCards === 0 && highestSpade <= 8) {
    return true;
  }

  if (partnerBid === undefined || partnerBid === null) {
    return lowCards >= 8 && highCards === 0 && medCards <= 1 && highestSpade <= 9;
  }

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

// --- DISPOSITION SYSTEM ---
// Returns a value: positive = SET mode (try to take tricks from opponents)
//                  negative = DUCK mode (avoid taking extra tricks / bags)
//                  0 = neutral

function calculateDisposition(hand, ctx) {
  const totalBids = ctx.teamBid + ctx.oppBid;
  const booksRemaining = 13 - totalBids; // "free" tricks nobody bid on

  // --- Base disposition from books remaining ---
  // <=2 books: lean SET, >=4 books: lean DUCK, 3: neutral
  let disposition = 0;
  if (booksRemaining <= 1) disposition = 2;
  else if (booksRemaining === 2) disposition = 1;
  else if (booksRemaining === 3) disposition = 0;
  else if (booksRemaining === 4) disposition = -1;
  else disposition = -2; // 5+ books = heavy duck

  // --- If opponents already made their bid, can't set them ---
  if (ctx.oppTricks >= ctx.oppBid) {
    // Can't set opponents anymore - switch to duck to avoid bags
    disposition = Math.min(disposition, -1);
  }

  // --- Look at current bag trajectory ---
  // If our team already has extra tricks (bags accumulating), lean toward SET
  // because we're taking bags anyway, might as well try to set opponents
  const teamBags = Math.max(0, ctx.teamTricks - ctx.teamBid);
  if (teamBags >= 2) {
    // Already have bags - might as well play aggressively to try to set
    disposition += 1;
  } else if (teamBags >= 1 && ctx.oppTricks < ctx.oppBid) {
    // We have a bag and opponents still need tricks - slight set lean
    disposition += 0.5;
  }

  // --- Project guaranteed future winners (bags we know are coming) ---
  const guaranteedFutureWins = countGuaranteedWinners(hand);
  const projectedBags = teamBags + guaranteedFutureWins;
  if (ctx.teamTricks >= ctx.teamBid && projectedBags >= 2) {
    // We've made our bid and have guaranteed future bags coming
    // Lean into set mode since we're getting bags anyway
    disposition += 1;
  }

  // --- Partner signals (inferred from trick counts) ---
  // If partner has taken way more than their share, they're playing aggressively (SET)
  if (ctx.partnerBid > 0) {
    const partnerExcess = ctx.partnerTricks - ctx.partnerBid;
    if (partnerExcess >= 2) {
      // Partner is taking lots of extra tricks - they're in set mode
      disposition += 1;
    } else if (partnerExcess < 0 && ctx.teamTricks >= ctx.teamBid) {
      // Team made bid but partner is under their individual bid
      // Bot is carrying - partner might be ducking
      disposition -= 0.5;
    }
  }

  // --- If we haven't made our own bid yet, disposition doesn't matter as much ---
  // (we need to focus on making bid first)
  // But it still affects how aggressively we pursue tricks beyond our need

  return disposition;
}

function countGuaranteedWinners(hand) {
  let count = 0;
  const spades = hand.filter(c => c.suit === 'S')
    .sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

  // Ace of spades is always a winner
  if (spades.length > 0 && RANK_VALUE[spades[0].rank] === 14) {
    count++;
    // King of spades behind Ace is also guaranteed
    if (spades.length > 1 && RANK_VALUE[spades[1].rank] === 13) {
      count++;
    }
  }

  // Off-suit Aces are near-guaranteed (could be trumped, but usually win)
  for (const suit of ['H', 'D', 'C']) {
    const suitCards = hand.filter(c => c.suit === suit);
    if (suitCards.length > 0) {
      const highest = suitCards.reduce((best, c) =>
        RANK_VALUE[c.rank] > RANK_VALUE[best.rank] ? c : best
      );
      if (RANK_VALUE[highest.rank] === 14) count += 0.7; // might get trumped
    }
  }

  return count;
}

// --- OPPONENT DISPOSITION ESTIMATION ---
// Guess whether opponents are in SET mode (trying to set us) or DUCK mode (avoiding bags)
// Returns: positive = opponents likely setting, negative = opponents likely ducking

function estimateOpponentDisposition(currentTrick, ctx) {
  const totalBids = ctx.teamBid + ctx.oppBid;
  const booksRemaining = 13 - totalBids;

  // --- Same baseline as our own disposition ---
  let oppDisp = 0;
  if (booksRemaining <= 1) oppDisp = 2;
  else if (booksRemaining === 2) oppDisp = 1;
  else if (booksRemaining === 3) oppDisp = 0;
  else if (booksRemaining === 4) oppDisp = -1;
  else oppDisp = -2;

  // --- If we already made our bid, opponents know they can't set us ---
  if (ctx.teamTricks >= ctx.teamBid) {
    oppDisp = Math.min(oppDisp, -1);
  }

  // --- Opponents already have bags → they're leaning into set ---
  const oppBags = Math.max(0, ctx.oppTricks - ctx.oppBid);
  if (oppBags >= 2) {
    oppDisp += 1.5; // Significant bags = they're going for the set
  } else if (oppBags >= 1 && ctx.teamTricks < ctx.teamBid) {
    oppDisp += 0.5; // One bag and we haven't made bid = slight set lean
  }

  // --- Opponents made their bid early (lots of tricks left) ---
  // Total tricks played so far
  const totalTricksPlayed = ctx.teamTricks + ctx.oppTricks;
  const tricksLeft = 13 - totalTricksPlayed;
  if (ctx.oppTricks >= ctx.oppBid && tricksLeft >= 4) {
    // Made bid with many tricks to go = they're in set mode
    oppDisp += 1;
  }

  // --- Read opponent plays in the CURRENT trick ---
  for (const play of currentTrick) {
    const isOpp = play.playerId === ctx.opp1Id || play.playerId === ctx.opp2Id;
    if (!isOpp) continue;

    // Did opponent trump a non-spade lead?
    if (currentTrick.length > 0 && currentTrick[0].card.suit !== 'S' && play.card.suit === 'S') {
      // Opponent trumped - strong set signal (they're spending spades to take tricks)
      oppDisp += 1.5;

      // Extra weight if they trumped over a high card (A or K) that we or partner led
      const ledCard = currentTrick[0].card;
      const leaderIsUs = currentTrick[0].playerId === ctx.partnerId ||
        currentTrick[0].playerId === ctx.players[ctx.botIndex]?.id;
      if (leaderIsUs && RANK_VALUE[ledCard.rank] >= 13) {
        // They trumped our Ace or King - very aggressive set behavior
        oppDisp += 1;
      }
    }

    // Did opponent discard off-suit (not trump) when they could have?
    if (currentTrick.length > 0) {
      const ledSuit = currentTrick[0].card.suit;
      if (play.card.suit !== ledSuit && play.card.suit !== 'S' && ledSuit !== 'S') {
        // Opponent couldn't follow suit but chose NOT to trump = duck signal
        oppDisp -= 1;
      }
    }
  }

  return oppDisp;
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
  const seatPosition = currentTrick.length;

  const ctx = {
    needMore, tricksNeeded, partnerIsNil, botIsNil, spadesBroken,
    opp1IsNil, opp2IsNil, teamTricks, teamBid, oppTricks, oppBid,
    botTricks, botBidVal, partnerId, players, botIndex,
    opp1Id, opp2Id, seatPosition, partnerBid, partnerTricks,
  };

  // Calculate our duck/set disposition
  ctx.disposition = calculateDisposition(hand, ctx);
  // Estimate what opponents are doing
  ctx.oppDisposition = estimateOpponentDisposition(currentTrick, ctx);

  // --- React to opponent disposition ---
  // If opponents are trying to set us, we need to protect our tricks
  if (ctx.oppDisposition > 0 && needMore) {
    // Opponents are setting us - be more urgent about making bid
    ctx.urgentBid = true;
  }
  // If opponents are setting and partner lost a trick they were counting on,
  // we may need to compensate by taking extra tricks
  if (ctx.oppDisposition > 1 && ctx.partnerBid > 0 && ctx.partnerTricks < ctx.partnerBid) {
    // Partner is behind - opponent is probably responsible. Compensate.
    ctx.compensateForPartner = true;
  }
  // If opponents are ducking and we're not trying to set, duck harder
  if (ctx.oppDisposition < 0 && ctx.disposition <= 0 && !needMore) {
    ctx.disposition -= 0.5; // Both teams ducking = avoid bags harder
  }
  // If opponents are aggressively setting and we have bags already,
  // lean into taking tricks defensively (they're coming for us)
  if (ctx.oppDisposition > 1 && !needMore) {
    ctx.disposition += 0.5; // Defensive aggression
  }

  // Derived booleans
  ctx.setMode = !needMore && ctx.disposition > 0 && oppTricks < oppBid;
  ctx.duckMode = !needMore && ctx.disposition < 0;

  if (currentTrick.length === 0) {
    return botLead(hand, ctx);
  } else {
    return botFollow(hand, currentTrick, ctx);
  }
}

// --- LEADING ---

function botLead(hand, ctx) {
  const validCards = getValidLeads(hand, ctx.spadesBroken);

  // Bot is nil: lead lowest to avoid winning
  if (ctx.botIsNil) {
    return leadAsNil(validCards);
  }

  // Partner is nil: lead to protect partner
  if (ctx.partnerIsNil) {
    return leadToProtectNil(validCards, hand, ctx);
  }

  // Opponent is nil: try to bust them
  if (ctx.opp1IsNil || ctx.opp2IsNil) {
    return leadToBustNil(validCards, ctx);
  }

  // Still need tricks to make bid
  if (ctx.needMore) {
    return leadWhenNeedingTricks(validCards, hand, ctx);
  }

  // Bid is met - play based on disposition
  if (ctx.setMode) {
    return leadInSetMode(validCards, hand, ctx);
  } else {
    return leadInDuckMode(validCards, hand, ctx);
  }
}

function leadAsNil(validCards) {
  const groups = groupBySuit(validCards);
  let bestCard = null;
  let bestLen = -1;

  for (const [suit, cards] of Object.entries(groups)) {
    const lowest = cards[cards.length - 1];
    if (cards.length > bestLen ||
        (cards.length === bestLen && RANK_VALUE[lowest.rank] < RANK_VALUE[bestCard.rank])) {
      bestCard = lowest;
      bestLen = cards.length;
    }
  }
  return bestCard || pickLowest(validCards);
}

function leadToProtectNil(validCards, hand, ctx) {
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');

  if (offSuit.length > 0) {
    const aces = offSuit.filter(c => c.rank === 'A');
    if (aces.length > 0) {
      return pickFromShortestSuit(aces, hand);
    }

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
      return groups[shortestSuit][0];
    }

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

  // If opponents are setting us (urgentBid) or we need to compensate for partner,
  // prioritize cashing guaranteed winners before they get trumped
  if (ctx.urgentBid || ctx.compensateForPartner) {
    // Cash aces immediately - don't risk them getting trumped
    const aces = offSuit.filter(c => c.rank === 'A');
    if (aces.length > 0) {
      // Lead ace from shortest suit - most likely to cash before opponents void out
      return pickFromShortestSuit(aces, hand);
    }

    // Lead high spades early to pull opponent trumps before they ruff our winners
    if (spades.length > 0) {
      const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 12);
      if (highSpades.length > 0) {
        return highSpades[0];
      }
    }
  }

  // Lead Aces first
  const aces = offSuit.filter(c => c.rank === 'A');
  if (aces.length > 0) return pickRandom(aces);

  // Lead Kings from suits where we have strength
  const groups = groupBySuit(offSuit);
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 2 && RANK_VALUE[cards[0].rank] === 13) {
      return cards[0];
    }
  }

  // Lead from long suits with strength
  for (const [suit, cards] of Object.entries(groups)) {
    if (cards.length >= 4 && RANK_VALUE[cards[0].rank] >= 12) {
      return cards[0];
    }
  }

  // Lead high spades
  if (spades.length > 0) {
    const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 13);
    if (highSpades.length > 0) {
      return highSpades[0];
    }
  }

  // Lead from short suits to create voids
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
      return pickLowest(groups[shortestSuit]);
    }
  }

  if (offSuit.length > 0) return pickHighest(offSuit);
  return pickHighest(validCards);
}

function leadInSetMode(validCards, hand, ctx) {
  // SET MODE: We've made our bid but want to take tricks from opponents.
  // Lead strong cards to steal tricks opponents are counting on.
  const offSuit = validCards.filter(c => c.suit !== 'S');
  const spades = validCards.filter(c => c.suit === 'S');

  // Lead high spades to pull opponent trumps - this is devastating in set mode
  // because it strips their ruffing ability
  if (spades.length > 0) {
    const highSpades = spades.filter(c => RANK_VALUE[c.rank] >= 12);
    if (highSpades.length > 0) {
      return highSpades[0]; // Lead A, K, or Q of spades
    }
  }

  // Lead Aces to grab tricks
  const aces = offSuit.filter(c => c.rank === 'A');
  if (aces.length > 0) return pickRandom(aces);

  // Lead Kings
  const kings = offSuit.filter(c => c.rank === 'K');
  if (kings.length > 0) return pickRandom(kings);

  // Lead from short suits - if we can void, we can trump opponent winners later
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
    if (shortestSuit && shortestLen <= 2) {
      return pickLowest(groups[shortestSuit]); // Void the short suit
    }
    // Lead highest available
    return pickHighest(offSuit);
  }

  return pickHighest(validCards);
}

function leadInDuckMode(validCards, hand, ctx) {
  // DUCK MODE: We've made our bid, avoid taking extra tricks (bags).
  const offSuit = validCards.filter(c => c.suit !== 'S');

  if (offSuit.length > 0) {
    // Lead low from shortest off-suit to give up the lead
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

  // Bot is nil: try to lose
  if (ctx.botIsNil) {
    return followAsNil(hand, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue);
  }

  // Partner is nil: protect them
  if (ctx.partnerIsNil) {
    const nilCard = followToProtectNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (nilCard) return nilCard;
  }

  // Opponent is nil: try to bust them
  if (ctx.opp1IsNil || ctx.opp2IsNil) {
    const bustCard = followToBustNil(hand, currentTrick, hasLedSuit, cardsOfSuit, nonSuitCards, ledSuit, winningValue, ctx);
    if (bustCard) return bustCard;
  }

  // Normal following - now disposition-aware
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
      if (hasLedSuit) {
        const partnerCardValue = getEffectiveValue(partnerPlayed.card, ledSuit);
        const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > partnerCardValue);
        if (beaters.length > 0) return pickLowest(beaters);
      }
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
    if (ctx.seatPosition <= 1) {
      if (hasLedSuit) {
        const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
        if (beaters.length > 0) return pickHighest(beaters);
      }
    }
  }

  return null;
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
  // --- Still need tricks to make bid ---
  if (ctx.needMore) {
    // If partner is winning, usually let them have it
    if (winnerIsPartner && ctx.seatPosition === 3) {
      // Exception: if we need to compensate for partner AND partner is behind,
      // we should still try to win so partner can save their remaining tricks
      if (!ctx.compensateForPartner) {
        return pickLowest(cardsOfSuit);
      }
    }
    if (winnerIsPartner && ctx.seatPosition === 2) {
      if (winningValue >= RANK_VALUE['Q'] && !ctx.compensateForPartner) {
        return pickLowest(cardsOfSuit);
      }
    }

    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) {
      // If opponents are setting us, be willing to spend bigger cards to secure tricks
      if (ctx.urgentBid && ctx.seatPosition <= 1) {
        // Early in the trick and under pressure - play strong to ensure the win
        // (opponent behind us might trump if we play just barely over)
        const safeBeaters = beaters.filter(c => getEffectiveValue(c, ledSuit) >= RANK_VALUE['Q']);
        if (safeBeaters.length > 0 && beaters.length > 1) {
          return pickLowest(safeBeaters); // Win with authority but don't waste top card
        }
      }
      return pickLowest(beaters);
    }
    return pickLowest(cardsOfSuit);
  }

  // --- Bid is met: play based on disposition ---

  if (ctx.setMode) {
    // SET MODE: try to win tricks to prevent opponents from making their bid
    if (winnerIsPartner) {
      if (ctx.seatPosition === 3) {
        return pickLowest(cardsOfSuit);
      }
      if (winningValue >= RANK_VALUE['J']) {
        return pickLowest(cardsOfSuit);
      }
    }

    // An opponent is currently winning - try to take the trick from them
    const beaters = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) > winningValue);
    if (beaters.length > 0) {
      return pickLowest(beaters);
    }
    return pickLowest(cardsOfSuit);
  }

  // DUCK MODE: avoid taking tricks (bag avoidance)
  // If opponents are also ducking, duck even harder - nobody wants these tricks
  if (winnerIsPartner) {
    return pickLowest(cardsOfSuit);
  }
  const underCards = cardsOfSuit.filter(c => getEffectiveValue(c, ledSuit) < winningValue);
  if (underCards.length > 0) return pickHighest(underCards);
  return pickLowest(cardsOfSuit);
}

function discardNormal(hand, nonSuitCards, ledSuit, winningValue, winnerIsPartner, currentTrick, ctx) {
  const spades = hand.filter(c => c.suit === 'S');
  const nonSpade = nonSuitCards.filter(c => c.suit !== 'S');

  // --- Still need tricks to make bid ---
  if (ctx.needMore) {
    // If partner is winning, usually don't override - unless opponents are
    // setting us and partner's winning card looks vulnerable to a later trump
    if (winnerIsPartner && ctx.seatPosition >= 2) {
      if (ctx.urgentBid && ctx.seatPosition === 2 && winningValue < RANK_VALUE['K']) {
        // Partner's card is weak and opponent plays last - they might trump.
        // Secure the trick ourselves with a trump if possible
        if (spades.length > 0 && ledSuit !== 'S') {
          const currentHighTrump = currentTrick
            .filter(t => t.card.suit === 'S')
            .reduce((max, t) => Math.max(max, RANK_VALUE[t.card.rank]), 0);
          const beatingSpades = spades.filter(c => RANK_VALUE[c.rank] > currentHighTrump);
          if (beatingSpades.length > 0) return pickLowest(beatingSpades);
        }
      }
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      return pickLowest(hand);
    }

    // Trump to win
    if (spades.length > 0 && ledSuit !== 'S') {
      const currentHighTrump = currentTrick
        .filter(t => t.card.suit === 'S')
        .reduce((max, t) => Math.max(max, RANK_VALUE[t.card.rank]), 0);
      const beatingSpades = spades.filter(c => RANK_VALUE[c.rank] > currentHighTrump);
      if (beatingSpades.length > 0) return pickLowest(beatingSpades);
    }

    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // --- Bid is met: play based on disposition ---

  if (ctx.setMode) {
    // SET MODE: aggressively trump to steal tricks from opponents
    if (winnerIsPartner) {
      // Partner is winning - don't override them, discard instead
      if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
      return pickLowest(hand);
    }

    // Opponent is winning - trump them to set
    if (spades.length > 0 && ledSuit !== 'S') {
      const currentHighTrump = currentTrick
        .filter(t => t.card.suit === 'S')
        .reduce((max, t) => Math.max(max, RANK_VALUE[t.card.rank]), 0);
      const beatingSpades = spades.filter(c => RANK_VALUE[c.rank] > currentHighTrump);
      if (beatingSpades.length > 0) return pickLowest(beatingSpades);
    }

    // Can't trump - discard
    if (nonSpade.length > 0) return dumpCard(nonSpade, hand, ctx);
    return pickLowest(hand);
  }

  // DUCK MODE: dump dangerous high cards, avoid trumping
  if (nonSpade.length > 0) {
    return pickHighest(nonSpade); // Dump highest off-suit to shed dangerous winners
  }
  return pickLowest(hand);
}

// Smart discard
function dumpCard(candidates, hand, ctx) {
  if (!ctx.needMore && !ctx.setMode) {
    // Duck mode: dump highest to get rid of future winners
    return pickHighest(candidates);
  }

  // Need tricks or set mode: dump from shortest suit to create voids for ruffing
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
    return pickLowest(groups[shortestSuit]);
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
