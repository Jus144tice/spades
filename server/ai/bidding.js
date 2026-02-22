import { RANK_VALUE, getCardValue } from '../game/constants.js';

export function botBid(hand, partnerBid, opponentBids, gameState, botId) {
  const spades = hand.filter(c => c.suit === 'S');
  const hearts = hand.filter(c => c.suit === 'H');
  const diamonds = hand.filter(c => c.suit === 'D');
  const clubs = hand.filter(c => c.suit === 'C');
  const suits = { H: hearts, D: diamonds, C: clubs };

  const sortedSpades = [...spades].sort((a, b) => getCardValue(b) - getCardValue(a));

  // Desperation context — are opponents about to win?
  const desp = getDesperationContext(gameState, botId, partnerBid, opponentBids);

  // Nil evaluation — relaxed thresholds under desperation
  if (evaluateNil(hand, sortedSpades, spades, suits, partnerBid, desp)) return 0;

  let tricks = 0;

  // Count spade tricks
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

  // Count off-suit tricks
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => getCardValue(b) - getCardValue(a));
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

  // Void/short suit ruffing potential
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

  // Trim if combined team bid is too aggressive (skip in desperation — we WANT aggressive)
  if (!desp.desperate && partnerBid !== undefined && partnerBid !== null && partnerBid > 0) {
    const combinedBid = bid + partnerBid;
    if (combinedBid > 10) {
      bid = Math.max(1, bid - 1);
    }
  }

  // Apply desperation adjustments
  if (desp.desperate) {
    bid = desperationBidAdjust(bid, tricks, partnerBid, opponentBids, desp);
  }

  // "Go for it" — opportunistic stretching when behind but not desperate
  if (!desp.desperate && desp.ourScore < desp.oppScore && desp.oppScore > 0) {
    bid = goForItAdjust(bid, tricks, hand, sortedSpades, spades, suits, partnerBid, opponentBids, desp);
  }

  return Math.max(1, Math.min(13, bid));
}

// --- DESPERATION CONTEXT ---
// Determines if opponents are about to win and what strategies are available.

export function getDesperationContext(gameState, botId, partnerBid, opponentBids) {
  const { scores, settings, teamLookup, players, books } = gameState;
  const result = {
    desperate: false,
    oppCanWin: false,        // opponents can reach winTarget this round
    weCanOutscore: false,    // we can reach winTarget this round with normal bid
    setTarget: 0,            // tricks to deny opponents (total team)
    bookSetViable: false,    // can we push opponents past book threshold?
    tenBidViable: false,     // can we stretch to 10 for bonus?
    ourScore: 0,
    oppScore: 0,
    oppBidTotal: 0,
    ourBooks: 0,
    oppBooks: 0,
    bookThreshold: 10,
    winTarget: 500,
    tricksPerRound: 13,
    isLastBidder: false,     // are we the last to bid on our team?
  };

  if (!scores || !botId) return result;

  // Resolve scores
  if (teamLookup) {
    const teamKey = teamLookup.getTeamKey(botId);
    result.ourScore = scores[teamKey] || 0;
    const allTeamKeys = Object.keys(scores);
    result.oppScore = allTeamKeys
      .filter(tk => tk !== teamKey)
      .reduce((max, tk) => Math.max(max, scores[tk] || 0), 0);

    if (books) {
      result.ourBooks = books[teamKey] || 0;
      // Find the opponent team with the highest score and use their books
      let oppTeamKey = allTeamKeys.find(tk => tk !== teamKey && (scores[tk] || 0) === result.oppScore);
      result.oppBooks = oppTeamKey ? (books[oppTeamKey] || 0) : 0;
    }
  } else if (players) {
    const botIdx = players.findIndex(p => p.id === botId);
    if (botIdx >= 0) {
      const team = players[botIdx].team;
      const teamKey = 'team' + team;
      const oppKey = team === 1 ? 'team2' : 'team1';
      result.ourScore = scores[teamKey] || 0;
      result.oppScore = scores[oppKey] || 0;
      if (books) {
        result.ourBooks = books[teamKey] || 0;
        result.oppBooks = books[oppKey] || 0;
      }
    }
  }

  result.winTarget = (settings && settings.winTarget) || 500;
  result.bookThreshold = (settings && settings.bookThreshold) || 10;
  const gameMode = (settings && settings.gameMode) || (gameState.mode && gameState.mode.playerCount) || 4;
  result.tricksPerRound = gameMode === 3 ? 17 : 13;

  // Calculate opponent's total bid
  result.oppBidTotal = (opponentBids || []).reduce((sum, b) => sum + (b || 0), 0);

  // Is partner's bid known? (meaning we're the second bidder)
  result.isLastBidder = partnerBid !== undefined && partnerBid !== null;

  // 10-BID: is the bonus enabled? (needed by both desperation and go-for-it)
  result.tenBidViable = !!(settings && settings.tenBidBonus !== false);

  // Can opponents win this round?
  const oppProjected = result.oppScore + result.oppBidTotal * 10;
  result.oppCanWin = oppProjected >= result.winTarget;

  if (!result.oppCanWin) return result; // No desperation needed

  result.desperate = true;

  // Can WE win this round with normal bidding?
  const partnerBidVal = (partnerBid !== undefined && partnerBid !== null && partnerBid > 0) ? partnerBid : 0;
  result.weCanOutscore = false; // calculated after we know our bid

  // SET target: how many tricks must we deny opponents?
  // Opponents need oppBidTotal tricks. If they get fewer, they lose oppBidTotal*10 instead of gaining.
  result.setTarget = result.oppBidTotal; // they need all of these

  // BOOK-SET: can we push opponents past book penalty threshold?
  const oppBooksToThreshold = result.bookThreshold - result.oppBooks;
  result.bookSetViable = oppBooksToThreshold <= 5 && oppBooksToThreshold > 0;
  result.oppBooksNeeded = oppBooksToThreshold;

  return result;
}

