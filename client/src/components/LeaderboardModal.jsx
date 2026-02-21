import React, { useState, useEffect } from 'react';
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

const SORT_OPTIONS = [
  { value: 'games_won', label: 'Wins' },
  { value: 'win_rate', label: 'Win %' },
  { value: 'best_win_streak', label: 'Streaks' },
  { value: 'perfect_bids', label: 'Perfect Bids' },
  { value: 'nils_made', label: 'Nils' },
  { value: 'moonshot_wins', label: 'Moonshots' },
];

function getHighlightHeader(sortBy) {
  switch (sortBy) {
    case 'best_win_streak': return 'Streak';
    case 'perfect_bids': return 'Perfect';
    case 'nils_made': return 'Nils';
    case 'moonshot_wins': return 'Moon';
    default: return 'GP';
  }
}

function getHighlightValue(row, sortBy) {
  switch (sortBy) {
    case 'best_win_streak': return row.bestWinStreak;
    case 'perfect_bids': return row.perfectBids;
    case 'nils_made': return row.nilsMade;
    case 'moonshot_wins': return row.moonshotWins;
    default: return row.gamesPlayed;
  }
}

export default function LeaderboardModal({ onClose }) {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [sortBy, setSortBy] = useState('games_won');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?sort=${sortBy}`)
      .then(res => res.ok ? res.json() : [])
      .then(data => { setLeaderboard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sortBy]);

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/stats/${user.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setMyStats(data))
        .catch(() => {});
    }
  }, [user?.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal leaderboard-modal" onClick={e => e.stopPropagation()}>
        <h2>Leaderboard</h2>

        <div className="leaderboard-sorts">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`leaderboard-sort-btn ${sortBy === opt.value ? 'active' : ''}`}
              onClick={() => setSortBy(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="leaderboard-empty">Loading...</div>
        ) : leaderboard.length === 0 ? (
          <div className="leaderboard-empty">No games played yet. Be the first!</div>
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
                  <th>{getHighlightHeader(sortBy)}</th>
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
                    <td className="leaderboard-highlight">{getHighlightValue(row, sortBy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {myStats && myStats.gamesPlayed > 0 && (
          <div className="my-stats-card">
            <h3>Your Stats</h3>
            <div className="my-stats-grid">
              <StatItem label="Games" value={myStats.gamesPlayed} />
              <StatItem label="Win Rate" value={`${myStats.winRate}%`} />
              <StatItem label="Win Streak" value={myStats.bestWinStreak} sublabel="best" />
              <StatItem label="Current" value={myStats.currentWinStreak} sublabel="streak" />
              <StatItem label="Perfect Bids" value={myStats.perfectBids} />
              <StatItem label="Avg Bid" value={myStats.avgBid} />
              <StatItem label="Times Set" value={myStats.timesSet} />
              <StatItem label="Tricks Won" value={myStats.totalTricksTaken} />
              <StatItem label="Nils Made" value={`${myStats.nilsMade}/${myStats.nilAttempts}`} />
              <StatItem label="Blind Nils" value={`${myStats.blindNilsMade}/${myStats.blindNilAttempts}`} />
              <StatItem label="Total Books" value={myStats.totalBooks} />
              <StatItem label="Moonshots" value={myStats.moonshotWins} />
              <StatItem label="Best Score" value={myStats.highestGameScore} />
            </div>
          </div>
        )}

        <button className="btn btn-primary leaderboard-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
