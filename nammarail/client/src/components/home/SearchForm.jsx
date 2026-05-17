import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StationAutocomplete from '../ui/StationAutocomplete';
import DatePicker from '../ui/DatePicker';

function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function getMaxDateStr() {
  const d = new Date(); d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}
function getDayName(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' });
}

export default function SearchForm() {
  const navigate = useNavigate();
  const [fromStation, setFromStation] = useState(null);
  const [toStation, setToStation] = useState(null);
  const [date, setDate] = useState(getTodayStr());
  const [classCode, setClassCode] = useState('');
  const [quota, setQuota] = useState('general');
  const [errors, setErrors] = useState({});
  const [isSearching, setIsSearching] = useState(false);

  const handleSwap = () => {
    setFromStation(toStation);
    setToStation(fromStation);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!fromStation) newErrors.from = 'Please select a departure station';
    if (!toStation) newErrors.to = 'Please select an arrival station';
    if (fromStation && toStation && fromStation.code === toStation.code) newErrors.same = 'Departure and arrival cannot be same';
    if (!date) newErrors.date = 'Please select a date';
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length === 0) {
      setIsSearching(true);
      const params = new URLSearchParams({
        from: fromStation.code, to: toStation.code,
        fromName: fromStation.name, toName: toStation.name,
        date, quota, ...(classCode && { class: classCode })
      });
      
      // We add a 300ms delay before navigating so the loading state is actually visible to the user.
      // Instant navigation feels jarring — a brief pause with visual feedback feels more responsive, not less.
      setTimeout(() => {
        navigate(`/search-results?${params.toString()}`);
      }, 300);
    }
  };

  return (
    <form onSubmit={handleSearch} className="booking-form p-4 sm:p-5">
      <div className="flex flex-col md:flex-row gap-3 items-start mb-4">
        <div className="flex-1 w-full fade-up-1">
          <StationAutocomplete label="From" value={fromStation} onChange={setFromStation} hasError={!!errors.from} />
          {errors.from && <div className="text-[#C0392B] dark:text-[#E05A4A] text-[11px] mt-1 animate-pulse">{errors.from}</div>}
        </div>
        
        <button type="button" onClick={handleSwap} 
          className="self-center mt-6 w-8 h-8 rounded-full border border-border bg-secondary flex items-center justify-center transition-transform duration-300 hover:rotate-180 flex-shrink-0 fade-up-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 21l6-6M9 8L3 2M3 2v5M3 2h5" />
          </svg>
        </button>
        
        <div className="flex-1 w-full fade-up-3">
          <StationAutocomplete label="To" value={toStation} onChange={setToStation} hasError={!!errors.to} />
          {errors.to && <div className="text-[#C0392B] dark:text-[#E05A4A] text-[11px] mt-1 animate-pulse">{errors.to}</div>}
          {errors.same && <div className="text-[#C0392B] dark:text-[#E05A4A] text-[11px] mt-1 animate-pulse">{errors.same}</div>}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start mb-5">
        <div className="flex-1 w-full fade-up-4">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Date</label>
          <DatePicker value={date} onChange={setDate} minDate={getTodayStr()} maxDate={getMaxDateStr()} />
          <div className="text-[11px] text-[#1a3a5c] dark:text-[#f0c040] mt-1">{getDayName(date)}</div>
          {errors.date && <div className="text-[#C0392B] dark:text-[#E05A4A] text-[11px] mt-1 animate-pulse">{errors.date}</div>}
        </div>
        
        <div className="flex-1 w-full fade-up-5">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Class</label>
          <select value={classCode} onChange={e => setClassCode(e.target.value)} className="w-full border border-border rounded p-2 text-sm bg-secondary appearance-none h-[38px]" style={{ color: 'var(--text-primary)' }}>
            <option value="">All Classes</option>
            <option value="SL">Sleeper (SL)</option>
            <option value="3A">Third AC (3A)</option>
            <option value="2A">Second AC (2A)</option>
            <option value="1A">First AC (1A)</option>
            <option value="CC">Chair Car (CC)</option>
          </select>
        </div>

        <div className="flex-1 w-full fade-up-5">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quota</label>
          <div className="flex bg-secondary border border-border rounded p-[3px] h-[38px]">
            <button type="button" onClick={() => setQuota('general')} 
              className={`flex-1 text-[12px] rounded transition-colors ${quota === 'general' ? 'bg-[#1a3a5c] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              General
            </button>
            <button type="button" onClick={() => setQuota('tatkal')} 
              className={`flex-1 text-[12px] rounded transition-colors ${quota === 'tatkal' ? 'bg-[#1a3a5c] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              Tatkal
            </button>
          </div>
          {quota === 'tatkal' && (
            <div className="text-[10px] text-amber-600 mt-1.5 leading-tight">Tatkal opens 1 day before journey. No refund on cancellation.</div>
          )}
        </div>
      </div>

      <button type="submit" disabled={isSearching} className="w-full bg-[#1a3a5c] text-white font-medium py-3 rounded text-[14px] btn-search transition-colors flex items-center justify-center gap-2 disabled:opacity-90 disabled:cursor-not-allowed">
        {isSearching ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            Searching<span className="flex"><span className="dot-1">.</span><span className="dot-2">.</span><span className="dot-3">.</span></span>
          </>
        ) : (
          <>
            <span>🔍</span> Search Trains
          </>
        )}
      </button>
    </form>
  );
}