// Adjust bid based on desperation strategy
function desperationBidAdjust(normalBid, rawTricks, partnerBid, opponentBids, desp) {
  const partnerBidVal = (partnerBid !== undefined && partnerBid !== null && partnerBid > 0) ? partnerBid : 0;
  const combinedNormal = normalBid + partnerBidVal;

  // 1. Can we OUTSCORE opponents by winning ourselves?
  const ourProjected = desp.ourScore + combinedNormal * 10;
  if (ourProjected >= desp.winTarget) {
    // We can win too! Just bid normally — don't get cute.
    return normalBid;
  }

  // 2. TEN-BID BONUS: if enabled and we're close, stretch for +50
  if (desp.tenBidViable && combinedNormal >= 8 && combinedNormal < 10) {
    const stretch = 10 - combinedNormal;
    // Only stretch if raw hand strength is within 2 of the target
    if (rawTricks >= normalBid + stretch - 2) {
      const stretchedProjected = desp.ourScore + 10 * 10 + 50; // 10-bid bonus
      if (stretchedProjected >= desp.winTarget || desp.ourScore + combinedNormal * 10 + 50 > desp.ourScore) {
        return normalBid + stretch;
      }
    }
  }

  // 3. SET: bid to deny opponents their tricks
  // tricksPerRound - oppBidTotal = max tricks our team can concede and still set
  // Our team needs to take: tricksPerRound - setTarget + 1 = oppBidTotal's complement
  const tricksToForceSet = desp.tricksPerRound - desp.setTarget + 1;
  const mySetBid = Math.max(1, tricksToForceSet - partnerBidVal);

  // How valuable is setting them? They lose oppBidTotal*10 instead of gaining it
  const setSwing = desp.oppBidTotal * 20; // net swing from set vs make
  const ourSetScore = desp.ourScore + mySetBid * 10; // rough projection if we make our set bid

  if (mySetBid <= rawTricks + 2) {
    // Set bid is within reach (hand strength + 2 optimistic tricks)

    // If we're the last bidder on our team, signal set by leaving exactly -1 books
    // This tells partner "we are going for set, take everything"
    if (desp.isLastBidder && partnerBidVal > 0) {
      const totalBids = mySetBid + partnerBidVal;
      const freeTricks = desp.tricksPerRound - totalBids;
      // Leave -1 free trick: overbid by 1 to signal hard set
      if (freeTricks >= 0) {
        const signalBid = mySetBid + 1;
        if (signalBid <= rawTricks + 2) {
          return Math.min(13, signalBid);
        }
      }
    }

    return Math.min(13, mySetBid);
  }

  // 4. BOOK-SET: if opponents are close to book penalty threshold,
  // bid LOW so free tricks become opponent books
  if (desp.bookSetViable && desp.oppBooksNeeded <= 4) {
    // The idea: bid conservatively so more tricks are "free" — opponents
    // taking those free tricks accumulate books toward the penalty
    const bookSetBid = Math.max(1, normalBid - 1);
    return bookSetBid;
  }

  // 5. Fallback: bid aggressively — maximize our own score to stay alive
  // Don't trim for overbidding (already skipped above), bid honest strength
  return normalBid;
}

