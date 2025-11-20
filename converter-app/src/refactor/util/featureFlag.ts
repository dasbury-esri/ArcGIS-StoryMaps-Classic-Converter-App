// Only honor the current URL or a transient session flag (set before OAuth, cleared after)
export function useRefactorFlag(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('refactor') === '1') return true;
  // Transient flag set only if the param was present pre-auth
  return sessionStorage.getItem('refactorFlag') === '1';
}

// Utility to capture param before redirect (called by AuthProvider)
export function captureRefactorFlagIfPresent(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('refactor') === '1') {
    sessionStorage.setItem('refactorFlag', '1');
  }
}

// Utility to append param if previously captured (post-auth restore step)
export function restoreRefactorFlagToUrl(): void {
  const hasTransient = sessionStorage.getItem('refactorFlag') === '1';
  const params = new URLSearchParams(window.location.search);
  if (hasTransient && params.get('refactor') !== '1') {
    params.set('refactor', '1');
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }
}
