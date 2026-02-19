import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { useGame } from './context/GameContext.jsx';
import { PreferencesProvider, usePreferences } from './context/PreferencesContext.jsx';
import JoinScreen from './screens/JoinScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import GameScreen from './screens/GameScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Chat from './components/Chat.jsx';
import RulesModal from './components/RulesModal.jsx';
import ErrorToast from './components/ErrorToast.jsx';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 769
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

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

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { state } = useGame();
  const { hasCompletedSetup, loading: prefsLoading } = usePreferences();
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const isMobile = useIsMobile();
  const chatOpenRef = React.useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const prevMsgCountRef = React.useRef(state.chatMessages.length);

  // Track unread messages when chat is hidden
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    const newCount = state.chatMessages.length;
    if (newCount > prevCount && !chatOpenRef.current) {
      setUnreadCount(prev => prev + (newCount - prevCount));
    }
    prevMsgCountRef.current = newCount;
  }, [state.chatMessages.length]);

  // Clear unread when chat is opened
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  // Listen for rules modal open events from child screens
  useEffect(() => {
    const handler = () => setRulesOpen(true);
    window.addEventListener('open-rules', handler);
    return () => window.removeEventListener('open-rules', handler);
  }, []);

  if (authLoading || prefsLoading) {
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

  if (!hasCompletedSetup) {
    return <SetupScreen />;
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
          {chatOpen && (
            <div className={`app-chat chat-open ${isMobile ? 'chat-mobile' : 'chat-desktop'}`}>
              <Chat />
            </div>
          )}
          <button
            className="chat-toggle-btn"
            onClick={() => setChatOpen(prev => !prev)}
            aria-label="Toggle chat"
          >
            {chatOpen ? '\u2715' : '\uD83D\uDCAC'}
            {!chatOpen && unreadCount > 0 && (
              <span className="chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </>
      )}
      <button
        className="settings-btn"
        onClick={() => setSettingsOpen(true)}
        aria-label="Settings"
        title="Settings"
      >
        {'\u2699'}
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {state.reconnecting && (
        <div className="reconnecting-overlay">
          <div className="reconnecting-content">
            <div className="reconnecting-spinner" />
            <p>Reconnecting...</p>
          </div>
        </div>
      )}
      <ErrorToast />
    </div>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AppContent />
    </PreferencesProvider>
  );
}
