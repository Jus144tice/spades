import React, { useState } from 'react';

const sections = [
  {
    id: 'basics',
    title: 'The Basics',
    content: (
      <>
        <p>Spades is a <strong>trick-taking card game</strong> where the goal is to accurately predict how many tricks you'll win each round. Spades are always trump — any spade beats any card of another suit.</p>
        <p>The standard game is <strong>4 players in 2 teams of 2</strong>. Partners sit across from each other. The full 52-card deck is dealt evenly — 13 cards each, 13 tricks per round.</p>
        <p>The first team to reach the target score (default <strong>500</strong>) wins.</p>
      </>
    ),
  },
  {
    id: 'bidding',
    title: 'Bidding',
    content: (
      <>
        <p>Before playing, each player looks at their hand and <strong>bids</strong> how many tricks they think they can win (1-13). Your team's bids are combined into a team bid.</p>
        <p>Bid what you think you can take. Overbidding risks getting <em>set</em> (losing points). Underbidding earns extra tricks called <em>books</em> — but accumulating too many books triggers a penalty.</p>
        <ul>
          <li><strong>Nil bid</strong> — Bid 0 if you think you can avoid winning any tricks. Worth +100 if you pull it off, -100 if you take even one trick. Your partner still bids and plays normally.</li>
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
        <p>After all tricks are played, the round is scored:</p>
        <table className="rules-table">
          <tbody>
            <tr>
              <td><strong>Made your bid</strong></td>
              <td>+10 per trick bid</td>
            </tr>
            <tr>
              <td><strong>Got set</strong> (took fewer than bid)</td>
              <td>-10 per trick bid</td>
            </tr>
            <tr>
              <td><strong>Books</strong> (overtricks)</td>
              <td>+1 each, but...</td>
            </tr>
            <tr>
              <td><strong>Book penalty</strong></td>
              <td>-100 at the threshold</td>
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
        <p>Example: Your team bids 5, takes 7 tricks = 50 + 2 = <strong>52 points</strong>, and 2 books added to your count.</p>
      </>
    ),
  },
  {
    id: 'books',
    title: 'Books (Overtricks)',
    content: (
      <>
        <p>Books are the extra tricks you take beyond your bid. They're worth 1 point each, but they accumulate across rounds.</p>
        <p>When your team hits the <strong>book threshold</strong> (default 10), you lose <strong>100 points</strong> and your count resets. This makes sandbagging (intentionally underbidding) risky.</p>
        <p>The book counter is shown on the scoreboard so you can keep track.</p>
      </>
    ),
  },
  {
    id: 'modes',
    title: 'Player Modes (3-8 Players)',
    content: (
      <>
        <p>This app supports <strong>3 to 8 players</strong>. The standard 4-player game is the default, but you can change the player count in the lobby settings.</p>

        <div className="rules-mode-grid">
          <div className="rules-mode-card">
            <div className="rules-mode-header">
              <strong>3 Players</strong>
              <span className="rules-mode-tag">Free-for-all</span>
            </div>
            <p>3 solo players, no teams. 13 low cards are removed from the deck so each player still gets 13 cards. Every player bids and scores independently.</p>
          </div>

          <div className="rules-mode-card">
            <div className="rules-mode-header">
              <strong>4 Players</strong>
              <span className="rules-mode-tag">Classic</span>
            </div>
            <p>Standard Spades. 2 teams of 2, partners sit across. Full 52-card deck, 13 cards each.</p>
          </div>

          <div className="rules-mode-card">
            <div className="rules-mode-header">
              <strong>5 Players</strong>
              <span className="rules-mode-tag">2 teams + spoiler</span>
            </div>
            <p>2 pairs and 1 solo "spoiler." 13 mega cards are added to the deck so everyone gets 13 cards. The spoiler scores double on made bids and nils.</p>
          </div>

          <div className="rules-mode-card">
            <div className="rules-mode-header">
              <strong>6 Players</strong>
              <span className="rules-mode-tag">3 teams of 2</span>
            </div>
            <p>3 pairs competing against each other. 26 mega cards added, 13 cards each. Partners sit across the table.</p>
          </div>

          <div className="rules-mode-card">
            <div className="rules-mode-header">
              <strong>7 Players</strong>
              <span className="rules-mode-tag">3 teams + spoiler</span>
            </div>
            <p>3 pairs and 1 solo spoiler. 39 mega cards added, 13 cards each. Same spoiler rules as 5-player.</p>
          </div>

          <div className="rules-mode-card">
            <div className="rules-mode-header">
              <strong>8 Players</strong>
              <span className="rules-mode-tag">4 teams of 2</span>
            </div>
            <p>4 pairs. A full set of mega cards is added (one for every card in the deck), 13 cards each. Partners sit across.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'mega',
    title: 'Mega Cards (5-8 Player)',
    content: (
      <>
        <p>In 5-8 player modes, <strong>mega cards</strong> are added to the deck so there are enough cards for everyone. They're duplicates of existing cards starting from the lowest ranks upward. Mega cards look like regular cards but have a glowing border.</p>
        <p>How they rank:</p>
        <ul>
          <li>A mega card <strong>beats the same rank</strong> regular card (mega 7 beats regular 7)</li>
          <li>A mega card <strong>loses to the next rank up</strong> (mega 7 loses to regular 8)</li>
        </ul>
        <div className="rules-callout">
          Think of mega cards as "half-ranks" — a mega 7 slots in between a regular 7 and a regular 8. Same follow-suit rules apply.
        </div>
      </>
    ),
  },
  {
    id: 'spoiler',
    title: 'The Spoiler (5 & 7 Player)',
    content: (
      <>
        <p>In 5 and 7-player games, one player is the <strong>spoiler</strong> — a solo player with no partner.</p>
        <ul>
          <li><strong>Double scoring:</strong> The spoiler earns double points on made bids (+20 per trick instead of +10) and double on successful nils (+200). Failed bids are penalized at double. Failed nils have no point penalty — with no partner to protect you, simply getting 0 points for the round is punishment enough.</li>
          <li><strong>No partner:</strong> The spoiler bids and plays alone. Nobody to cover for you or help make your bid.</li>
          <li><strong>Same win condition:</strong> The spoiler wins by reaching the same score target as everyone else.</li>
        </ul>
        <p>The spoiler is a high-risk, high-reward position — bold bids pay off big, but mistakes hurt.</p>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Game Settings',
    content: (
      <>
        <p>The room host can customize these before starting:</p>
        <table className="rules-table">
          <tbody>
            <tr>
              <td><strong>Players</strong></td>
              <td>3-8 (changes the mode)</td>
            </tr>
            <tr>
              <td><strong>Win Target</strong></td>
              <td>100-1000 (default 500)</td>
            </tr>
            <tr>
              <td><strong>Books for Penalty</strong></td>
              <td>5-15 (default 10)</td>
            </tr>
            <tr>
              <td><strong>Blind Nil</strong></td>
              <td>Bid nil before seeing cards (+/-200)</td>
            </tr>
            <tr>
              <td><strong>13-Bid Auto-Win</strong></td>
              <td>Bid 13 and take all tricks to win instantly</td>
            </tr>
            <tr>
              <td><strong>10-Trick Bonus</strong></td>
              <td>+50 for bidding and taking 10+ tricks</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'tips',
    title: 'Tips & Strategy',
    content: (
      <>
        <ul>
          <li><strong>Count your sure tricks</strong> — Aces and Kings are reliable. Bid conservatively at first.</li>
          <li><strong>Watch the books</strong> — If your team is near the penalty threshold, try to take exactly your bid.</li>
          <li><strong>Protect your partner's nil</strong> — Lead high cards to "eat" tricks before they're forced to win one.</li>
          <li><strong>Pay attention to what's been played</strong> — If all the high spades are gone, your mid-spade is a winner.</li>
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
          <li><strong>AFK timer</strong> — 60 seconds to act. After 3 timeouts, you're auto-played faster. Any action brings you back.</li>
          <li><strong>Spectators</strong> — Extra players beyond the mode's limit can watch live.</li>
          <li><strong>Chat</strong> — Toggle the chat window with the button in the corner.</li>
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
