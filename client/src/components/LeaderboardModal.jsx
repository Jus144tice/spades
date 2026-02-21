import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

function StatItem({ label, value, sublabel }) {
  return (
    <div className="stat-item">
      <div className="stat-value">{value}</div>
      <div className="stat-label">
        {label}
        {sublabel && <span className="stat-sublabel"> ({sublabel})</span>}
      </div>
    </div>
  );
}

const MODE_TABS = [
  { value: 'all', label: 'All' },
  { value: 3, label: '3P' },
  { value: 4, label: '4P' },
  { value: 5, label: '5P' },
  { value: 6, label: '6P' },
  { value: 7, label: '7P' },
  { value: 8, label: '8P' },
];

const ALL_SORT_OPTIONS = [
  { value: 'games_won', label: 'Wins' },
  { value: 'win_rate', label: 'Win %' },
  { value: 'best_win_streak', label: 'Streaks' },
  { value: 'perfect_bids', label: 'Perfect Bids' },
  { value: 'nils_made', label: 'Nils' },
  { value: 'moonshot_wins', label: 'Moonshots' },
];

const MODE_SORT_OPTIONS = [
  { value: 'games_won', label: 'Wins' },
  { value: 'win_rate', label: 'Win %' },
  { value: 'perfect_bids', label: 'Perfect Bids' },
  { value: 'bid_accuracy', label: 'Bid %' },
  { value: 'nils_made', label: 'Nils' },
  { value: 'total_tricks_taken', label: 'Tricks' },
  { value: 'avg_bid', label: 'Avg Bid' },
];

function nextTriState(val) {
  if (val === 'any') return 'on';
  if (val === 'on') return 'off';
  return 'any';
}

function getHighlightHeader(sortBy, isAllMode) {
  if (isAllMode) {
    switch (sortBy) {
      case 'best_win_streak': return 'Streak';
      case 'perfect_bids': return 'Perfect';
      case 'nils_made': return 'Nils';
      case 'moonshot_wins': return 'Moon';
      default: return 'GP';
    }
  }
  switch (sortBy) {
    case 'perfect_bids': return 'Perfect';
    case 'bid_accuracy': return 'Bid%';
    case 'nils_made': return 'Nils';
    case 'total_tricks_taken': return 'Tricks';
    case 'avg_bid': return 'Avg';
    default: return 'GP';
  }
}

function getHighlightValue(row, sortBy, isAllMode) {
  if (isAllMode) {
    switch (sortBy) {
      case 'best_win_streak': return row.bestWinStreak;
      case 'perfect_bids': return row.perfectBids;
      case 'nils_made': return row.nilsMade;
      case 'moonshot_wins': return row.moonshotWins;
      default: return row.gamesPlayed;
    }
  }
  switch (sortBy) {
    case 'perfect_bids': return row.perfectBids;
    case 'bid_accuracy': return `${row.bidAccuracy}%`;
    case 'nils_made': return row.nilsMade;
    case 'total_tricks_taken': return row.totalTricksTaken;
    case 'avg_bid': return row.avgBid;
    default: return row.gamesPlayed;
  }
}

