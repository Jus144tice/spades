import {
  getSeatAngle, getSeatPosition, getTrickCardPosition,
  getFourPlayerPosition, getTeamCount, getCardsPerPlayer,
  getTricksPerRound, isSpoilerTeam, getModeDescription,
} from '../modes.js';

describe('getSeatAngle', () => {
  it('offset 0 (me) is at bottom (180°)', () => {
    expect(getSeatAngle(0, 4)).toBe(180);
  });

  it('offset 1 in 4-player is 270°', () => {
    expect(getSeatAngle(1, 4)).toBe(270);
  });

  it('offset 2 in 4-player is 0° (top)', () => {
    expect(getSeatAngle(2, 4)).toBe(0);
  });

  it('offset 3 in 4-player is 90°', () => {
    expect(getSeatAngle(3, 4)).toBe(90);
  });

  it('distributes evenly for 6 players', () => {
    expect(getSeatAngle(0, 6)).toBe(180);
    expect(getSeatAngle(1, 6)).toBe(240);
    expect(getSeatAngle(2, 6)).toBe(300);
    expect(getSeatAngle(3, 6)).toBe(0);
  });

  it('wraps correctly for last seat', () => {
    expect(getSeatAngle(5, 6)).toBe(120);
  });
});

describe('getSeatPosition', () => {
  it('offset 0 returns near bottom center', () => {
    const pos = getSeatPosition(0, 4);
    // Angle 180° → x≈50, y≈90
    expect(parseFloat(pos.left)).toBeCloseTo(50, 0);
    expect(parseFloat(pos.top)).toBeGreaterThan(80);
  });

  it('offset 2 in 4-player returns near top center', () => {
    const pos = getSeatPosition(2, 4);
    expect(parseFloat(pos.left)).toBeCloseTo(50, 0);
    expect(parseFloat(pos.top)).toBeLessThan(20);
  });

  it('returns left and top as percentage strings', () => {
    const pos = getSeatPosition(0, 4);
    expect(pos.left).toMatch(/%$/);
    expect(pos.top).toMatch(/%$/);
  });
});

describe('getTrickCardPosition', () => {
  it('returns positions closer to center than getSeatPosition', () => {
    const seat = getSeatPosition(1, 4);
    const trick = getTrickCardPosition(1, 4);
    // Trick cards should be closer to 50% center than seat positions
    const seatDist = Math.abs(parseFloat(seat.left) - 50);
    const trickDist = Math.abs(parseFloat(trick.left) - 50);
    expect(trickDist).toBeLessThan(seatDist);
  });
});

describe('getFourPlayerPosition', () => {
  it('same index as myIndex returns bottom', () => {
    expect(getFourPlayerPosition(0, 0)).toBe('bottom');
  });

  it('returns left for offset 1', () => {
    expect(getFourPlayerPosition(1, 0)).toBe('left');
  });

  it('returns top for offset 2', () => {
    expect(getFourPlayerPosition(2, 0)).toBe('top');
  });

  it('returns right for offset 3', () => {
    expect(getFourPlayerPosition(3, 0)).toBe('right');
  });

  it('wraps correctly when myIndex=2', () => {
    expect(getFourPlayerPosition(2, 2)).toBe('bottom');
    expect(getFourPlayerPosition(3, 2)).toBe('left');
    expect(getFourPlayerPosition(0, 2)).toBe('top');
    expect(getFourPlayerPosition(1, 2)).toBe('right');
  });
});

describe('getTeamCount', () => {
  it('returns mode.teamCount when provided', () => {
    expect(getTeamCount({ teamCount: 3 })).toBe(3);
  });

  it('defaults to 2', () => {
    expect(getTeamCount(null)).toBe(2);
    expect(getTeamCount(undefined)).toBe(2);
    expect(getTeamCount({})).toBe(2);
  });
});

describe('getCardsPerPlayer', () => {
  it('returns mode.cardsPerPlayer', () => {
    expect(getCardsPerPlayer({ cardsPerPlayer: 10 })).toBe(10);
  });

  it('defaults to 13', () => {
    expect(getCardsPerPlayer(null)).toBe(13);
  });
});

describe('getTricksPerRound', () => {
  it('returns mode.tricksPerRound', () => {
    expect(getTricksPerRound({ tricksPerRound: 10 })).toBe(10);
  });

  it('defaults to 13', () => {
    expect(getTricksPerRound(null)).toBe(13);
  });
});

describe('isSpoilerTeam', () => {
  it('returns true for spoiler team', () => {
    const mode = { teams: [{ id: 'team1' }, { id: 'team3', spoiler: true }] };
    expect(isSpoilerTeam(mode, 3)).toBe(true);
  });

  it('returns false for regular team', () => {
    const mode = { teams: [{ id: 'team1' }, { id: 'team2' }] };
    expect(isSpoilerTeam(mode, 1)).toBe(false);
  });

  it('returns false when mode is null', () => {
    expect(isSpoilerTeam(null, 1)).toBe(false);
  });
});

describe('getModeDescription', () => {
  it('returns correct descriptions for each mode', () => {
    expect(getModeDescription(3)).toBe('3 solo players');
    expect(getModeDescription(4)).toBe('2 teams of 2');
    expect(getModeDescription(5)).toBe('2 teams + 1 spoiler');
    expect(getModeDescription(6)).toBe('3 teams of 2');
    expect(getModeDescription(7)).toBe('3 teams + 1 spoiler');
    expect(getModeDescription(8)).toBe('4 teams of 2');
  });

  it('returns empty string for unknown mode', () => {
    expect(getModeDescription(99)).toBe('');
  });
});
