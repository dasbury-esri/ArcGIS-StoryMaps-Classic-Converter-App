export function useRefactorFlag(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('refactor') === '1') return true;
  if (import.meta.env.VITE_USE_REFACTOR === 'true') return true;
  if (localStorage.getItem('useRefactor') === '1') return true;
  return false;
}
