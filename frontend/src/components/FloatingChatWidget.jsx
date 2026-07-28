import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import SabDekho from '../pages/SabDekho';

import { API } from '../constants';
import { getToken } from '../utils';

const FloatingChatWidget = ({ getToken }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [height, setHeight] = useState(500);
  const [width, setWidth] = useState(350);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const isResizing = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const handleAsk = async () => {
    if (!query.trim()) return;
    const userMsg = query;
    setQuery('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ query: userMsg })
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: 'ai', text: data.success ? data.result : data.message }]);
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "Failed to connect to Nagapandi." }]);
    }
    setChatLoading(false);
  };

  const handleMouseDown = (e, direction) => {
    e.preventDefault();
    isResizing.current = true;
    const startY = e.clientY;
    const startX = e.clientX;
    const startHeight = height;
    const startWidth = width;

    const handleMouseMove = (moveEvent) => {
      if (!isResizing.current) return;
      
      if (direction === 'top' || direction === 'top-left') {
        const diffY = startY - moveEvent.clientY;
        const newHeight = Math.max(300, Math.min(window.innerHeight - 100, startHeight + diffY));
        setHeight(newHeight);
      }
      
      if (direction === 'left' || direction === 'top-left') {
        const diffX = startX - moveEvent.clientX;
        const newWidth = Math.max(250, Math.min(window.innerWidth - 40, startWidth + diffX));
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      <button 
        className="floating-chat-btn" 
        onClick={() => setIsOpen(!isOpen)}
        title="Chat with Nagapandi"
      >
        ✨
      </button>

      {isOpen && (
        <div className="floating-chat-window" style={{ height: `${height}px`, width: `${width}px` }}>
          {/* Top-Left Corner Handle */}
          <div 
            onMouseDown={(e) => handleMouseDown(e, 'top-left')}
            style={{
              height: '15px', width: '15px', cursor: 'nwse-resize',
              position: 'absolute', top: 0, left: 0, zIndex: 12
            }}
          />
          {/* Top Handle */}
          <div 
            onMouseDown={(e) => handleMouseDown(e, 'top')}
            style={{
              height: '8px', width: 'calc(100% - 15px)', cursor: 'ns-resize',
              position: 'absolute', top: 0, left: '15px', zIndex: 11
            }}
          />
          {/* Left Handle */}
          <div 
            onMouseDown={(e) => handleMouseDown(e, 'left')}
            style={{
              height: 'calc(100% - 15px)', width: '8px', cursor: 'ew-resize',
              position: 'absolute', top: '15px', left: 0, zIndex: 11
            }}
          />

          <div className="chat-header" style={{ paddingTop: '12px', paddingLeft: '12px' }}>
            <span style={{fontSize: '1.2rem', marginRight: '8px'}}>✨</span> 
            <span style={{fontWeight: 600}}>Nagapandi</span>
            <button className="chat-close" onClick={() => setIsOpen(false)}>×</button>
          </div>
          
          <div className="chat-messages">
            {chatHistory.length === 0 && (
              <div style={{color: 'var(--text3)', textAlign: 'center', marginTop: '2rem', fontSize: '0.9rem'}}>
                Ask me anything about your finances, health, or movies!
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.text}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble ai loading">
                <span className="spinner">✨</span> Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input 
              ref={inputRef}
              type="text" 
              placeholder="Ask a question..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
            />
            <button onClick={handleAsk} disabled={chatLoading || !query.trim()}>
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
};
export default FloatingChatWidget;
