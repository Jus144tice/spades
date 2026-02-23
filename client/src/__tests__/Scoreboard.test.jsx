import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import Scoreboard from '../components/Scoreboard.jsx';
import { renderWithGame, FOUR_PLAYERS } from './helpers.jsx';

describe('Scoreboard', () => {
  const baseState = {
    players: FOUR_PLAYERS,
    roundNumber: 3,
    scores: { team1: 150, team2: 80 },
    books: { team1: 3, team2: 1 },
    bids: {},
    tricksTaken: {},
    playerCount: 4,
    roundHistory: [],
    mode: null,
  };

  it('renders round number', () => {
    renderWithGame(<Scoreboard />, { state: baseState });
    expect(screen.getByText('Round 3')).toBeInTheDocument();
  });

  it('renders team names from player data', () => {
    renderWithGame(<Scoreboard />, { state: baseState });
    expect(screen.getByText('Alice & Charlie')).toBeInTheDocument();
    expect(screen.getByText('Bob & Diana')).toBeInTheDocument();
  });

  it('renders scores for each team', () => {
    renderWithGame(<Scoreboard />, { state: baseState });
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  it('renders books for each team', () => {
    renderWithGame(<Scoreboard />, { state: baseState });
    expect(screen.getByText('3 books')).toBeInTheDocument();
    expect(screen.getByText('1 books')).toBeInTheDocument();
  });

  it('shows bid tracker when all bids are in', () => {
    const state = {
      ...baseState,
      bids: { p1: 3, p2: 4, p3: 2, p4: 3 },
      tricksTaken: { p1: 2, p2: 3, p3: 1, p4: 2 },
    };
    renderWithGame(<Scoreboard />, { state });
    // Team 1: bid 5 (3+2), took 3 (2+1)
    expect(screen.getByText((_, el) => el?.textContent === 'Bid 5 · Took 3/5')).toBeInTheDocument();
  });

  it('hides bid tracker when bids not all in', () => {
    const state = { ...baseState, bids: { p1: 3 } };
    renderWithGame(<Scoreboard />, { state });
    expect(screen.queryByText(/Bid.*Took/)).toBeNull();
  });

  it('shows books remaining banner when all bids in', () => {
    const state = {
      ...baseState,
      bids: { p1: 3, p2: 4, p3: 2, p4: 3 }, // total=12, remaining=1
    };
    renderWithGame(<Scoreboard />, { state });
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('book up for grabs')).toBeInTheDocument();
  });

  it('applies books-tight class when booksRemaining <= 1', () => {
    const state = {
      ...baseState,
      bids: { p1: 3, p2: 4, p3: 3, p4: 3 }, // total=13, remaining=0
    };
    const { container } = renderWithGame(<Scoreboard />, { state });
    expect(container.querySelector('.books-tight')).toBeInTheDocument();
  });

  it('applies books-loose class when booksRemaining >= 4', () => {
    const state = {
      ...baseState,
      bids: { p1: 2, p2: 2, p3: 2, p4: 2 }, // total=8, remaining=5
    };
    const { container } = renderWithGame(<Scoreboard />, { state });
    expect(container.querySelector('.books-loose')).toBeInTheDocument();
  });

  it('shows History button when roundHistory is non-empty', () => {
    const state = { ...baseState, roundHistory: [{ roundNumber: 1, teamScores: {}, teamTotals: {} }] };
    renderWithGame(<Scoreboard />, { state });
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('does not show History button when roundHistory is empty', () => {
    renderWithGame(<Scoreboard />, { state: baseState });
    expect(screen.queryByText('History')).toBeNull();
  });

  it('toggles history overlay on click', () => {
    const state = { ...baseState, roundHistory: [{ roundNumber: 1, teamScores: {}, teamTotals: {} }] };
    const { container } = renderWithGame(<Scoreboard />, { state });
    fireEvent.click(screen.getByText('History'));
    expect(screen.getByText('Round History')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Round History')).toBeNull();
  });
});
