// =============================================================================
// NammaRail — StationAutocomplete Component
// =============================================================================
//
// A reusable input with live station search dropdown.
// Used for both "From" and "To" fields on the home page.
//
// HOW DROPDOWN POSITIONING WORKS:
// ─────────────────────────────────────────────────────────────────────────────
// position:relative on the root div creates a new positioning context.
// position:absolute on the dropdown makes it position relative to the nearest
// ancestor with position:relative — which is now the root div.
// This keeps the dropdown the same width as the input and places it directly
// below, preventing it bleeding into sibling elements.
//
// WHY WE USE A PLAIN <div> FOR THE DROPDOWN (not motion.div):
// ─────────────────────────────────────────────────────────────────────────────
// CSS transform creates a stacking context even when the value is transform:none.
// This is a known browser behaviour — the mere PRESENCE of the transform property
// triggers stacking context creation, regardless of the value.
//
// Framer Motion applies `transform` automatically to every motion.div element
// as part of its animation engine (e.g. translateX(0px), translateY(0px)).
// Even at rest this traps all child z-index values inside the motion.div's
// stacking context, making z-index:9999 on the dropdown evaluate WITHIN the
// motion wrapper rather than on the page.
//
// We deliberately avoid motion.div for the dropdown element. While Framer
// Motion is excellent for UI animations, its transform-based engine creates
// stacking contexts that interfere with z-index. For elements that need precise
// z-index control (dropdowns, tooltips, modals), use plain divs with CSS
// transitions instead.
//
// Framer Motion is still used for:
//   • SelectedDisplay — not a z-index-sensitive element ✓
//   • The input fade (motion.div around the <input>) — same ✓
//   • The min-character hint — same ✓
//
// OVERFLOW CHAIN:
// Every ancestor between the root div and the page must have overflow:visible
// (the default). overflow:hidden on any ancestor would clip the dropdown
// regardless of z-index. SearchCard's field wrappers must never set overflow:hidden.
//
// UX FEATURES:
// 1. hasError prop: Red border when parent form submits with empty field.
// 2. Keyboard navigation: ArrowDown/Up, Enter, Escape — full a11y.
// 3. Keyboard scroll: Highlighted item auto-scrolls into view.
// 4. Min-character hint: "Type at least 2 characters" shown while < 2 chars typed.
// 5. Flip-above: If insufficient space below, dropdown opens above the input.
// 6. Outside click: mousedown listener closes dropdown on external clicks.
//
// DEBOUNCING: 280ms after last keystroke before API fires.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { searchStations } from '../../api/trainApi';

const ease = [0.22, 1, 0.36, 1];

