import React from 'react';
import { useGame } from './context/GameContext.jsx';
import JoinScreen from './screens/JoinScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen from './screens/GameScreen.jsx';
import Chat from './components/Chat.jsx';
import ErrorToast from './components/ErrorToast.jsx';

export default function App() {
  const { state } = useGame();

  return (
    <div className="app">
      <div className="app-main">
        {state.screen === 'join' && <JoinScreen />}
        {state.screen === 'lobby' && <LobbyScreen />}
        {state.screen === 'game' && <GameScreen />}
      </div>
      {state.screen !== 'join' && (
        <div className="app-chat">
          <Chat />
        </div>
      )}
      <ErrorToast />
    </div>
  );
}
