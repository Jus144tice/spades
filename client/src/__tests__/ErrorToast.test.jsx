import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ErrorToast from '../components/ErrorToast.jsx';
import { renderWithGame } from './helpers.jsx';

describe('ErrorToast', () => {
  it('renders error message when set', () => {
    renderWithGame(<ErrorToast />, { state: { errorMessage: 'Something went wrong' } });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders nothing when errorMessage is null', () => {
    const { container } = renderWithGame(<ErrorToast />, { state: { errorMessage: null } });
    expect(container.querySelector('.error-toast')).toBeNull();
  });

  it('dispatches CLEAR_ERROR after 3 seconds', () => {
    vi.useFakeTimers();
    const { dispatch } = renderWithGame(<ErrorToast />, { state: { errorMessage: 'Error' } });
    expect(dispatch).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_ERROR' });
    vi.useRealTimers();
  });
});
