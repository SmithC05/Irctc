import React from 'react';

export default function HeroSection() {
  return (
    // overflow:hidden on the hero is critical.
    // Without it, the train would be visible outside the hero
    // bounds as it moves off screen. overflow:hidden clips
    // anything outside the element's boundaries.
    <div className="bg-[#1a3a5c] hero-section flex items-center px-5 h-[90px] z-0">
      <div className="max-w-5xl mx-auto w-full">
        <h1 className="text-[20px] text-white font-semibold title-enter">Book Train Tickets Online</h1>
        <p className="text-[12px] text-white/60 subtitle-enter mt-0.5">Official booking portal · Real-time availability · Instant confirmation</p>
      </div>
      
      <div className="train-track"></div>
      <div className="train-emoji">🚂</div>
    </div>
  );
}
