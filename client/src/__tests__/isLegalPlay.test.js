import { isLegalPlay } from '../gameUtils.js';
import { spade, heart, diamond, club } from './helpers.jsx';

describe('isLegalPlay', () => {
  describe('leading a trick (empty currentTrick)', () => {
    it('any non-spade card is legal', () => {
      const hand = [heart('A'), spade('K'), diamond('5')];
      expect(isLegalPlay(heart('A'), hand, [], false)).toBe(true);
      expect(isLegalPlay(diamond('5'), hand, [], false)).toBe(true);
    });

    it('spade is illegal when not broken and player has non-spades', () => {
      const hand = [heart('A'), spade('K')];
      expect(isLegalPlay(spade('K'), hand, [], false)).toBe(false);
    });

    it('spade is legal when not broken but player has ONLY spades', () => {
      const hand = [spade('A'), spade('K'), spade('3')];
      expect(isLegalPlay(spade('A'), hand, [], false)).toBe(true);
    });

    it('spade is legal when spades are broken', () => {
      const hand = [heart('A'), spade('K')];
      expect(isLegalPlay(spade('K'), hand, [], true)).toBe(true);
    });
  });

  describe('following suit', () => {
    const heartLed = [{ playerId: 'p1', card: heart('Q') }];

    it('must play led suit when you have it', () => {
      const hand = [heart('5'), spade('K'), diamond('3')];
      expect(isLegalPlay(heart('5'), hand, heartLed, false)).toBe(true);
    });

    it('cannot play off-suit when you have led suit', () => {
      const hand = [heart('5'), spade('K')];
      expect(isLegalPlay(spade('K'), hand, heartLed, false)).toBe(false);
    });

    it('can play any card when you lack the led suit', () => {
      const hand = [spade('K'), diamond('3'), club('7')];
      expect(isLegalPlay(spade('K'), hand, heartLed, false)).toBe(true);
      expect(isLegalPlay(diamond('3'), hand, heartLed, false)).toBe(true);
      expect(isLegalPlay(club('7'), hand, heartLed, false)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('single card in hand is always legal to lead', () => {
      const hand = [spade('2')];
      expect(isLegalPlay(spade('2'), hand, [], false)).toBe(true);
    });

    it('single card in hand is legal even if off-suit', () => {
      const hand = [spade('2')];
      const heartLed = [{ playerId: 'p1', card: heart('A') }];
      expect(isLegalPlay(spade('2'), hand, heartLed, false)).toBe(true);
    });

    it('mega cards follow same suit rules', () => {
      const megaSpade = { suit: 'S', rank: '2', mega: true };
      const hand = [megaSpade, heart('K')];
      // Can't lead mega spade when not broken
      expect(isLegalPlay(megaSpade, hand, [], false)).toBe(false);
    });
  });
});
