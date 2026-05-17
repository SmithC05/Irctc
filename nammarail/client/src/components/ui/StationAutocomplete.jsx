// =============================================================================
// NammaRail — StationAutocomplete Component
// =============================================================================
//
// A reusable input with live station search dropdown.
// Used for both "From" and "To" fields on the home page.
//
// UX IMPROVEMENTS IN THIS VERSION:
// ─────────────────────────────────────────────────────────────────────────────
// 1. hasError prop: When the parent form detects a missing station, this prop
//    turns the input border red — giving the user a direct visual cue without
//    needing to read an error message first.
//
// 2. Keyboard scroll-into-view: When the user presses ArrowDown to move through
//    suggestions, the highlighted item is scrolled into view automatically.
//    Without this, items near the bottom of a long list are hidden.
//
// 3. Min-character hint: While the input has fewer than 2 characters, a small
//    hint "Type at least 2 characters to search" is shown. This explains the
//    debounce threshold to users who wonder why nothing happens on the first key.
//
// 4. No-results with search term: "No stations found for 'xyz'" is more
//    informative than a generic "No stations found".
//
// DEBOUNCING: 300ms after last keystroke before API fires.
// OUTSIDE CLICK: document mousedown checks containerRef boundary.
// KEYBOARD: ArrowDown/Up, Enter, Escape — full keyboard accessibility.
// MOBILE: position:absolute dropdown scrolls with the form, not fixed to viewport.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Search } from 'lucide-react';
import { searchStations } from '../../api/trainApi';

const ease = [0.22, 1, 0.36, 1];

// ─── Selected station display ─────────────────────────────────────────────────
function SelectedDisplay({ station, onClear }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      transition={{ duration: 0.2, ease }}
      className="flex items-center justify-between px-4 py-3 rounded-xl cursor-default"
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1.5px solid var(--brand)',
        boxShadow: '0 0 0 3px var(--brand-glow)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Station code tag */}
        <div
          className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-xs font-bold tracking-wider"
          style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
        >
          {station.code}
        </div>
        {/* Station name */}
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {station.name}
        </p>
      </div>

      {/* Clear button */}
      <motion.button
        type="button"
        onClick={onClear}
        aria-label="Clear station selection"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.88 }}
        transition={{ duration: 0.14 }}
        className="ml-3 flex items-center justify-center w-6 h-6 rounded-full
                   flex-shrink-0 transition-colors duration-150"
        style={{ color: 'var(--text-tertiary)' }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        <X size={12} strokeWidth={2.5} />
      </motion.button>
    </motion.div>
  );
}

