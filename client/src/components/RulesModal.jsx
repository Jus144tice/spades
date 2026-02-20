import React, { useState } from 'react';

const sections = [
  {
    id: 'basics',
    title: 'The Basics',
    content: (
      <>
        <p>Spades is a <strong>4-player trick-taking game</strong> played in teams of 2. Partners sit across from each other at the table.</p>
        <p>The entire deck is dealt out — each player gets <strong>13 cards</strong>. You'll play 13 tricks per round, and the team that reaches the target score first wins.</p>
        <p>Spades are always trump, meaning any spade beats any card of another suit.</p>
      </>
    ),
  },
  {
    id: 'bidding',
    title: 'Bidding',
    content: (
      <>
        <p>Before playing, each player looks at their hand and <strong>bids</strong> how many tricks they think they can win (1-13). Your team's bids are combined.</p>
        <p>Bid what you think you can take. Overbidding risks getting <em>set</em> (losing points). Underbidding earns extra tricks called <em>books</em> — but too many books is bad.</p>
        <ul>
          <li><strong>Nil bid</strong> — Bid 0 if you think you can avoid winning any tricks. Worth +100 if you pull it off, -100 if you take even one trick.</li>
          <li>Your partner still bids and plays normally when you go nil.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'playing',
    title: 'Playing Tricks',
    content: (
      <>
        <p>The player to the left of the dealer leads the first trick. Play continues clockwise.</p>
        <p><strong>You must follow suit</strong> — if a heart is led, you must play a heart if you have one. If you're out of that suit, you can play anything, including a spade (trump).</p>
        <p>The highest card of the led suit wins the trick, <em>unless</em> a spade was played — then the highest spade wins.</p>
        <div className="rules-callout">
          <strong>Breaking spades:</strong> You can't lead with a spade until someone has played a spade on a previous trick (because they were out of the led suit). Once spades are "broken," anyone can lead them.
        </div>
      </>
    ),
  },
  {
    id: 'scoring',
    title: 'Scoring',
    content: (
      <>
        <p>After all 13 tricks are played, the round is scored:</p>
        <table className="rules-table">
          <tbody>
            <tr>
              <td><strong>Made your bid</strong></td>
              <td>+10 points per trick bid</td>
            </tr>
            <tr>
              <td><strong>Got set</strong> (took fewer than bid)</td>
              <td>-10 points per trick bid</td>
            </tr>
            <tr>
              <td><strong>Books</strong> (overtricks)</td>
              <td>+1 point each, but...</td>
            </tr>
            <tr>
              <td><strong>10 books penalty</strong></td>
              <td>-100 points when you hit 10 books</td>
            </tr>
            <tr>
              <td><strong>Nil made</strong></td>
              <td>+100 bonus</td>
            </tr>
            <tr>
              <td><strong>Nil failed</strong></td>
              <td>-100 penalty</td>
            </tr>
          </tbody>
        </table>
        <p>Example: Your team bids 5, takes 7 tricks. You get 50 + 2 = <strong>52 points</strong>, and 2 books added to your count.</p>
      </>
    ),
  },
  {
    id: 'books',
    title: 'Books (Overtricks)',
    content: (
      <>
        <p>Books are the extra tricks you take beyond your bid. They're worth 1 point each, but they accumulate across rounds.</p>
        <p>When your team hits <strong>10 books</strong>, you lose <strong>100 points</strong> and your book count resets. This makes sandbagging (intentionally underbidding) risky.</p>
        <p>The book counter is shown on the scoreboard so you can keep track.</p>
      </>
    ),
  },
  {
    id: 'winning',
    title: 'Winning the Game',
    content: (
      <>
        <p>The default target score is <strong>500 points</strong> (adjustable in game settings). The first team to reach it wins.</p>
        <p>If both teams cross the target in the same round, the team with the higher score wins.</p>
      </>
    ),
  },
  {
    id: 'tips',
    title: 'Tips & Strategy',
    content: (
      <>
        <ul>
          <li><strong>Count your sure tricks</strong> — Aces and Kings of suits are reliable. Bid conservatively at first.</li>
          <li><strong>Watch the books</strong> — If your team is at 7-8 books, try to take exactly your bid.</li>
          <li><strong>Protect your partner's nil</strong> — If your partner bid nil, lead high cards to "eat" tricks before they're forced to win one.</li>
          <li><strong>Pay attention to what's been played</strong> — If all the high spades are gone, your mid-spade is now a winner.</li>
          <li><strong>Lead your short suits early</strong> — Run out of a suit so you can trump with spades later.</li>
          <li><strong>Don't be afraid of nil</strong> — If your hand is full of low cards, nil can be a big swing.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'controls',
    title: 'How This App Works',
    content: (
      <>
        <ul>
          <li><strong>Create or join a room</strong> with the room code. Share it with friends.</li>
          <li><strong>Bots</strong> can fill empty seats — the host can add/remove them in the lobby.</li>
          <li><strong>Drag players</strong> to assign teams in the lobby, or hit Randomize.</li>
          <li><strong>Queue a card</strong> — Click a card when it's not your turn to pre-select it. It auto-plays when your turn comes.</li>
          <li><strong>AFK timer</strong> — 60 seconds to act. After 3 timeouts, you're auto-played faster. Any action (play, bid, chat) brings you back.</li>
          <li><strong>Spectators</strong> — Extra players beyond 4 can watch the game live.</li>
          <li><strong>Chat</strong> — Toggle the chat window with the button in the corner. Talk trash responsibly.</li>
        </ul>
      </>
    ),
  },
];

function Section({ section, isOpen, onToggle }) {
  return (
    <div className={`rules-section ${isOpen ? 'open' : ''}`}>
      <button className="rules-section-header" onClick={onToggle}>
        <span>{section.title}</span>
        <span className="rules-chevron">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isOpen && <div className="rules-section-body">{section.content}</div>}
    </div>
  );
}

export default function RulesModal({ onClose }) {
  const [openSections, setOpenSections] = useState({ basics: true });

  const toggle = (id) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all = {};
    sections.forEach(s => { all[s.id] = true; });
    setOpenSections(all);
  };

  const collapseAll = () => setOpenSections({});

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rules-modal" onClick={e => e.stopPropagation()}>
        <h2>How to Play Spades</h2>
        <div className="rules-expand-controls">
          <button className="rules-expand-btn" onClick={expandAll}>Expand all</button>
          <span className="rules-expand-divider">&middot;</span>
          <button className="rules-expand-btn" onClick={collapseAll}>Collapse all</button>
        </div>
        <div className="rules-sections">
          {sections.map(s => (
            <Section key={s.id} section={s} isOpen={!!openSections[s.id]} onToggle={() => toggle(s.id)} />
          ))}
        </div>
        <button className="btn btn-primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
