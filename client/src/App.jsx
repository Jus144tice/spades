import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { useGame } from './context/GameContext.jsx';
import JoinScreen from './screens/JoinScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen from './screens/GameScreen.jsx';
import Chat from './components/Chat.jsx';
import ErrorToast from './components/ErrorToast.jsx';

function LoginScreen() {
  const { login } = useAuth();

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="join-title">Spades</h1>
        <p className="join-subtitle">Get your squad together</p>
        <div className="join-buttons">
          <button className="btn btn-primary" onClick={login}>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const { state } = useGame();
  const [chatOpen, setChatOpen] = useState(false);

  if (loading) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <h1 className="join-title">Spades</h1>
          <p className="join-subtitle">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="app">
      <div className="app-main">
        {state.screen === 'join' && <JoinScreen />}
        {state.screen === 'lobby' && <LobbyScreen />}
        {state.screen === 'game' && <GameScreen />}
      </div>
      {state.screen !== 'join' && (
        <>
          <div className={`app-chat ${chatOpen ? 'chat-open' : ''}`}>
            <Chat />
          </div>
          <button
            className="chat-toggle-btn"
            onClick={() => setChatOpen(prev => !prev)}
            aria-label="Toggle chat"
          >
            {chatOpen ? '\u2715' : '\uD83D\uDCAC'}
          </button>
        </>
      )}
      <ErrorToast />
    </div>
  );
}