// ─── Dropdown list ────────────────────────────────────────────────────────────
function SuggestionDropdown({
  suggestions, isLoading, highlightedIndex,
  onSelect, onHighlight, searchTerm, showAbove
}) {
  const listRef = useRef(null);

  // Scroll highlighted item into view when user navigates with keyboard
  // Without this, items at the bottom of the list are hidden off-screen
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    items[highlightedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  const content = isLoading ? (
    // Spinner while API is fetching
    <div className="flex items-center justify-center gap-2 py-4 px-4">
      <div
        className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0"
        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }}
      />
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Searching stations…
      </span>
    </div>
  ) : suggestions.length === 0 ? (
    // Informed empty state
    <div className="py-3 px-3 flex justify-center items-center text-center">
      <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        No stations found for '{searchTerm}'
      </span>
    </div>
  ) : (
    // Results list — max 5 visible before scroll
    <div ref={listRef}>
      {suggestions.slice(0, 5).map((s, i) => {
        const isHighlighted = i === highlightedIndex;
        return (
          <div
            key={s.code}
            role="option"
            aria-selected={isHighlighted}
            onMouseDown={() => onSelect(s)}
            onMouseEnter={() => onHighlight(i)}
            className="station-option"
          >
            {/* Station code pill */}
            <span className="station-code">
              {s.code}
            </span>
            {/* Station name */}
            <span className="station-name">
              {s.name}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -4, scale: 0.98  }}
      transition={{ duration: 0.18, ease }}
      // position:absolute removes the element from normal document
      // flow — it no longer pushes other elements down. z-index:9999
      // ensures it appears above ALL other elements on the page.
      // station-dropdown applies absolute positioning, z-index, max-height, etc.
      // We still conditionally apply bottom-full if showAbove is true to flip it.
      className={`station-dropdown ${showAbove ? 'bottom-full !top-auto !mb-[6px]' : ''}`}
      role="listbox"
      aria-label="Station suggestions"
    >
      {content}
    </motion.div>
  );
}

// ─── Main StationAutocomplete ──────────────────────────────────────────────────

/**
 * @param {string}           label       — "From" or "To"
 * @param {string}           placeholder — hint text inside input
 * @param {{code,name}|null} value       — controlled selected station
 * @param {Function}         onChange    — called with {code,name} on selection
 * @param {string}           excludeCode — code to hide from suggestions
 * @param {boolean}          hasError    — shows error border when true
 */
export default function StationAutocomplete({
  label,
  placeholder = 'City or station code',
  value,
  onChange,
  excludeCode,
  hasError = false,
}) {
  const [inputText,        setInputText]        = useState('');
  const [suggestions,      setSuggestions]      = useState([]);
  const [isOpen,           setIsOpen]           = useState(false);
  const [isLoading,        setIsLoading]        = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFocused,        setIsFocused]        = useState(false);
  const [showAbove,        setShowAbove]        = useState(false);

  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // ── Outside click detection ────────────────────────────────────────────────
  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setIsFocused(false);
        if (!value) setInputText('');
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [value]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // We check how much space is below the input.
      // If less than 250px (not enough for dropdown), we flip it
      // to appear above the input instead. This prevents the
      // dropdown from going off-screen at the bottom.
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setShowAbove(spaceBelow < 250);
    }
  }, [isOpen, suggestions]);

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (inputText.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setIsOpen(true);
      try {
        const res = await searchStations(inputText);
        const filtered = (res.data ?? []).filter(s => s.code !== excludeCode);
        setSuggestions(filtered);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 280); // Slightly tighter than 300ms for snappier feel

    return () => clearTimeout(timer);
  }, [inputText, excludeCode]);

  // ── Select station ─────────────────────────────────────────────────────────
  const selectStation = useCallback((station) => {
    onChange(station);
    setInputText('');
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  // ── Clear selection ────────────────────────────────────────────────────────
  function clearSelection() {
    onChange(null);
    setInputText('');
    setSuggestions([]);
    setIsOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) setIsOpen(true);
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      selectStation(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  }

  // ── Input focus border style ───────────────────────────────────────────────
  // Priority order: error (red) > focused (brand gold) > default
  const inputBorderStyle = hasError && !isFocused
    ? {
        borderColor: 'var(--error)',
        boxShadow: '0 0 0 3px var(--error-ring)',
      }
    : {};

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="station-input-wrapper">
      <label className="form-label" htmlFor={`station-autocomplete-${label.toLowerCase()}`}>
        {label}
      </label>

      <AnimatePresence mode="wait">
        {value ? (
          <SelectedDisplay key="selected" station={value} onClear={clearSelection} />
        ) : (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            <div className="relative">
              <input
                ref={inputRef}
                id={`station-autocomplete-${label.toLowerCase()}`}
                type="text"
                value={inputText}
                onChange={e => {
                  setInputText(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setIsFocused(true);
                  if (suggestions.length > 0) setIsOpen(true);
                }}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="form-input pr-9"
                style={inputBorderStyle}
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-label={`${label} station`}
              />
              {/* Search icon inside input — turns into spinner while loading */}
              {isLoading ? (
                <div className="input-icon flex items-center justify-center">
                  <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }} />
                </div>
              ) : (
                <Search size={16} strokeWidth={2} className="input-icon" />
              )}
            </div>

            {/* Minimum-character hint — shown only while typing < 2 chars */}
            <AnimatePresence>
              {inputText.length > 0 && inputText.length < 2 && (
                <motion.p
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{    opacity: 0         }}
                  transition={{ duration: 0.15 }}
                  className="mt-1.5 text-[11px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Type at least 2 characters to search
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dropdown */}
      <AnimatePresence>
        {!value && isOpen && (suggestions.length > 0 || isLoading) && (
          <SuggestionDropdown
            key="dropdown"
            suggestions={suggestions}
            isLoading={isLoading}
            highlightedIndex={highlightedIndex}
            onSelect={selectStation}
            onHighlight={setHighlightedIndex}
            searchTerm={inputText}
            showAbove={showAbove}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
