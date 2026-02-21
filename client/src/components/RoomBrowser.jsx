import React, { useState, useMemo } from 'react';

const ALL_MODES = new Set([3, 4, 5, 6, 7, 8]);
const ALL_STATUSES = new Set(['waiting', 'playing', 'paused']);

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

  const s = room.settings || {};

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
            Rd {room.gameInfo.roundNumber} &middot; {Object.values(room.gameInfo.scores).join(' \u2013 ')}
          </div>
        )}
        <div className="room-card-tags">
          <span className="room-tag tag-mode">{room.gameMode}P</span>
          <span className="room-tag">{s.winTarget} pts</span>
          {s.blindNil && <span className="room-tag tag-on">Blind Nil</span>}
          {s.moonshot === false && <span className="room-tag tag-off">No Moonshot</span>}
          {s.tenBidBonus === false && <span className="room-tag tag-off">No 10-Trick</span>}
          {s.bookThreshold != null && s.bookThreshold !== 10 && (
            <span className="room-tag tag-off">Books @{s.bookThreshold}</span>
          )}
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

// Tri-state chip: any -> on -> off -> any
function nextTriState(val) {
  if (val === 'any') return 'on';
  if (val === 'on') return 'off';
  return 'any';
}

export default function RoomBrowser({ rooms, onJoin, onBack }) {
  // Filter state
  const [selectedModes, setSelectedModes] = useState(new Set(ALL_MODES));
  const [selectedStatuses, setSelectedStatuses] = useState(new Set(ALL_STATUSES));
  const [blindNilFilter, setBlindNilFilter] = useState('any');
  const [moonshotFilter, setMoonshotFilter] = useState('any');
  const [tenTrickFilter, setTenTrickFilter] = useState('any');
  const [sortBy, setSortBy] = useState('newest');

  const hasActiveFilters = selectedModes.size !== ALL_MODES.size
    || selectedStatuses.size !== ALL_STATUSES.size
    || blindNilFilter !== 'any'
    || moonshotFilter !== 'any'
    || tenTrickFilter !== 'any'
    || sortBy !== 'newest';

  const resetFilters = () => {
    setSelectedModes(new Set(ALL_MODES));
    setSelectedStatuses(new Set(ALL_STATUSES));
    setBlindNilFilter('any');
    setMoonshotFilter('any');
    setTenTrickFilter('any');
    setSortBy('newest');
  };

  const toggleMode = (mode) => {
    setSelectedModes(prev => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  };

  const toggleStatus = (status) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = rooms
      .filter(r => selectedModes.has(r.gameMode))
      .filter(r => selectedStatuses.has(r.status))
      .filter(r => blindNilFilter === 'any' || (blindNilFilter === 'on') === !!(r.settings?.blindNil))
      .filter(r => moonshotFilter === 'any' || (moonshotFilter === 'on') === !!(r.settings?.moonshot))
      .filter(r => tenTrickFilter === 'any' || (tenTrickFilter === 'on') === !!(r.settings?.tenBidBonus));

    if (sortBy === 'players') result = [...result].sort((a, b) => a.playerCount - b.playerCount);
    else if (sortBy === 'goalAsc') result = [...result].sort((a, b) => (a.settings?.winTarget || 500) - (b.settings?.winTarget || 500));
    else if (sortBy === 'goalDesc') result = [...result].sort((a, b) => (b.settings?.winTarget || 500) - (a.settings?.winTarget || 500));

    return result;
  }, [rooms, selectedModes, selectedStatuses, blindNilFilter, moonshotFilter, tenTrickFilter, sortBy]);

  return (
    <div className="room-browser">
      <div className="room-browser-header">
        <span>Active Rooms ({rooms.length})</span>
      </div>

      {/* Filter toolbar */}
      <div className="room-filter-bar">
        <div className="room-filter-group">
          <span className="room-filter-label">Players</span>
          <div className="room-filter-chips">
            {[3, 4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                className={`room-filter-chip ${selectedModes.has(n) ? 'active' : ''}`}
                onClick={() => toggleMode(n)}
              >
                {n}P
              </button>
            ))}
          </div>
        </div>

        <div className="room-filter-group">
          <span className="room-filter-label">Status</span>
          <div className="room-filter-chips">
            {[
              { key: 'waiting', label: 'Waiting' },
              { key: 'playing', label: 'Playing' },
              { key: 'paused', label: 'Paused' },
            ].map(s => (
              <button
                key={s.key}
                className={`room-filter-chip ${selectedStatuses.has(s.key) ? 'active' : ''}`}
                onClick={() => toggleStatus(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="room-filter-group">
          <span className="room-filter-label">Rules</span>
          <div className="room-filter-chips">
            <button
              className={`room-filter-chip ${blindNilFilter !== 'any' ? (blindNilFilter === 'on' ? 'active' : 'active-off') : ''}`}
              onClick={() => setBlindNilFilter(nextTriState(blindNilFilter))}
              title={blindNilFilter === 'any' ? 'Any' : blindNilFilter === 'on' ? 'On only' : 'Off only'}
            >
              Blind Nil{blindNilFilter !== 'any' && `: ${blindNilFilter === 'on' ? 'On' : 'Off'}`}
            </button>
            <button
              className={`room-filter-chip ${moonshotFilter !== 'any' ? (moonshotFilter === 'on' ? 'active' : 'active-off') : ''}`}
              onClick={() => setMoonshotFilter(nextTriState(moonshotFilter))}
              title={moonshotFilter === 'any' ? 'Any' : moonshotFilter === 'on' ? 'On only' : 'Off only'}
            >
              Moonshot{moonshotFilter !== 'any' && `: ${moonshotFilter === 'on' ? 'On' : 'Off'}`}
            </button>
            <button
              className={`room-filter-chip ${tenTrickFilter !== 'any' ? (tenTrickFilter === 'on' ? 'active' : 'active-off') : ''}`}
              onClick={() => setTenTrickFilter(nextTriState(tenTrickFilter))}
              title={tenTrickFilter === 'any' ? 'Any' : tenTrickFilter === 'on' ? 'On only' : 'Off only'}
            >
              10-Trick{tenTrickFilter !== 'any' && `: ${tenTrickFilter === 'on' ? 'On' : 'Off'}`}
            </button>
          </div>
        </div>

        <div className="room-filter-group">
          <span className="room-filter-label">Sort</span>
          <select
            className="room-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="players">Players</option>
            <option value="goalAsc">Goal (low to high)</option>
            <option value="goalDesc">Goal (high to low)</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button className="room-filter-reset" onClick={resetFilters}>
            Reset
          </button>
        )}
      </div>

      {/* Room list */}
      {filtered.length === 0 ? (
        <div className="room-browser-empty">
          {rooms.length === 0
            ? <><p>No active rooms found.</p><p>Create one to get started!</p></>
            : <p>No rooms match your filters.</p>
          }
        </div>
      ) : (
        <div className="room-grid">
          {filtered.map(room => (
            <RoomCard key={room.code} room={room} onJoin={onJoin} />
          ))}
        </div>
      )}

      {filtered.length !== rooms.length && rooms.length > 0 && (
        <div className="room-filter-count">
          Showing {filtered.length} of {rooms.length} rooms
        </div>
      )}

      <button className="btn btn-ghost" onClick={onBack}>Back</button>
    </div>
  );
}