export default function LeaderboardModal({ onClose }) {
  const { user } = useAuth();
  const [selectedMode, setSelectedMode] = useState('all');
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalGames, setTotalGames] = useState(null);
  const [myStats, setMyStats] = useState(null);
  const [sortBy, setSortBy] = useState('games_won');
  const [loading, setLoading] = useState(true);

  // Settings filters (mode views only)
  const [blindNilFilter, setBlindNilFilter] = useState('any');
  const [moonshotFilter, setMoonshotFilter] = useState('any');
  const [tenTrickFilter, setTenTrickFilter] = useState('any');
  const [minGames, setMinGames] = useState(1);

  const isAllMode = selectedMode === 'all';
  const sortOptions = isAllMode ? ALL_SORT_OPTIONS : MODE_SORT_OPTIONS;
  const hasActiveFilters = blindNilFilter !== 'any'
    || moonshotFilter !== 'any'
    || tenTrickFilter !== 'any'
    || minGames > 1;

  const handleModeChange = (mode) => {
    setSelectedMode(mode);
    const opts = mode === 'all' ? ALL_SORT_OPTIONS : MODE_SORT_OPTIONS;
    if (!opts.find(o => o.value === sortBy)) {
      setSortBy('games_won');
    }
    // Reset filters when switching modes
    setBlindNilFilter('any');
    setMoonshotFilter('any');
    setTenTrickFilter('any');
    setMinGames(1);
  };

  const resetFilters = () => {
    setBlindNilFilter('any');
    setMoonshotFilter('any');
    setTenTrickFilter('any');
    setMinGames(1);
  };

  // Build query string for mode filters
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('sort', sortBy);
    if (blindNilFilter !== 'any') params.set('blindNil', blindNilFilter);
    if (moonshotFilter !== 'any') params.set('moonshot', moonshotFilter);
    if (tenTrickFilter !== 'any') params.set('tenBidBonus', tenTrickFilter);
    if (minGames > 1) params.set('minGames', minGames);
    return params.toString();
  }, [sortBy, blindNilFilter, moonshotFilter, tenTrickFilter, minGames]);

  // Fetch leaderboard
  useEffect(() => {
    setLoading(true);
    const url = isAllMode
      ? `/api/leaderboard?sort=${sortBy}`
      : `/api/leaderboard/mode/${selectedMode}?${filterQuery}`;

    fetch(url)
      .then(res => res.ok ? res.json() : (isAllMode ? [] : { rows: [], totalGames: 0 }))
      .then(data => {
        if (isAllMode) {
          setLeaderboard(data);
          setTotalGames(null);
        } else {
          setLeaderboard(data.rows || []);
          setTotalGames(data.totalGames);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedMode, sortBy, filterQuery, isAllMode]);

  // Fetch personal stats
  useEffect(() => {
    if (!user?.id) return;
    const url = isAllMode
      ? `/api/stats/${user.id}`
      : `/api/stats/${user.id}/mode/${selectedMode}?${new URLSearchParams(
          Object.entries({
            blindNil: blindNilFilter !== 'any' ? blindNilFilter : undefined,
            moonshot: moonshotFilter !== 'any' ? moonshotFilter : undefined,
            tenBidBonus: tenTrickFilter !== 'any' ? tenTrickFilter : undefined,
          }).filter(([, v]) => v !== undefined)
        ).toString()}`;

    fetch(url)
      .then(res => res.ok ? res.json() : null)
      .then(data => setMyStats(data))
      .catch(() => {});
  }, [user?.id, selectedMode, blindNilFilter, moonshotFilter, tenTrickFilter, isAllMode]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal leaderboard-modal" onClick={e => e.stopPropagation()}>
        <h2>Leaderboard</h2>

        {/* Mode Tabs */}
        <div className="leaderboard-modes">
          {MODE_TABS.map(tab => (
            <button
              key={tab.value}
              className={`leaderboard-mode-btn ${selectedMode === tab.value ? 'active' : ''}`}
              onClick={() => handleModeChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings Filter Bar (mode views only) */}
        {!isAllMode && (
          <div className="leaderboard-filters">
            <div className="leaderboard-filter-chips">
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
            <div className="leaderboard-min-games">
              <label>Min Games</label>
              <input
                type="number"
                min="1"
                max="100"
                value={minGames}
                onChange={e => setMinGames(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            {hasActiveFilters && (
              <button className="room-filter-reset" onClick={resetFilters}>Reset</button>
            )}
          </div>
        )}

        {/* Sort Buttons */}
        <div className="leaderboard-sorts">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              className={`leaderboard-sort-btn ${sortBy === opt.value ? 'active' : ''}`}
              onClick={() => setSortBy(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Game count context */}
        {!isAllMode && totalGames !== null && (
          <div className="leaderboard-context">
            Based on {totalGames} game{totalGames !== 1 ? 's' : ''}
          </div>
        )}

        {loading ? (
          <div className="leaderboard-empty">Loading...</div>
        ) : leaderboard.length === 0 ? (
          <div className="leaderboard-empty">
            {isAllMode
              ? 'No games played yet. Be the first!'
              : 'No games match these filters.'}
          </div>
        ) : (
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="leaderboard-th-player">Player</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Win%</th>
                  {!isAllMode && <th>Bid%</th>}
                  <th>{getHighlightHeader(sortBy, isAllMode)}</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(row => (
                  <tr key={row.userId} className={row.userId === user?.id ? 'leaderboard-me' : ''}>
                    <td className={`leaderboard-rank rank-${row.rank}`}>{row.rank}</td>
                    <td className="leaderboard-player">
                      {row.avatarUrl && (
                        <img src={row.avatarUrl} alt="" className="leaderboard-avatar" referrerPolicy="no-referrer" />
                      )}
                      <span>{row.displayName}</span>
                    </td>
                    <td>{row.gamesWon}</td>
                    <td>{row.gamesLost}</td>
                    <td>{row.winRate}%</td>
                    {!isAllMode && <td>{row.bidAccuracy}%</td>}
                    <td className="leaderboard-highlight">{getHighlightValue(row, sortBy, isAllMode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {myStats && myStats.gamesPlayed > 0 && (
          <div className="my-stats-card">
            <h3>{isAllMode ? 'Your Stats' : `Your ${selectedMode}P Stats`}</h3>
            <div className="my-stats-grid">
              <StatItem label="Games" value={myStats.gamesPlayed} />
              <StatItem label="Win Rate" value={`${myStats.winRate}%`} />
              {isAllMode && (
                <>
                  <StatItem label="Win Streak" value={myStats.bestWinStreak} sublabel="best" />
                  <StatItem label="Current" value={myStats.currentWinStreak} sublabel="streak" />
                </>
              )}
              <StatItem label="Perfect Bids" value={myStats.perfectBids} />
              {!isAllMode && (
                <StatItem label="Bid Accuracy" value={`${myStats.bidAccuracy}%`} />
              )}
              <StatItem label="Avg Bid" value={myStats.avgBid} />
              {isAllMode && <StatItem label="Times Set" value={myStats.timesSet} />}
              <StatItem label="Tricks Won" value={myStats.totalTricksTaken} />
              <StatItem label="Nils Made" value={`${myStats.nilsMade}/${myStats.nilAttempts}`} />
              {isAllMode && (
                <>
                  <StatItem label="Blind Nils" value={`${myStats.blindNilsMade}/${myStats.blindNilAttempts}`} />
                  <StatItem label="Total Books" value={myStats.totalBooks} />
                  <StatItem label="Moonshots" value={myStats.moonshotWins} />
                  <StatItem label="Best Score" value={myStats.highestGameScore} />
                </>
              )}
              {!isAllMode && (
                <StatItem label="Rounds" value={myStats.totalRounds} />
              )}
            </div>
          </div>
        )}

        <button className="btn btn-primary leaderboard-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
