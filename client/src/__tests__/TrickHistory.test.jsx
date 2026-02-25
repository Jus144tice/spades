import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TrickHistory from '../components/TrickHistory.jsx';

const PLAYERS = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Charlie' },
  { id: 'p4', name: 'Diana' },
];

const COMPLETED_TRICKS = [
  {
    trickNumber: 1,
    trick: [
      { playerId: 'p1', card: { suit: 'H', rank: 'A' } },
      { playerId: 'p2', card: { suit: 'H', rank: 'K' } },
      { playerId: 'p3', card: { suit: 'H', rank: 'Q' } },
      { playerId: 'p4', card: { suit: 'H', rank: 'J' } },
    ],
    winnerId: 'p1',
    leaderId: 'p1',
  },
  {
    trickNumber: 2,
    trick: [
      { playerId: 'p1', card: { suit: 'S', rank: '2' } },
      { playerId: 'p2', card: { suit: 'S', rank: 'A' } },
      { playerId: 'p3', card: { suit: 'C', rank: '3' } },
      { playerId: 'p4', card: { suit: 'D', rank: '5' } },
    ],
    winnerId: 'p2',
    leaderId: 'p1',
  },
];

const ROUND_HISTORY = [
  {
    roundNumber: 1,
    completedTricks: [
      {
        trickNumber: 1,
        trick: [
          { playerId: 'p1', card: { suit: 'D', rank: 'A' } },
          { playerId: 'p2', card: { suit: 'D', rank: '3' } },
          { playerId: 'p3', card: { suit: 'D', rank: '5' } },
          { playerId: 'p4', card: { suit: 'D', rank: '7' } },
        ],
        winnerId: 'p1',
        leaderId: 'p1',
      },
    ],
  },
];

describe('TrickHistory', () => {
  it('shows empty state when no tricks', () => {
    render(<TrickHistory completedTricks={[]} roundHistory={[]} roundNumber={1} players={PLAYERS} onClose={vi.fn()} />);
    expect(screen.getByText('No tricks played yet.')).toBeInTheDocument();
  });

  it('renders current round tricks in reverse order', () => {
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={[]} roundNumber={1} players={PLAYERS} onClose={vi.fn()} />);
    const items = screen.getAllByText(/^Trick \d/);
    expect(items[0].textContent).toBe('Trick 2');
    expect(items[1].textContent).toBe('Trick 1');
  });

  it('shows player names for each play', () => {
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={[]} roundNumber={1} players={PLAYERS} onClose={vi.fn()} />);
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('shows winner for each trick', () => {
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={[]} roundNumber={1} players={PLAYERS} onClose={vi.fn()} />);
    const wonTexts = screen.getAllByText(/Won by/);
    expect(wonTexts).toHaveLength(2);
  });

  it('shows round headers', () => {
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={ROUND_HISTORY} roundNumber={2} players={PLAYERS} onClose={vi.fn()} />);
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('Round 1')).toBeInTheDocument();
  });

  it('shows tricks from previous rounds via roundHistory', () => {
    render(<TrickHistory completedTricks={[]} roundHistory={ROUND_HISTORY} roundNumber={2} players={PLAYERS} onClose={vi.fn()} />);
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    // The round 1 trick should show
    const wonTexts = screen.getAllByText(/Won by/);
    expect(wonTexts).toHaveLength(1);
  });

  it('displays most recent round first', () => {
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={ROUND_HISTORY} roundNumber={2} players={PLAYERS} onClose={vi.fn()} />);
    const headers = screen.getAllByText(/^Round \d/);
    expect(headers[0].textContent).toBe('Round 2');
    expect(headers[1].textContent).toBe('Round 1');
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={[]} roundNumber={1} players={PLAYERS} onClose={onClose} />);
    fireEvent.click(screen.getByText('Trick History').closest('.trick-history-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<TrickHistory completedTricks={COMPLETED_TRICKS} roundHistory={[]} roundNumber={1} players={PLAYERS} onClose={onClose} />);
    fireEvent.click(screen.getByText('\u2715'));
    expect(onClose).toHaveBeenCalled();
  });
});
