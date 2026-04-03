import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchGiphyEnabled, giphySearch, giphyTrending, type GiphyResult } from '../utils/giphy';

type GifPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (gifUrl: string) => void;
};

const SEARCH_DEBOUNCE_MS = 380;

export function GifPicker({ open, onClose, onPick }: GifPickerProps) {
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebouncedQuery('');
    setError(null);
    setItems([]);
    setServerEnabled(null);
    let cancelled = false;
    (async () => {
      const ok = await fetchGiphyEnabled();
      if (!cancelled) setServerEnabled(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open || serverEnabled !== true) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const next = debouncedQuery ? await giphySearch(debouncedQuery) : await giphyTrending();
        if (!cancelled) setItems(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load GIFs');
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, serverEnabled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const portal = typeof document !== 'undefined' ? document.getElementById('portal-root') || document.body : null;
  if (!portal) return null;

  const showGrid = serverEnabled === true;

  return createPortal(
    <div className="gif-picker-root" role="presentation">
      <div
        className="gif-picker-backdrop"
        aria-hidden
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        className="gif-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a GIF"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="gif-picker-header">
          {showGrid ? (
            <input
              type="search"
              className="gif-picker-search"
              placeholder="Search GIPHY…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          ) : (
            <span className="gif-picker-title">GIF search</span>
          )}
          <button type="button" className="gif-picker-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {serverEnabled === null ? (
          <div className="gif-picker-loading">Loading…</div>
        ) : serverEnabled === false ? (
          <div className="gif-picker-empty gif-picker-setup">
            <p>
              GIF search is not enabled on this server. The operator should set the Giphy API key in the Bahuckel Server GUI
              (same panel as the owner account), restart the server, or run the server from a terminal once to enter the key
              interactively. Advanced: set <code className="gif-picker-code">GIPHY_API_KEY</code> for the server process or add
              <code className="gif-picker-code"> giphy-settings.json</code> under the server data folder. Never put the key in
              the web client.
            </p>
            <p className="gif-picker-hint">
              Get a free key at{' '}
              <a href="https://developers.giphy.com/" target="_blank" rel="noopener noreferrer">
                developers.giphy.com
              </a>
              .
            </p>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="gif-picker-loading">Loading…</div>
        ) : error ? (
          <div className="gif-picker-empty">{error}</div>
        ) : (
          <div className="gif-picker-grid-wrap">
            <div className="gif-picker-grid">
              {items.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="gif-picker-cell"
                  title={g.title}
                  onClick={() => {
                    onPick(g.sendUrl);
                    onClose();
                  }}
                >
                  <img src={g.previewUrl} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          </div>
        )}
        {showGrid && (
          <p className="gif-picker-attribution">
            <a href="https://giphy.com/" target="_blank" rel="noopener noreferrer">
              Powered by GIPHY
            </a>
          </p>
        )}
      </div>
    </div>,
    portal
  );
}
