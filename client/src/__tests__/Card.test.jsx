import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Card, { CardBack } from '../components/Card.jsx';

describe('Card', () => {
  it('renders rank and suit symbol', () => {
    render(<Card card={{ suit: 'S', rank: 'A' }} />);
    expect(screen.getAllByText('A')).toHaveLength(2); // top-left + bottom-right
    expect(screen.getAllByText('\u2660')).toHaveLength(3); // 2 corners + center
  });

  it('renders heart symbol for suit H', () => {
    render(<Card card={{ suit: 'H', rank: 'K' }} />);
    expect(screen.getAllByText('\u2665')).toHaveLength(3);
  });

  it('renders diamond symbol for suit D', () => {
    render(<Card card={{ suit: 'D', rank: '7' }} />);
    expect(screen.getAllByText('\u2666')).toHaveLength(3);
  });

  it('renders club symbol for suit C', () => {
    render(<Card card={{ suit: 'C', rank: '10' }} />);
    expect(screen.getAllByText('\u2663')).toHaveLength(3);
  });

  it('applies red color for hearts', () => {
    const { container } = render(<Card card={{ suit: 'H', rank: 'K' }} />);
    expect(container.firstChild).toHaveStyle({ color: '#d40000' });
  });

  it('applies black color for spades', () => {
    const { container } = render(<Card card={{ suit: 'S', rank: 'A' }} />);
    expect(container.firstChild).toHaveStyle({ color: '#000000' });
  });

  it('calls onClick when clicked and not disabled', () => {
    const onClick = vi.fn();
    render(<Card card={{ suit: 'S', rank: 'A' }} onClick={onClick} />);
    fireEvent.click(screen.getAllByText('A')[0].closest('.card'));
    expect(onClick).toHaveBeenCalledWith({ suit: 'S', rank: 'A' });
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Card card={{ suit: 'S', rank: 'A' }} onClick={onClick} disabled />);
    fireEvent.click(screen.getAllByText('A')[0].closest('.card'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders empty card when card is null', () => {
    const { container } = render(<Card card={null} />);
    expect(container.querySelector('.card-empty')).toBeInTheDocument();
  });

  it('renders MEGA banner for mega cards', () => {
    render(<Card card={{ suit: 'S', rank: '2', mega: true }} />);
    expect(screen.getByText('MEGA')).toBeInTheDocument();
  });

  it('applies card-small class when small', () => {
    const { container } = render(<Card card={{ suit: 'S', rank: 'A' }} small />);
    expect(container.querySelector('.card-small')).toBeInTheDocument();
  });
});

describe('CardBack', () => {
  it('renders card-back class', () => {
    const { container } = render(<CardBack />);
    expect(container.querySelector('.card-back')).toBeInTheDocument();
  });

  it('renders card-small class when small', () => {
    const { container } = render(<CardBack small />);
    expect(container.querySelector('.card-small')).toBeInTheDocument();
  });
});
