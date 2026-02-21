import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import { getModeDescription } from '../modes.js';

export default function GameSettingsPanel() {
  const socket = useSocket();
  const { state } = useGame();
  const [expanded, setExpanded] = useState(false);

  const settings = state.gameSettings;
  if (!settings) return null;

  const isHost = state.isHost;

  const updateSetting = (key, value) => {
    socket.emit('update_game_settings', { [key]: value });
  };

  const toggleSetting = (key) => {
    updateSetting(key, !settings[key]);
  };

  const stepNumber = (key, delta, min, max) => {
    const newVal = Math.max(min, Math.min(max, settings[key] + delta));
    if (newVal !== settings[key]) {
      updateSetting(key, newVal);
    }
  };

  // Check if any settings differ from defaults
  const hasCustomSettings = settings.winTarget !== 500
    || settings.bookThreshold !== 10
    || settings.blindNil
    || !settings.moonshot
    || !settings.tenBidBonus
    || (settings.gameMode && settings.gameMode !== 4);

  return (
    <div className="game-settings-panel">
      <button
        className="game-settings-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span>Game Settings{hasCustomSettings && !expanded ? ' (modified)' : ''}</span>
        <span className="settings-chevron">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="game-settings-body">
          <div className="settings-section">
            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">Players</span>
                <span className="settings-desc">{getModeDescription(settings.gameMode || 4)}</span>
              </div>
              {isHost ? (
                <div className="settings-number">
                  <button className="settings-step" onClick={() => stepNumber('gameMode', -1, 3, 8)}>-</button>
                  <span className="settings-value">{settings.gameMode || 4}</span>
                  <button className="settings-step" onClick={() => stepNumber('gameMode', 1, 3, 8)}>+</button>
                </div>
              ) : (
                <span className="settings-value-readonly">{settings.gameMode || 4}</span>
              )}
            </div>

            <div className="settings-row">
              <span className="settings-label">Win Target</span>
              {isHost ? (
                <div className="settings-number">
                  <button className="settings-step" onClick={() => stepNumber('winTarget', -50, 100, 1000)}>-</button>
                  <span className="settings-value">{settings.winTarget}</span>
                  <button className="settings-step" onClick={() => stepNumber('winTarget', 50, 100, 1000)}>+</button>
                </div>
              ) : (
                <span className="settings-value-readonly">{settings.winTarget}</span>
              )}
            </div>

            <div className="settings-row">
              <span className="settings-label">Books for Penalty</span>
              {isHost ? (
                <div className="settings-number">
                  <button className="settings-step" onClick={() => stepNumber('bookThreshold', -1, 5, 15)}>-</button>
                  <span className="settings-value">{settings.bookThreshold}</span>
                  <button className="settings-step" onClick={() => stepNumber('bookThreshold', 1, 5, 15)}>+</button>
                </div>
              ) : (
                <span className="settings-value-readonly">{settings.bookThreshold}</span>
              )}
            </div>
          </div>

          <div className="settings-divider"></div>

          <div className="settings-section">
            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">Blind Nil</span>
                <span className="settings-desc">Bid nil before seeing cards (&plusmn;200)</span>
              </div>
              {isHost ? (
                <button
                  className={`settings-toggle ${settings.blindNil ? 'on' : ''}`}
                  onClick={() => toggleSetting('blindNil')}
                >
                  <span className="toggle-knob"></span>
                </button>
              ) : (
                <span className={`settings-badge ${settings.blindNil ? 'on' : 'off'}`}>
                  {settings.blindNil ? 'On' : 'Off'}
                </span>
              )}
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">13-Bid Auto-Win</span>
                <span className="settings-desc">Bid 13 + take all = instant win</span>
              </div>
              {isHost ? (
                <button
                  className={`settings-toggle ${settings.moonshot ? 'on' : ''}`}
                  onClick={() => toggleSetting('moonshot')}
                >
                  <span className="toggle-knob"></span>
                </button>
              ) : (
                <span className={`settings-badge ${settings.moonshot ? 'on' : 'off'}`}>
                  {settings.moonshot ? 'On' : 'Off'}
                </span>
              )}
            </div>

            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">10-Trick Bonus</span>
                <span className="settings-desc">+50 for taking 10+ tricks</span>
              </div>
              {isHost ? (
                <button
                  className={`settings-toggle ${settings.tenBidBonus ? 'on' : ''}`}
                  onClick={() => toggleSetting('tenBidBonus')}
                >
                  <span className="toggle-knob"></span>
                </button>
              ) : (
                <span className={`settings-badge ${settings.tenBidBonus ? 'on' : 'off'}`}>
                  {settings.tenBidBonus ? 'On' : 'Off'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
