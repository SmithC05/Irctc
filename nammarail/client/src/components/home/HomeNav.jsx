import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function HomeNav() {
  const { user } = useAuth();
  
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="bg-[#0f2744] text-white py-2 px-4 flex justify-between items-center z-20 relative">
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-[1px]">
          <div className="w-3 h-1 bg-[#FF9933]"></div>
          <div className="w-3 h-1 bg-white"></div>
          <div className="w-3 h-1 bg-[#138808]"></div>
        </div>
        <span className="text-sm font-bold tracking-tight text-[#f0c040]">NammaRail</span>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={toggleTheme}
          className="w-7 h-7 rounded-full border border-white/30 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
        
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/70">Hi, {user.name}</span>
            <Link to="/my-bookings" className="text-xs font-semibold px-3 py-1 rounded border border-white/50 hover:bg-white/10 transition-colors">
              My Bookings
            </Link>
          </div>
        ) : (
          <Link to="/login" className="text-xs font-semibold px-3 py-1 rounded border border-white/50 hover:bg-white/10 transition-colors">
            Login / Register
          </Link>
        )}
      </div>
    </div>
  );
}
