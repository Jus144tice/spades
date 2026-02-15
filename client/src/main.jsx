import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { GameProvider } from './context/GameContext.jsx';
import './styles/app.css';
import './styles/lobby.css';
import './styles/game.css';
import './styles/cards.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <App />
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>
);