// ─── Selected station display ─────────────────────────────────────────────────
// motion.div is fine here — SelectedDisplay is not z-index-sensitive.
// It appears inline in the form, not as a floating overlay.
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
        <div
          className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-xs font-bold tracking-wider"
          style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}
        >
          {station.code}
        </div>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {station.name}
        </p>
      </div>

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
//
// PLAIN <div> — NOT motion.div. See the file header for the full explanation.
//
// Summary: motion.div sets `transform` on the element which creates a CSS
// stacking context. The dropdown's z-index:9999 would then be scoped inside
// that stacking context instead of the page, causing sibling elements to
// paint over it. A plain <div> with CSS opacity transition gives us the
// fade-in without creating any stacking context.
//
// showAbove: when there is < 250px of space below the input, the dropdown
// flips to render above the input instead of below.
function SuggestionDropdown({
  suggestions, isLoading, highlightedIndex,
  onSelect, onHighlight, searchTerm, showAbove, portalStyles, dropdownRef
}) {
  const listRef = useRef(null);

  // Scroll highlighted item into view when user navigates with keyboard.
  // Without this, items near the bottom of the list are hidden off-screen.
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    items[highlightedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  const content = isLoading ? (
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
    <div className="py-3 px-3 flex justify-center items-center text-center">
      <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        No stations found for '{searchTerm}'
      </span>
    </div>
  ) : (
    <div ref={listRef}>
      {suggestions.slice(0, 8).map((s, i) => {
        const isHighlighted = i === highlightedIndex;
        return (
          <div
            key={s.code}
            role="option"
            aria-selected={isHighlighted}
            onMouseDown={() => onSelect(s)}
            onMouseEnter={() => onHighlight(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              cursor: 'pointer',
              borderBottom: '0.5px solid #f0f0f0',
              background: isHighlighted ? '#1a3a5c' : 'transparent',
              transition: 'background 0.12s',
            }}
          >
            {/* Station code badge */}
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 3,
              background: isHighlighted ? 'rgba(255,255,255,0.2)' : '#1a3a5c',
              color: '#fff',
              minWidth: 36,
              textAlign: 'center',
              flexShrink: 0,
              letterSpacing: '0.03em',
            }}>
              {s.code}
            </span>
            {/* Station name */}
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: isHighlighted ? '#fff' : '#1a1a18',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {s.name}
            </span>
          </div>
        );
      })}
    </div>
  );

  // Plain <div> rendered into document.body via Portal to bypass
  // any deeply nested stacking contexts entirely.
  // CSS opacity transition provides a subtle fade-in.
  return createPortal(
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Station suggestions"
      style={{
        position: 'absolute',
        ...portalStyles,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderTop: '2px solid #1a3a5c',
        borderRadius: showAbove ? '6px 6px 0 0' : '0 0 6px 6px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.14)',
        maxHeight: 260,
        overflowY: 'auto',
        // CSS transition for fade-in
        opacity: 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {content}
    </div>,
    document.body
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
  const [portalStyles,     setPortalStyles]     = useState({});

  // containerRef is attached to the ROOT div (position:relative).
  const containerRef = useRef(null);
  const inputRef     = useRef(null);
  const dropdownRef  = useRef(null);

  // ── Portal Positioning ──────────────────────────────────────────────────────
  const updateDropdownPosition = useCallback(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const willShowAbove = spaceBelow < 250;
      setShowAbove(willShowAbove);

      setPortalStyles({
        width: rect.width,
        left: rect.left + window.scrollX,
        ...(willShowAbove
          ? { top: rect.top + window.scrollY - 4, transform: 'translateY(-100%)' }
          : { top: rect.bottom + window.scrollY + 2, transform: 'none' })
      });
    }
  }, [isOpen, suggestions]);

  useEffect(() => {
    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [updateDropdownPosition]);

  // ── Outside click detection ────────────────────────────────────────────────
  useEffect(() => {
    function handleOutsideClick(e) {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(e.target))
      ) {
        setIsOpen(false);
        setIsFocused(false);
        if (!value) setInputText('');
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [value]);

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
    }, 280);

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

  // ── Input border style ─────────────────────────────────────────────────────
  // Priority: error (red) > focused (brand gold) > default
  const inputBorderStyle = hasError && !isFocused
    ? { borderColor: 'var(--error)', boxShadow: '0 0 0 3px var(--error-ring)' }
    : {};

  // ── Render ─────────────────────────────────────────────────────────────────
  //
  // ROOT DIV: position:relative — the dropdown's positioning anchor.
  // No z-index, no animation, no transform → no stacking context created here.
  //
  // DROPDOWN: rendered as a direct child of this root div (sibling of the input
  // container). It uses position:absolute + z-index:9999 with a plain <div>
  // (not motion.div) so no transform stacking context interferes.
  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      <label className="form-label" htmlFor={`station-autocomplete-${label.toLowerCase()}`}>
        {label}
      </label>

      {/* Input area — shows either the selected station pill or the text input.
          motion.div is fine here (not z-index-sensitive). */}
      <AnimatePresence mode="wait">
        {value ? (
          <SelectedDisplay key="selected" station={value} onClear={clearSelection} />
        ) : (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'relative' }}
          >
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
            {/* Search icon / spinner — inside the input, not z-index-sensitive */}
            {isLoading ? (
              <div className="input-icon flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }} />
              </div>
            ) : (
              <Search size={16} strokeWidth={2} className="input-icon" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Min-character hint — motion.div is fine here (not z-index-sensitive) */}
      <AnimatePresence>
        {!value && inputText.length > 0 && inputText.length < 2 && (
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

      {/* DROPDOWN — plain <div>, not motion.div.
          See file header for full explanation. Short version:
          motion.div sets `transform` which creates a CSS stacking context,
          trapping z-index:9999 inside the motion wrapper.
          Plain <div> + CSS opacity transition = same visual effect, no stacking context. */}
      {!value && isOpen && (suggestions.length > 0 || isLoading) && (
        <SuggestionDropdown
          suggestions={suggestions}
          isLoading={isLoading}
          highlightedIndex={highlightedIndex}
          onSelect={selectStation}
          onHighlight={setHighlightedIndex}
          searchTerm={inputText}
          showAbove={showAbove}
          portalStyles={portalStyles}
          dropdownRef={dropdownRef}
        />
      )}
    </div>
  );
}
