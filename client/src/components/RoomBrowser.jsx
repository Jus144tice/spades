import React from 'react';

function RoomCard({ room, onJoin }) {
  const statusLabel = {
    waiting: 'Waiting',
    playing: 'In Progress',
    paused: 'Needs Player',
  };
  const statusClass = {
    waiting: 'status-waiting',
    playing: 'status-playing',
    paused: 'status-paused',
  };
  const buttonLabel = room.status === 'waiting'
    ? 'Join'
    : room.status === 'paused' && room.vacantSeats > 0
      ? 'Join'
      : 'Spectate';

  return (
    <div className={`room-card ${statusClass[room.status]}`}>
      <div className="room-card-header">
        <span className="room-card-code">{room.code}</span>
        <span className={`room-card-status ${statusClass[room.status]}`}>
          {statusLabel[room.status]}
        </span>
      </div>
      <div className="room-card-body">
        <div className="room-card-host">Host: {room.hostName}</div>
        <div className="room-card-players">
          {room.playerCount}/{room.maxPlayers} players
          {room.spectatorCount > 0 && ` + ${room.spectatorCount} spectating`}
        </div>
        {room.gameInfo && (
          <div className="room-card-game-info">
            Rd {room.gameInfo.roundNumber} &middot; {room.gameInfo.scores.team1} - {room.gameInfo.scores.team2}
          </div>
        )}
        <div className="room-card-settings">
          Goal: {room.settings.winTarget}
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm room-card-join"
        onClick={() => onJoin(room.code)}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export default function RoomBrowser({ rooms, onJoin, onBack }) {
  if (rooms.length === 0) {
    return (
      <div className="room-browser">
        <div className="room-browser-empty">
          <p>No active rooms found.</p>
          <p>Create one to get started!</p>
        </div>
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
      </div>
    );
  }

  return (
    <div className="room-browser">
      <div className="room-browser-header">
        <span>Active Rooms ({rooms.length})</span>
      </div>
      <div className="room-grid">
        {rooms.map(room => (
          <RoomCard key={room.code} room={room} onJoin={onJoin} />
        ))}
      </div>
      <button className="btn btn-ghost" onClick={onBack}>Back</button>
    </div>
  );
}
