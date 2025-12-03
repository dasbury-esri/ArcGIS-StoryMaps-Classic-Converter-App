// src/components/Header.tsx
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../auth/useAuth";
import { APP_VERSION } from "../version";

function Header() {
  const { userInfo, token, signIn, signOut } = useAuth() as {
    userInfo: { username: string; fullName?: string; thumbnailUrl?: string } | null;
    token: string | null;
    signIn: () => void;
    signOut: () => void;
  };
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Cached profile now lives in userInfo via AuthProvider

  // Close menu on outside click or ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isAuthed = !!token && !!userInfo;
  const avatarText = userInfo?.username?.charAt(0).toUpperCase() || '?';
  const profileUrl = userInfo?.username ? `https://www.arcgis.com/home/user.html?user=${userInfo.username}` : undefined;
  const thumbnailUrl = userInfo?.thumbnailUrl || null;
  const fullName = userInfo?.fullName || userInfo?.username || '';

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-titles">
          <div className="top-nav-title">Classic StoryMap Converter</div>
          <div className="top-nav-subtitle">Alpha | v{APP_VERSION}</div>
        </div>
        <nav className="top-nav-list" aria-label="Main navigation" />
        <div className="top-nav-actions">
          {!isAuthed && (
            <button className="account-btn" onClick={signIn} data-testid="sign-in-btn">Sign In</button>
          )}
          {isAuthed && (
            <div className="account-control" ref={menuRef}>
              <button
                type="button"
                className="account-trigger"
                aria-haspopup="true"
                aria-label="Account menu"
                onClick={() => setOpen(o => !o)}
              >
                <svg className="account-trigger-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/></svg>
                <svg className="account-caret" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
              </button>
              {open && (
                <div className="account-menu" role="group" aria-label="Account menu">
                  <div className="account-menu-header">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" aria-hidden="true" className="account-menu-avatar" />
                    ) : (
                      <span className="account-menu-avatar fallback" aria-hidden="true">{avatarText}</span>
                    )}
                    <div className="account-menu-names">
                      <div className="account-full-name">{fullName || userInfo?.username || 'Loading…'}</div>
                      <div className="account-username-sub">{userInfo?.username}</div>
                    </div>
                  </div>
                  <div className="account-menu-divider" />
                  {profileUrl && (
                    <a href={profileUrl} target="_blank" rel="noopener" className="account-menu-item">View Profile</a>
                  )}
                  <button className="account-menu-item" onClick={() => { setOpen(false); signOut(); }}>Sign Out</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header