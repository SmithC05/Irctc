import React from 'react';

// We deliberately stop the progress bar
// at 85% instead of 100%. Reaching 100% before content
// loads would be a lie. 85% signals 'almost there' which
// feels accurate. This is the same pattern YouTube
// and GitHub use for their top loading bars.
export default function TrainLoader({ message = "Searching for trains", size = 'large' }) {
  const isLarge = size === 'large';
  
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${isLarge ? 'h-64 w-full' : ''}`}>
      
      {/* TOP: Animated train on track */}
      <div className="relative w-48 h-10 overflow-hidden hero-section" style={{ paddingBottom: '0' }}>
        <div className="train-track" style={{ bottom: '10px' }}></div>
        <div className="train-emoji" style={{ bottom: '12px' }}>🚂</div>
      </div>

      {/* MIDDLE: Progress bar */}
      <div className="w-48 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-[#f0c040] rounded-full" style={{ animation: 'trackFill 2s ease-out forwards' }}></div>
      </div>

      {/* BOTTOM: Message with animated dots */}
      <div className="text-[13px] text-gray-500 font-['Plus_Jakarta_Sans'] font-medium flex items-center gap-1">
        <span>{message}</span>
        <span className="flex">
          <span className="dot-1">.</span>
          <span className="dot-2">.</span>
          <span className="dot-3">.</span>
        </span>
      </div>
    </div>
  );
}
