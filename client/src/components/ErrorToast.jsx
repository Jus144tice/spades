import React, { useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';

export default function ErrorToast() {
  const { state, dispatch } = useGame();

  useEffect(() => {
    if (state.errorMessage) {
      const timer = setTimeout(() => {
        dispatch({ type: 'CLEAR_ERROR' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.errorMessage, dispatch]);

  if (!state.errorMessage) return null;

  return (
    <div className="error-toast">
      {state.errorMessage}
    </div>
  );
}
