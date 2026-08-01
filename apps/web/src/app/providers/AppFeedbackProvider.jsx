import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const AppFeedbackContext = createContext(null);
const MAX_VISIBLE_FEEDBACK_ITEMS = 3;
const SUCCESS_DISMISS_DELAY_MS = 3600;
const INFO_DISMISS_DELAY_MS = 4800;

export function AppFeedbackProvider({ children }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(({ kind = 'info', title, message = '', icon, action } = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item = { id, kind, title, message, icon, action };

    setItems((current) => [...current, item].slice(-MAX_VISIBLE_FEEDBACK_ITEMS));

    const delay = kind === 'success' ? SUCCESS_DISMISS_DELAY_MS : kind === 'info' ? INFO_DISMISS_DELAY_MS : null;
    if (delay) timersRef.current.set(id, window.setTimeout(() => dismiss(id), delay));

    return id;
  }, [dismiss]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  const value = useMemo(() => ({ items, notify, dismiss }), [items, notify, dismiss]);

  return <AppFeedbackContext.Provider value={value}>{children}</AppFeedbackContext.Provider>;
}

export function useAppFeedback() {
  const context = useContext(AppFeedbackContext);
  if (!context) throw new Error('useAppFeedback must be used inside AppFeedbackProvider');
  return context;
}
