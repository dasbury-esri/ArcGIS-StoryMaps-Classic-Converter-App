import { useEffect, useState } from 'react';

// Event name used to notify React hook consumers that flag state changed
const REFACTOR_FLAG_EVENT = 'refactor-flag-updated';

// Base synchronous check (used inside reactive hook and for quick reads)
export function useRefactorFlag(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('refactor') === '1';
}

// Reactive hook that updates when URL history changes or when restore is invoked
export function useRefactorFlagReactive(): boolean {
  const [flag, setFlag] = useState<boolean>(() => useRefactorFlag());
  useEffect(() => {
    const handler = () => setFlag(useRefactorFlag());
    window.addEventListener('popstate', handler);
    window.addEventListener(REFACTOR_FLAG_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener('popstate', handler);
      window.removeEventListener(REFACTOR_FLAG_EVENT, handler as EventListener);
    };
  }, []);
  return flag;
}

// Capture param before redirect (called by AuthProvider during sign-in)
export function captureRefactorFlagIfPresent(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('refactor') === '1') {
    sessionStorage.setItem('refactorFlag', '1');
  }
}

// Append param if previously captured (post-auth restore step) and emit event
export function restoreRefactorFlagToUrl(): void {
  const hasTransient = sessionStorage.getItem('refactorFlag') === '1';
  const params = new URLSearchParams(window.location.search);
  if (hasTransient && params.get('refactor') !== '1') {
    params.set('refactor', '1');
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }
  // Clear transient after restoration to avoid false positives on later loads
  if (hasTransient) sessionStorage.removeItem('refactorFlag');
  window.dispatchEvent(new Event(REFACTOR_FLAG_EVENT));
}
