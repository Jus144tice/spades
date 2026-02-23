import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayerSeat from '../components/PlayerSeat.jsx';

const basePlayer = { id: 'p1', name: 'Alice', team: 1, seatIndex: 0 };

describe('PlayerSeat', () => {
  it('returns null when player is null', () => {
    const { container } = render(<PlayerSeat player={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders player name', () => {
    render(<PlayerSeat player={basePlayer} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders team badge', () => {
    render(<PlayerSeat player={basePlayer} />);
    expect(screen.getByText('T1')).toBeInTheDocument();
  });

  it('shows dealer chip when isDealer', () => {
    render(<PlayerSeat player={basePlayer} isDealer />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('shows active-turn class when isCurrentTurn', () => {
    const { container } = render(<PlayerSeat player={basePlayer} isCurrentTurn />);
    expect(container.querySelector('.active-turn')).toBeInTheDocument();
  });

  it('shows is-me class when isMe', () => {
    const { container } = render(<PlayerSeat player={basePlayer} isMe />);
    expect(container.querySelector('.is-me')).toBeInTheDocument();
  });

  it('shows trick-winner class when isLastTrickWinner', () => {
    const { container } = render(<PlayerSeat player={basePlayer} isLastTrickWinner />);
    expect(container.querySelector('.trick-winner')).toBeInTheDocument();
  });

  it('shows AFK badge when isAfk', () => {
    render(<PlayerSeat player={basePlayer} isAfk />);
    expect(screen.getByText('AFK')).toBeInTheDocument();
  });

  it('shows bid and tricks when bid is defined', () => {
    render(<PlayerSeat player={basePlayer} bid={3} tricks={2} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows Nil for bid=0', () => {
    render(<PlayerSeat player={basePlayer} bid={0} tricks={0} />);
    expect(screen.getByText('Nil')).toBeInTheDocument();
  });

  it('shows B.Nil for blind nil player with bid=0', () => {
    render(<PlayerSeat player={basePlayer} bid={0} tricks={0} isBlindNil />);
    expect(screen.getByText('B.Nil')).toBeInTheDocument();
  });

  it('shows nil-broken class when nil bid and tricks > 0', () => {
    const { container } = render(<PlayerSeat player={basePlayer} bid={0} tricks={1} />);
    expect(container.querySelector('.nil-broken')).toBeInTheDocument();
  });

  it('shows on-track class when tricks >= bid', () => {
    const { container } = render(<PlayerSeat player={basePlayer} bid={3} tricks={3} />);
    expect(container.querySelector('.on-track')).toBeInTheDocument();
  });

  it('shows behind class when tricks < bid', () => {
    const { container } = render(<PlayerSeat player={basePlayer} bid={3} tricks={1} />);
    expect(container.querySelector('.behind')).toBeInTheDocument();
  });

  it('shows "..." when no bid placed', () => {
    render(<PlayerSeat player={basePlayer} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('renders vacant seat when isVacant', () => {
    render(<PlayerSeat player={basePlayer} isVacant />);
    expect(screen.getByText('Vacant')).toBeInTheDocument();
    expect(screen.getByText('Waiting for player...')).toBeInTheDocument();
  });
});