// --- GO FOR IT ---
// Opportunistic bid stretching when behind in points but not desperate.
// Only stretches when the upside justifies the risk.

function goForItAdjust(bid, rawTricks, hand, sortedSpades, spades, suits, partnerBid, opponentBids, desp) {
  const partnerBidVal = (partnerBid !== undefined && partnerBid !== null && partnerBid > 0) ? partnerBid : 0;
  const combinedBid = bid + partnerBidVal;
  const deficit = desp.oppScore - desp.ourScore;

  // Scale willingness by how far behind we are
  // Small deficit (30-80): only stretch if very close to target
  // Medium deficit (80-150): willing to take a moderate gamble
  // Large deficit (150+): stretch aggressively
  const willingness = deficit < 50 ? 0.3 : deficit < 100 ? 0.5 : deficit < 200 ? 0.7 : 1.0;

  // 1. NIL STRETCH: bid is 1, hand is borderline nil, bonus is worth the risk
  if (bid === 1 && rawTricks < 1.5 && willingness >= 0.5) {
    // Partner should be able to cover (bid >= 3), or we're first bidder with a very nil-friendly hand
    const partnerCanCover = partnerBidVal >= 3;
    const firstBidderSafe = (partnerBid === undefined || partnerBid === null) && rawTricks < 1.0;
    if ((partnerCanCover || firstBidderSafe) && canStretchToNil(hand, sortedSpades, spades, suits)) {
      return 0;
    }
  }

  // 2. TEN-BID STRETCH: combined is 8-9, stretch to 10 for +50 bonus
  if (desp.tenBidViable && partnerBidVal > 0 && combinedBid >= 8 && combinedBid < 10) {
    const stretch = 10 - combinedBid;
    // Raw hand strength must be within 1.5 of the stretched bid
    if (rawTricks >= bid + stretch - 1.5 && willingness >= 0.3) {
      return bid + stretch;
    }
  }

  // 3. SET STRETCH: +1 bid gets us into set territory
  if (partnerBidVal > 0 && desp.oppBidTotal > 0) {
    const tricksToSet = desp.tricksPerRound - desp.oppBidTotal + 1;
    const mySetBid = Math.max(1, tricksToSet - partnerBidVal);

    // Only stretch if it's just 1 more than normal bid and hand can plausibly support it
    if (mySetBid === bid + 1 && rawTricks >= bid - 0.5 && willingness >= 0.5) {
      // Only worth it for meaningful opponent bids (swing of 60+ points)
      const setSwing = desp.oppBidTotal * 20;
      if (setSwing >= 60) {
        return mySetBid;
      }
    }
  }

  return bid;
}

// Check if a hand that evaluated as bid=1 can plausibly stretch to nil.
// More relaxed than normal nil but stricter than desperation nil.
function canStretchToNil(hand, sortedSpades, spades, suits) {
  const spadeCount = spades.length;
  const highestSpade = sortedSpades.length > 0 ? RANK_VALUE[sortedSpades[0].rank] : 0;

  // Never stretch with A/K of spades
  if (highestSpade >= 13) return false;
  // Q of spades only if short (2 or fewer)
  if (highestSpade === 12 && spadeCount >= 3) return false;
  // J of spades only if short (2 or fewer)
  if (highestSpade === 11 && spadeCount >= 3) return false;

  const highCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length;
  if (highCards >= 2) return false;

  // Off-suit aces are dangerous if we have length (stuck following with them)
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => getCardValue(b) - getCardValue(a));
    if (RANK_VALUE[sorted[0].rank] === 14 && suitCards.length >= 3) return false;
  }

  const lowCards = hand.filter(c => RANK_VALUE[c.rank] <= 7).length;
  return lowCards >= 5;
}

/**
 * Evaluate whether the bot should bid blind nil.
 * Purely situational — does NOT look at the hand.
 * Only the second bidder on the team should consider blind nil.
 */
