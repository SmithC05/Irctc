import React, { useState, useEffect, useRef } from 'react';
import { getStats } from '../../api/trainApi';

// easeOut function makes counting start fast and slow at the end
const easeOut = t => 1 - Math.pow(1 - t, 3);

function useCountUp(target, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    // IntersectionObserver fires a callback when an element enters or leaves the viewport.
    // We use it to start the count-up only when the user can actually see the stats — 
    // not immediately on page load when the section might be off-screen.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && target > 0) {
        let startTime = null;
        const animate = (currentTime) => {
          if (!startTime) startTime = currentTime;
          const progress = Math.min((currentTime - startTime) / duration, 1);
          setCount(Math.floor(easeOut(progress) * target));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        observer.disconnect();
      }
    }, { threshold: 0.1 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
}

export default function StatsBar() {
  const [stats, setStats] = useState({ trainCount: 0, stationCount: 0, fareCount: 0 });

  useEffect(() => {
    getStats()
      .then(res => setStats(res.data))
      .catch(() => {
        // We always show a fallback so the stats
        // section never displays zeros. Real data is preferred
        // but hardcoded fallback is better than zeros.
        setStats({ trainCount: 3292, stationCount: 71056, fareCount: 326643 });
      });
  }, []);

  const { count: trains, ref: ref1 } = useCountUp(stats.trainCount);
  const { count: stops } = useCountUp(stats.stationCount);
  const { count: fares } = useCountUp(stats.fareCount);

  // Indian number format groups differently from Western format.
  // In India: 3,26,643 (first group is 3 digits from right, then 2 digits each). 
  // toLocaleString('en-IN') handles this.
  return (
    <div ref={ref1} className="bg-secondary border-y border-border py-4 mt-6">
      <div className="max-w-5xl mx-auto px-5 flex justify-between text-center divide-x divide-border">
        <div className="flex-1 px-2">
          <div className="text-[18px] md:text-[20px] font-semibold text-[#1a3a5c] dark:text-[#f0c040]">
            {trains.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] md:text-[11px] text-gray-500 uppercase tracking-widest mt-1">Trains in database</div>
        </div>
        <div className="flex-1 px-2">
          <div className="text-[18px] md:text-[20px] font-semibold text-[#1a3a5c] dark:text-[#f0c040]">
            {stops.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] md:text-[11px] text-gray-500 uppercase tracking-widest mt-1">Station stops</div>
        </div>
        <div className="flex-1 px-2">
          <div className="text-[18px] md:text-[20px] font-semibold text-[#1a3a5c] dark:text-[#f0c040]">
            {fares.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] md:text-[11px] text-gray-500 uppercase tracking-widest mt-1">Fare records</div>
        </div>
      </div>
    </div>
  );
}
