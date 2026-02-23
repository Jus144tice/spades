import {
  NIL_BONUS, BLIND_NIL_BONUS, TEN_TRICK_BONUS,
  BOOK_PENALTY, BOOK_PENALTY_THRESHOLD,
  AFK_TURN_TIMEOUT, AFK_FAST_TIMEOUT,
} from '../constants.js';

describe('scoring constants', () => {
  it('NIL_BONUS is 100', () => {
    expect(NIL_BONUS).toBe(100);
  });

  it('BLIND_NIL_BONUS is 200', () => {
    expect(BLIND_NIL_BONUS).toBe(200);
  });

  it('TEN_TRICK_BONUS is 50', () => {
    expect(TEN_TRICK_BONUS).toBe(50);
  });

  it('BOOK_PENALTY is 100', () => {
    expect(BOOK_PENALTY).toBe(100);
  });

  it('BOOK_PENALTY_THRESHOLD is 10', () => {
    expect(BOOK_PENALTY_THRESHOLD).toBe(10);
  });

  it('AFK_TURN_TIMEOUT is 60 seconds', () => {
    expect(AFK_TURN_TIMEOUT).toBe(60);
  });

  it('AFK_FAST_TIMEOUT is 5 seconds', () => {
    expect(AFK_FAST_TIMEOUT).toBe(5);
  });
});
