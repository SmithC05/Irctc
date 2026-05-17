import React, { useState } from 'react';
import HomeNav from '../components/home/HomeNav';
import HeroSection from '../components/home/HeroSection';
import SearchForm from '../components/home/SearchForm';
import StatsBar from '../components/home/StatsBar';
import QuickServices from '../components/home/QuickServices';

// ─── Animations & Styles ────────────────────────────────────────────────────
// EXPLAIN ANIMATION KEYFRAMES:
// @keyframes fieldFadeUp: Starts element 8px lower and transparent, then animates it up to its natural position while fading in to full opacity.
// @keyframes goldPulse: Expands a gold box-shadow outwards to 8px while fading its opacity to 0, creating a glowing pulse effect.
const styles = `
  @keyframes fieldFadeUp {
    from { opacity: 0; transform: translateY(8px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  @keyframes goldPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(240,192,64,0.4) }
    50%       { box-shadow: 0 0 0 8px rgba(240,192,64,0) }
  }
  
  /* STAGGER ANIMATION TECHNIQUE: 
     By applying increasing animation-delay (0.1s, 0.2s, 0.3s) to each field, 
     they fade into view sequentially, drawing the user's eye smoothly through the form. */
  .fade-up-1 { animation: fieldFadeUp 0.5s ease forwards; animation-delay: 0.1s; opacity: 0; }
  .fade-up-2 { animation: fieldFadeUp 0.5s ease forwards; animation-delay: 0.2s; opacity: 0; }
  .fade-up-3 { animation: fieldFadeUp 0.5s ease forwards; animation-delay: 0.3s; opacity: 0; }
  .fade-up-4 { animation: fieldFadeUp 0.5s ease forwards; animation-delay: 0.4s; opacity: 0; }
  .fade-up-5 { animation: fieldFadeUp 0.5s ease forwards; animation-delay: 0.5s; opacity: 0; }
  
  .btn-search { animation: goldPulse 2s infinite; }
  .btn-search:hover { animation: none; background-color: #0f2744; }
  .panel-enter { animation: fieldFadeUp 0.5s ease forwards; animation-delay: 0.2s; opacity: 0; }
  .title-enter { animation: fieldFadeUp 0.6s ease forwards; opacity: 0; }
  .subtitle-enter { animation: fieldFadeUp 0.6s ease forwards; animation-delay: 0.1s; opacity: 0; }
  .card-hover:hover { border-color: #1a3a5c; background-color: rgba(26,58,92,0.03); }
  .hide-scrollbar::-webkit-scrollbar { display: none; }
`;

export default function HomePage() {
  const [showTooltip, setShowTooltip] = useState(null);

  return (
    <div className="min-h-screen flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      
      <HomeNav />

      {/* SECTION 1: TOP INFO BAR */}
      <div className="bg-[#0f2744] text-white/70 text-[11px] py-1 px-4 flex justify-between items-center z-10 border-t border-white/10">
        <div className="hidden md:block">Ministry of Railways, Government of India</div>
        <div className="flex gap-3 md:ml-auto w-full md:w-auto justify-end">
          <a href="#" className="hover:text-white transition-colors">हिन्दी</a>
          <span>·</span>
          <a href="#" className="hover:text-white transition-colors">தமிழ்</a>
          <span>·</span>
          <a href="#" className="hover:text-white transition-colors">Help</a>
        </div>
      </div>

      <HeroSection />

      {/* SECTION 3: SEARCH PANEL */}
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-5 -mt-2 z-10 relative">
        <div className="bg-secondary border-t-[3px] border-[#f0c040] rounded-b-md shadow-md panel-enter">
          
          {/* Tabs are UI placeholders for future features. Only Book Ticket is implemented in this version. */}
          <div className="flex border-b border-border text-[13px] font-medium overflow-x-auto hide-scrollbar">
            <button className="px-5 py-3 border-b-2 border-[#f0c040] text-[#1a3a5c] dark:text-[#f0c040] whitespace-nowrap">
              Book Ticket
            </button>
            <div className="relative">
              <button 
                onMouseEnter={() => setShowTooltip('pnr')}
                onMouseLeave={() => setShowTooltip(null)}
                className="px-5 py-3 border-b-2 border-transparent text-gray-400 whitespace-nowrap cursor-not-allowed">
                PNR Status
              </button>
              {showTooltip === 'pnr' && <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded z-20">Coming soon</div>}
            </div>
            <div className="relative">
              <button 
                onMouseEnter={() => setShowTooltip('schedule')}
                onMouseLeave={() => setShowTooltip(null)}
                className="px-5 py-3 border-b-2 border-transparent text-gray-400 whitespace-nowrap cursor-not-allowed">
                Train Schedule
              </button>
              {showTooltip === 'schedule' && <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded z-20">Coming soon</div>}
            </div>
          </div>

          <SearchForm />
        </div>
      </div>

      <StatsBar />

      {/* SECTION 5: NOTICE BAR */}
      <div className="max-w-5xl mx-auto w-full px-5 mt-6">
        <div className="bg-[#FFF8E6] border border-[#f0c040] rounded px-3 py-2 flex items-start gap-3">
          <span className="bg-[#1a3a5c] text-white text-[10px] px-2 py-0.5 rounded font-medium mt-0.5 shrink-0">NOTICE</span>
          <p className="text-[11px] text-[#996500] leading-snug">
            Tatkal booking opens 1 day before journey date. No refund applicable on cancellation of Tatkal tickets.
          </p>
        </div>
      </div>

      <QuickServices />

      <div className="flex-grow"></div>

      {/* SECTION 7: FOOTER STRIP */}
      <div className="bg-[#0f2744] text-white/50 text-[10px] py-3 px-5 flex flex-col md:flex-row justify-between items-center gap-2 mt-auto">
        <div>© 2026 NammaRail · Ministry of Railways, Government of India</div>
        <div className="flex gap-3">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <span>·</span>
          <a href="#" className="hover:text-white transition-colors">Terms of Use</a>
          <span>·</span>
          <a href="#" className="hover:text-white transition-colors">Accessibility</a>
        </div>
      </div>
    </div>
  );
}
