import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DatePicker({ value, onChange, minDate, maxDate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value || new Date()));
  const containerRef = useRef(null);
  const [portalStyle, setPortalStyle] = useState({});

  useEffect(() => {
    function handleOutsideClick(e) {
      // Check if click is outside both the input container and the portal
      if (
        containerRef.current && 
        !containerRef.current.contains(e.target) &&
        !e.target.closest('.datepicker-portal')
      ) {
        setIsOpen(false);
      }
    }

    function updatePosition() {
      if (isOpen && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPortalStyle({
          position: 'absolute',
          top: rect.bottom + window.scrollY + 6,
          left: rect.left + window.scrollX,
          width: '280px',
          zIndex: 9999,
        });
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);

    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      // Listen to scroll on any scrollable parent to update position dynamically
      window.addEventListener('scroll', updatePosition, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const viewMonth = viewDate.getMonth();
  const viewYear = viewDate.getFullYear();

  // "To build the calendar grid, we need to know:
  // 1. Which day of the week the 1st falls on (getDay())
  // 2. How many days are in the month (new Date(y, m+1, 0).getDate())
  // We fill the grid with empty cells before day 1,
  // then number each day, then empty cells at the end
  // to complete the last row."
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handlePrevMonth = (e) => {
    e.preventDefault();
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.preventDefault();
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleDateClick = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (minDate && dateString < minDate) return;
    if (maxDate && dateString > maxDate) return;
    
    onChange(dateString);
    setIsOpen(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const minD = minDate ? minDate : '';
  const maxD = maxDate ? maxDate : '';
  const todayStr = new Date().toLocaleDateString('en-CA');

  return (
    <div ref={containerRef} className="relative w-full">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full border border-border rounded p-2 text-sm bg-secondary cursor-pointer h-[38px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <CalendarIcon size={14} className="text-gray-500" />
          <span style={{ color: 'var(--text-primary)' }}>{value ? formatDate(value) : 'Select date'}</span>
        </div>
        <ChevronDown size={14} className="text-gray-500" />
      </div>

      {isOpen && createPortal(
        <div className="datepicker-portal border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12)] p-4"
             style={{ ...portalStyle, backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <div className="flex justify-between items-center mb-4">
            <button onClick={handlePrevMonth} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#1a3a5c] hover:text-white transition-colors"
                    style={{ color: 'var(--text-primary)' }}>
              <ChevronLeft size={16} />
            </button>
            <div className="font-semibold text-[#1a3a5c] dark:text-[#f0c040]">
              {monthNames[viewMonth]} {viewYear}
            </div>
            <button onClick={handleNextMonth} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#1a3a5c] hover:text-white transition-colors"
                    style={{ color: 'var(--text-primary)' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="text-center text-[10px] uppercase text-gray-500">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-8 opacity-40"></div>
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const d = new Date(viewYear, viewMonth, day);
              const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              
              const isSelected = dateString === value;
              const isToday = dateString === todayStr;
              const isDisabled = (minD && dateString < minD) || (maxD && dateString > maxD);

              let classes = "h-8 w-8 mx-auto flex items-center justify-center rounded-full text-sm transition-colors ";
              
              if (isDisabled) {
                classes += "opacity-30 cursor-not-allowed";
              } else if (isSelected) {
                classes += "bg-[#1a3a5c] text-white cursor-pointer";
              } else {
                classes += "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ";
                if (isToday) classes += "border border-[#f0c040]";
              }

              return (
                <div 
                  key={day} 
                  onClick={() => !isDisabled && handleDateClick(day)}
                  className={classes}
                  style={!isSelected && !isDisabled ? { color: 'var(--text-primary)' } : {}}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
