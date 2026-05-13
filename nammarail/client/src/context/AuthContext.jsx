// =============================================================================
// NammaRail — Auth Context
// =============================================================================
//
// WHAT IS REACT CONTEXT?
// ─────────────────────────────────────────────────────────────────────────────
// Imagine you have user login data that 10 different components need:
// the Navbar needs it to show "Hi, Priya", the My Bookings page needs it
// to fetch the right bookings, and the cancel button needs it to send the
// right auth token.
//
// Without Context, you'd have to pass this data down as props through every
// intermediate component — App → Layout → Navbar → NavMenu → NavItem.
// That's called "prop drilling" and it's messy and fragile.
//
// React Context creates a "global store" that any component in the tree can
// read directly, without props being passed manually at every level.
// Think of it like a radio broadcast — one sender, any component can tune in.
//
// WHAT IS useReducer?
// ─────────────────────────────────────────────────────────────────────────────
// useState is great for simple values (isOpen, count, etc.).
// useReducer is better when:
//   - Multiple pieces of state change together (user + token + isLoggedIn)
//   - State changes are based on well-defined "actions" (LOGIN, LOGOUT)
//   - You want the logic centralized in one function, not scattered across the component
//
// useReducer takes (state, action) and returns the next state.
// It's the same pattern as Redux, just without the library.
//
// WHY localStorage FOR TOKENS?
// ─────────────────────────────────────────────────────────────────────────────
// When a user logs in, we save the JWT to localStorage.
// This means if they close the tab and come back, they're still logged in —
// the token persists across browser sessions.
//
// ⚠️ SECURITY NOTE: localStorage is readable by JavaScript on the page,
// which makes it vulnerable to XSS attacks. In production, use httpOnly
// cookies (set by the server) instead — JavaScript can't read those.
// For this learning project, localStorage is acceptable.
// =============================================================================

import { createContext, useContext, useReducer, useEffect } from 'react';

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState = {
  user:       null,    // { id, name, email } or null
  token:      null,    // JWT string or null
  isLoading:  true,    // true while we check localStorage on startup
  isLoggedIn: false,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

// A reducer is a pure function: given (currentState, action), return nextState.
// It never mutates state directly — always returns a new object.
function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        user:       action.payload.user,
        token:      action.payload.token,
        isLoggedIn: true,
        isLoading:  false,
      };
    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false,   // don't show spinner on logout
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

// ─── Context creation ─────────────────────────────────────────────────────────

const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On app startup: restore session from localStorage.
  // This runs once (empty dependency array = runs after first render only).
  useEffect(() => {
    const savedToken = localStorage.getItem('nammarail_token');
    const savedUser  = localStorage.getItem('nammarail_user');

    if (savedToken && savedUser) {
      try {
        dispatch({
          type:    'LOGIN',
          payload: { user: JSON.parse(savedUser), token: savedToken },
        });
      } catch {
        // Corrupted data in localStorage — wipe it and start fresh.
        localStorage.removeItem('nammarail_token');
        localStorage.removeItem('nammarail_user');
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // ── Exposed actions ──────────────────────────────────────────────────────

  function login(user, token) {
    // Persist to localStorage so the session survives page refresh.
    localStorage.setItem('nammarail_token',  token);
    localStorage.setItem('nammarail_user',   JSON.stringify(user));
    dispatch({ type: 'LOGIN', payload: { user, token } });
  }

  function logout() {
    localStorage.removeItem('nammarail_token');
    localStorage.removeItem('nammarail_user');
    dispatch({ type: 'LOGOUT' });
  }

  const value = {
    user:       state.user,
    token:      state.token,
    isLoading:  state.isLoading,
    isLoggedIn: state.isLoggedIn,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Custom hook ──────────────────────────────────────────────────────────────

// useAuth() is a convenience wrapper so components don't need to import
// both useContext AND AuthContext — they just import useAuth.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
