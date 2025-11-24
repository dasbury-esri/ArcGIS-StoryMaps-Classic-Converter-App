// src/components/Header.tsx
import { useAuth } from "../auth/useAuth";
import { APP_VERSION } from "../version";

function Header() {
  const { userInfo, token, signIn, signOut } = useAuth();

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-titles">
          <div className="top-nav-title">Classic StoryMap Converter</div>
          <div className="top-nav-subtitle">Alpha | v{APP_VERSION}</div>
        </div>  
        <nav className="top-nav-list">{/* ...navigation links... */}</nav>
        <div className="top-nav-actions">
          {token && userInfo ? (
            <button className="top-nav-btn" onClick={signOut}>Sign Out of ArcGIS Online</button>
          ) : (
            <button className="top-nav-btn" onClick={signIn}>Sign In to ArcGIS Online</button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header