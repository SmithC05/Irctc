import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/layout/Layout';

export default function TatkalArena() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [ws, setWs] = useState(null);
  const [status, setStatus] = useState('connecting...');
  const [tickets, setTickets] = useState(0);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null); // 'CONFIRMED' or 'SOLD_OUT'
  
  // A unique user ID for this session
  const userId = useRef(`user_${Math.random().toString(36).substr(2, 5)}`).current;
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom of logs
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    // We assume the C++ engine runs on port 18080 locally based on main.cpp
    const socket = new WebSocket(`ws://localhost:18080/ws/arena`);
    
    socket.onopen = () => {
      setStatus('connected');
      socket.send(JSON.stringify({
        action: 'JOIN',
        room_id: roomId
      }));
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'ROOM_JOINED':
            setTickets(data.available_tickets);
            setLogs(prev => [...prev, `Joined arena. ${data.available_tickets} tickets available.`]);
            break;
            
          case 'TICKET_BOOKED':
            setTickets(data.remaining);
            setLogs(prev => [...prev, `Ticket booked by ${data.user_id}. ${data.remaining} remaining.`]);
            break;
            
          case 'CONFIRMED':
            if (data.user_id === userId) {
              setResult('CONFIRMED');
              setLogs(prev => [...prev, `🎉 Your ticket is CONFIRMED!`]);
            }
            break;
            
          case 'SOLD_OUT':
            setResult('SOLD_OUT');
            setTickets(0);
            setLogs(prev => [...prev, `❌ Room is SOLD OUT!`]);
            break;
            
          case 'ERROR':
            setLogs(prev => [...prev, `⚠️ Error: ${data.message}`]);
            break;
            
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };
    
    socket.onclose = () => {
      setStatus('disconnected');
    };
    
    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('error');
    };
    
    setWs(socket);
    
    return () => {
      socket.close();
    };
  }, [roomId, userId]);

  const handleBookTicket = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        action: 'BOOK_TICKET',
        user_id: userId
      }));
    }
  };

  const createRoomAndConnect = async () => {
    try {
      // Helper to proxy room creation to the Node server
      const token = localStorage.getItem('token');
      await fetch('http://localhost:5000/api/tatkal/room/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ room_id: roomId, tickets: 50 })
      });
      // Refresh the page to reconnect
      window.location.reload();
    } catch (err) {
      alert('Failed to create room: ' + err.message);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div style={{
          background: 'var(--tk-navy)',
          color: '#FAF6EC',
          borderRadius: '8px',
          padding: '24px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-slab)' }}>
              Tatkal Arena ⚡
            </h1>
            <div className="text-sm px-3 py-1 rounded-full" style={{
              background: status === 'connected' ? 'var(--tk-signal-green)' : 'var(--tk-signal-red)',
              color: status === 'connected' ? '#000' : '#fff'
            }}>
              {status.toUpperCase()}
            </div>
          </div>
          
          <div className="mb-4 text-center p-6 rounded-lg" style={{ background: 'rgba(250,246,236,0.05)' }}>
            <p className="text-sm uppercase tracking-wider mb-2" style={{ color: 'var(--tk-brass)' }}>
              Available Tickets
            </p>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={tickets}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-6xl font-bold font-mono"
              >
                {tickets}
              </motion.div>
            </AnimatePresence>
          </div>

          {result && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="p-4 mb-6 rounded-lg text-center font-bold text-lg"
              style={{
                background: result === 'CONFIRMED' ? 'var(--tk-signal-green)' : 'var(--tk-signal-red)',
                color: result === 'CONFIRMED' ? '#000' : '#fff'
              }}
            >
              {result === 'CONFIRMED' ? '🎉 TICKET CONFIRMED!' : '❌ SOLD OUT'}
            </motion.div>
          )}

          {!result && status === 'connected' && (
            <button
              onClick={handleBookTicket}
              className="w-full py-4 rounded-lg font-bold text-xl uppercase tracking-wider transition-transform active:scale-95"
              style={{
                background: 'var(--tk-brass)',
                color: '#FAF6EC',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Smash to Book!
            </button>
          )}

          {status === 'error' && (
            <button
              onClick={createRoomAndConnect}
              className="w-full py-3 rounded-lg font-bold mt-4"
              style={{ background: 'var(--tk-ink)', color: '#fff' }}
            >
              Initialize Room (If not exists)
            </button>
          )}

          <div className="mt-8">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--tk-ink-muted)' }}>
              Live Feed
            </h3>
            <div className="h-48 overflow-y-auto rounded p-4 font-mono text-sm" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {logs.map((log, idx) => (
                <div key={idx} className="mb-1 pb-1 border-b border-gray-700 opacity-80">
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <button onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--tk-ink)' }}>
            ← Back to Search
          </button>
        </div>
      </div>
    </Layout>
  );
}