export function evaluateBlindNil(gameState, botId) {
  const { players, bids, scores, settings, roundNumber, teamLookup } = gameState;
  if (!settings.blindNil) return false;

  // Never blind nil in round 1 — no score context
  if (roundNumber <= 1) return false;

  // Use teamLookup if available, fallback to classic 4-player math
  let partnerId, partnerBid;
  if (teamLookup) {
    const partnerIds = teamLookup.getPartnerIds(botId);
    partnerId = partnerIds[0] || null;
    partnerBid = partnerId ? bids[partnerId] : undefined;
  } else {
    const botIndex = players.findIndex(p => p.id === botId);
    const partnerIndex = (botIndex + 2) % 4;
    partnerId = players[partnerIndex].id;
    partnerBid = bids[partnerId];
  }

  // Only as second bidder on the team (partner must have bid already)
  if (partnerBid === undefined || partnerBid === null) return false;
  if (partnerBid === 0) return false;   // Never if partner bid nil
  if (partnerBid < 4) return false;     // Partner must be able to cover

  // Find our team's score and the best opponent score
  let ourScore, oppScore;
  if (teamLookup) {
    const teamKey = teamLookup.getTeamKey(botId);
    ourScore = scores[teamKey] || 0;
    // Best opponent score (highest among non-teammates)
    const allTeamKeys = Object.keys(scores);
    oppScore = allTeamKeys
      .filter(tk => tk !== teamKey)
      .reduce((max, tk) => Math.max(max, scores[tk] || 0), 0);
  } else {
    const team = players[players.findIndex(p => p.id === botId)].team;
    const teamKey = 'team' + team;
    const oppKey = team === 1 ? 'team2' : 'team1';
    ourScore = scores[teamKey];
    oppScore = scores[oppKey];
  }
  const winTarget = settings.winTarget || 500;

  const deficit = oppScore - ourScore;
  const oppProximity = winTarget - oppScore;

  if (deficit < 150 && oppProximity > 200) return false;

  let probability = 0;
  if (deficit >= 300 && oppProximity <= 100) probability = 0.35;
  else if (deficit >= 300) probability = 0.20;
  else if (deficit >= 200 && oppProximity <= 150) probability = 0.18;
  else if (deficit >= 200) probability = 0.12;
  else if (deficit >= 150 || oppProximity <= 100) probability = 0.08;

  if (partnerBid >= 6) probability *= 1.3;

  return Math.random() < probability;
}

function evaluateNil(hand, sortedSpades, spades, suits, partnerBid, desp) {
  const spadeCount = spades.length;
  const highestSpade = sortedSpades.length > 0 ? RANK_VALUE[sortedSpades[0].rank] : 0;
  const isDesperate = desp && desp.desperate;

  // In desperation, relax thresholds — a risky nil is better than losing
  if (isDesperate) {
    // Still never nil with Ace or King of spades
    if (highestSpade >= 13) return false;
    // Allow Queen of spades if short in spades (2 or fewer)
    if (highestSpade === 12 && spadeCount >= 3) return false;
    if (highestSpade === 11 && spadeCount >= 4) return false;

    const highCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length;
    if (highCards >= 3) return false;

    const medCards = hand.filter(c => RANK_VALUE[c.rank] >= 10 && RANK_VALUE[c.rank] <= 11).length;
    if (highCards + medCards >= 5) return false;

    // Aces in off-suits are dangerous but allow one if suit is short
    let dangerousAces = 0;
    for (const [suitKey, suitCards] of Object.entries(suits)) {
      if (suitCards.length === 0) continue;
      const sorted = [...suitCards].sort((a, b) => getCardValue(b) - getCardValue(a));
      if (RANK_VALUE[sorted[0].rank] === 14 && suitCards.length <= 1) dangerousAces++;
      else if (RANK_VALUE[sorted[0].rank] === 14) return false; // Ace with length = stuck with it
    }
    if (dangerousAces >= 2) return false;

    const lowCards = hand.filter(c => RANK_VALUE[c.rank] <= 7).length;
    if (lowCards < 4) return false;

    // In desperation, nil with partner able to cover is worth the risk
    if (partnerBid !== undefined && partnerBid !== null && partnerBid >= 3) return true;
    return lowCards >= 5 && highCards <= 1;
  }

  // Normal nil evaluation (unchanged)
  if (highestSpade >= 12) return false;
  if (highestSpade === 11 && spadeCount >= 3) return false;

  const highCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length;
  if (highCards >= 2) return false;

  const medCards = hand.filter(c => RANK_VALUE[c.rank] >= 10 && RANK_VALUE[c.rank] <= 11).length;
  if (highCards + medCards >= 4) return false;

  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => getCardValue(b) - getCardValue(a));
    if (RANK_VALUE[sorted[0].rank] === 14) return false;
    if (RANK_VALUE[sorted[0].rank] === 13 && suitCards.length <= 2) return false;
  }

  const lowCards = hand.filter(c => RANK_VALUE[c.rank] <= 7).length;
  if (lowCards < 6) return false;

  if (partnerBid !== undefined && partnerBid !== null && partnerBid >= 3) return true;
  if (lowCards >= 9 && highCards === 0 && highestSpade <= 8) return true;

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
