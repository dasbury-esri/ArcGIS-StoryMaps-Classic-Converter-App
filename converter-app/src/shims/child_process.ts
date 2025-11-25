// Browser shim for node:child_process to avoid Vite externalization errors.
// Any attempt to call execSync in the browser should fail fast.
export function execSync(): never {
  throw new Error('execSync is not available in the browser environment');
}

export default {} as unknown as {
  execSync: typeof execSync;
};
