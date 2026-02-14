import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function Chat() {
  const socket = useSocket();
  const { state } = useGame();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatMessages]);

  const handleSend = () => {
    if (!message.trim()) return;
    socket.emit('send_chat', { message: message.trim() });
    setMessage('');
  };

  return (
    <div className="chat">
      <div className="chat-header">Chat</div>
      <div className="chat-messages">
        {state.chatMessages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.sender ? '' : 'system-msg'}`}>
            {msg.sender ? (
              <>
                <span className="chat-sender">{msg.sender}</span>
                <span className="chat-text">{msg.message}</span>
              </>
            ) : (
              <span className="chat-system">{msg.message}</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Type a message..."
          maxLength={200}
        />
        <button onClick={handleSend} className="btn btn-small">Send</button>
      </div>
    </div>
  );
}
