import React, { useEffect, useState } from 'react';
import GraphView from '../components/GraphView';
import '../components/GraphView.css';

type TraceShape = { sessionId?: string; events?: Array<{ stepId: string; event: 'enter'|'exit'; ts: number }> };
type OutputListItem = { name: string; path: string };
type OutputListResponse = { traces?: OutputListItem[] };
export default function GraphViewPage() {
  const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  const [trace, setTrace] = useState<TraceShape | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [latestInfo, setLatestInfo] = useState<{ source: 'localStorage' | 'list-latest' | 'manual'; path?: string; listPath?: string } | null>(null);
  const [recent, setRecent] = useState<{ traces: Array<{ name: string; path: string }> } | null>(null);
  const [showAllRecent, setShowAllRecent] = useState<boolean>(false);
  const diagramMarkdown = '/DEPENDENCY-CRUISER_DIAGRAM.md';

  const fetchTracePath = async (repoRelativePath: string) => {
    try {
      setLoading(true);
      setError('');
      const qp = encodeURIComponent(repoRelativePath);
      const res = await fetch(`/.netlify/functions/get-trace?path=${qp}`);
      if (!res.ok) throw new Error('Failed to load trace.json');
      const ct = res.headers.get('content-type') || '';
      if (!/application\/json/i.test(ct)) throw new Error('Trace response is not JSON');
      const json = await res.json();
      setTrace(json);
      setLatestInfo(prev => ({ ...(prev || { source: 'manual' }), path: repoRelativePath }));
      try { localStorage.setItem('lastTracePath', repoRelativePath); } catch { /* ignore */ }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Try localStorage saved path first
        let path = '';
        try { path = localStorage.getItem('lastTracePath') || ''; } catch { /* ignore */ }
        if (!path) {
          // Ask serverless for latest
          try {
            const resp = await fetch('/.netlify/functions/list-latest-trace');
            if (resp.ok) {
              const js = await resp.json();
              path = js?.path || '';
              setLatestInfo({ source: 'list-latest', listPath: js?.path || '' });
            }
          } catch { /* ignore */ }
        } else {
          setLatestInfo({ source: 'localStorage', path });
        }
        if (!path) throw new Error('No trace path available');
        // Normalize absolute paths to repo-relative if needed
        try {
          if (/\/Users\//.test(path) && path.includes('/ArcGIS-StoryMaps-Classic-Converter-App/')) {
            const idx = path.indexOf('/ArcGIS-StoryMaps-Classic-Converter-App/');
            path = path.substring(idx + 1); // drop leading slash for consistency
          }
        } catch { /* ignore */ }
        const qp = encodeURIComponent(path);
        const res = await fetch(`/.netlify/functions/get-trace?path=${qp}`);
        if (!res.ok) throw new Error('Failed to load trace.json');
        const ct = res.headers.get('content-type') || '';
        if (!/application\/json/i.test(ct)) throw new Error('Trace response is not JSON');
        const json = await res.json();
        if (!cancelled) {
          setTrace(json);
          setLatestInfo(prev => ({ ...(prev || { source: 'manual' }), path }));
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/.netlify/functions/list-output-files');
        if (!resp.ok) return;
        const js: OutputListResponse = await resp.json();
        const traces: OutputListItem[] = Array.isArray(js?.traces) ? js.traces.map((t: OutputListItem) => ({ name: String(t?.name||''), path: String(t?.path||'') })) : [];
        if (!cancelled) setRecent({ traces });
      } catch {
        // ignore listing errors
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!isDev) return (
    <div className="graphview-page-padding">
      <h2>Converter Graph View (Dev Only)</h2>
      <p>This visualization is available in development builds to aid debugging.</p>
    </div>
  );
  if (loading) return <div className="graphview-page-padding">Loading latest trace…</div>;
  if (error) return (
    <div className="graphview-page-padding">
      <div>Error: {error}</div>
      <div>
        <h4>Latest Files</h4>
        <ul>
          {latestInfo?.listPath && (<li><strong>list-latest-trace:</strong> {latestInfo.listPath}</li>)}
          {latestInfo?.path && (<li><strong>fetch path:</strong> {latestInfo.path}</li>)}
          {!latestInfo && (<li>No latest info yet. Run a conversion.</li>)}
        </ul>
        {recent && (
          <>
            <h5>Recent trace-*.json</h5>
            <ul>
                {((showAllRecent ? (recent?.traces || []) : [])).map((t, i) => (
                  <li key={`t-${i}`}>
                    <button
                      className="converter-btn secondary"
                      onClick={() => fetchTracePath('/' + t.path)}
                      title="Load this trace"
                    >Load</button>
                    {' '}{t.path}
                  </li>
                ))}
              {(recent?.traces?.length ?? 0) === 0 && (<li>(none)</li>)}
            </ul>
            {(recent?.traces?.length ?? 0) > 0 && (
              <button
                className="converter-btn tertiary"
                onClick={() => setShowAllRecent(v => !v)}
                title={showAllRecent ? 'Hide recent files' : 'Show recent files'}
              >{showAllRecent ? 'Hide recent files' : 'Show recent files'}</button>
            )}
          </>
        )}
      </div>
    </div>
  );
  return (
    <div className="graphview-page-padding">
      <h2>Converter Graph View</h2>
      <div>
        <h4>Latest Files</h4>
        <ul>
          {latestInfo?.listPath && (<li><strong>list-latest-trace:</strong> {latestInfo.listPath}</li>)}
          {latestInfo?.path && (<li><strong>fetch path:</strong> {latestInfo.path}</li>)}
          {!latestInfo && (<li>No latest info yet. Run a conversion.</li>)}
        </ul>
        {recent && (
          <>
            <h5>Recent trace-*.json</h5>
            <ul>
                {((showAllRecent ? (recent?.traces || []) : [])).map((t, i) => (
                  <li key={`t-${i}`}>
                    <button
                      className="converter-btn secondary"
                      onClick={() => fetchTracePath('/' + t.path)}
                      title="Load this trace"
                    >Load</button>
                    {' '}{t.path}
                  </li>
                ))}
              {(recent?.traces?.length ?? 0) === 0 && (<li>(none)</li>)}
            </ul>
            {(recent?.traces?.length ?? 0) > 0 && (
              <button
                className="converter-btn tertiary"
                onClick={() => setShowAllRecent(v => !v)}
                title={showAllRecent ? 'Hide recent files' : 'Show recent files'}
              >{showAllRecent ? 'Hide recent files' : 'Show recent files'}</button>
            )}
            
          </>
        )}
      </div>
      <GraphView diagramMarkdown={diagramMarkdown} trace={trace || undefined} />
    </div>
  );
}
