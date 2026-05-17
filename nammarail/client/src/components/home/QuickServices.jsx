import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function QuickServices() {
  const [showToast, setShowToast] = useState('');
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('opacity-100');
        observer.disconnect();
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const handleToast = (msg) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(''), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-5 mt-8 mb-12">
      <h2 className="text-[11px] uppercase tracking-widest text-gray-500 mb-4">Quick Services</h2>
      <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-3 opacity-0 transition-opacity duration-500">
        <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="card-hover border border-border rounded p-3 text-center transition-all duration-200 fade-up-1">
          <div className="text-xl mb-1">🎫</div>
          <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">Book Ticket</div>
        </button>
        <button onClick={() => handleToast('PNR Status Coming soon')} className="card-hover border border-border rounded p-3 text-center transition-all duration-200 fade-up-2 relative">
          <div className="text-xl mb-1">📋</div>
          <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">PNR Status</div>
        </button>
        <button onClick={() => handleToast('Train Schedule Coming soon')} className="card-hover border border-border rounded p-3 text-center transition-all duration-200 fade-up-3">
          <div className="text-xl mb-1">🚉</div>
          <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">Train Schedule</div>
        </button>
        <button onClick={() => navigate('/my-bookings')} className="card-hover border border-border rounded p-3 text-center transition-all duration-200 fade-up-4">
          <div className="text-xl mb-1">❌</div>
          <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">Cancel Ticket</div>
        </button>
      </div>
      {showToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-[#0f2744] text-white px-4 py-2 rounded shadow-lg text-sm z-50">
          {showToast}
        </div>
      )}
    </div>
  );
}
