import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import BidPanel from '../components/BidPanel.jsx';
import { renderWithGameAndSocket, FOUR_PLAYERS } from './helpers.jsx';

describe('BidPanel', () => {
  const baseState = {
    players: FOUR_PLAYERS,
    bids: {},
    gameSettings: null,
    cardsRevealed: false,
    mode: null, // standard 4-player → maxBid = 13
    playerCount: 4,
  };

  it('renders bid buttons 0 (Nil) through 13', () => {
    renderWithGameAndSocket(<BidPanel />, { state: baseState });
    expect(screen.getByText('Nil')).toBeInTheDocument();
    for (let i = 1; i <= 13; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });

  it('Submit Bid button is disabled when no bid selected', () => {
    renderWithGameAndSocket(<BidPanel />, { state: baseState });
    expect(screen.getByText('Submit Bid')).toBeDisabled();
  });

  it('selecting a bid highlights it and enables submit', () => {
    renderWithGameAndSocket(<BidPanel />, { state: baseState });
    const bidBtn = screen.getByText('5');
    fireEvent.click(bidBtn);
    expect(bidBtn.className).toContain('selected');
    expect(screen.getByText('Submit Bid')).not.toBeDisabled();
  });

  it('submitting emits place_bid with selected bid', () => {
    const { socket } = renderWithGameAndSocket(<BidPanel />, { state: baseState });
    fireEvent.click(screen.getByText('4'));
    fireEvent.click(screen.getByText('Submit Bid'));
    expect(socket.emit).toHaveBeenCalledWith('place_bid', { bid: 4, blindNil: false });
  });

  it('shows bid summary when some bids are placed', () => {
    const state = { ...baseState, bids: { p1: 3, p2: 4 } };
    renderWithGameAndSocket(<BidPanel />, { state });
    expect(screen.getByText((_, el) => el?.textContent === 'Total bid: 7')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Remaining: 6')).toBeInTheDocument();
  });

  it('hides bid summary when no bids placed', () => {
    renderWithGameAndSocket(<BidPanel />, { state: baseState });
    expect(screen.queryByText(/Total bid/)).toBeNull();
  });

  describe('blind nil mode', () => {
    const blindState = {
      ...baseState,
      gameSettings: { blindNil: true },
      cardsRevealed: false,
    };

    it('shows blind nil choice when cards are hidden', () => {
      renderWithGameAndSocket(<BidPanel />, { state: blindState });
      expect(screen.getByText('Blind Nil')).toBeInTheDocument();
      expect(screen.getByText('Show Cards')).toBeInTheDocument();
      expect(screen.queryByText('Your Bid')).toBeNull();
    });

    it('Blind Nil button emits bid 0 with blindNil true', () => {
      const { socket } = renderWithGameAndSocket(<BidPanel />, { state: blindState });
      fireEvent.click(screen.getByText('Blind Nil'));
      expect(socket.emit).toHaveBeenCalledWith('place_bid', { bid: 0, blindNil: true });
    });

    it('Show Cards dispatches REVEAL_CARDS', () => {
      const { dispatch } = renderWithGameAndSocket(<BidPanel />, { state: blindState });
      fireEvent.click(screen.getByText('Show Cards'));
      expect(dispatch).toHaveBeenCalledWith({ type: 'REVEAL_CARDS' });
    });

    it('shows normal bid panel after cards are revealed', () => {
      const revealedState = { ...blindState, cardsRevealed: true };
      renderWithGameAndSocket(<BidPanel />, { state: revealedState });
      expect(screen.getByText('Your Bid')).toBeInTheDocument();
      expect(screen.queryByText('Blind Nil')).toBeNull();
    });
  });
});
