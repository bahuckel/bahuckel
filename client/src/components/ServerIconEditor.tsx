/**
 * Server icon editor - same pattern as avatar: viewport shows what you get.
 * Fixed-size viewport, canvas uses same transform, then squircle mask + downscale.
 */
import { useState, useCallback, useRef } from 'react';

const SERVER_ICON_SIZE = 48;
const SERVER_ICON_RADIUS = 16;
const EDITOR_VIEWPORT_SIZE = 200; /* same approach as avatar - fixed size, WYSIWYG */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const MAX_ICON_PIXELS = 256;

function resizeIconIfNeeded(dataUrl: string, maxBytes: number): Promise<string | null> {
  if (!dataUrl.startsWith('data:image/')) return Promise.resolve(null);
  if (dataUrl.length <= maxBytes) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_ICON_PIXELS || h > MAX_ICON_PIXELS) {
        if (w > h) {
          h = Math.round((h * MAX_ICON_PIXELS) / w);
          w = MAX_ICON_PIXELS;
        } else {
          w = Math.round((w * MAX_ICON_PIXELS) / h);
          h = MAX_ICON_PIXELS;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      for (let q = 0.9; q >= 0.1; q -= 0.1) {
        const jpeg = canvas.toDataURL('image/jpeg', q);
        if (jpeg.length <= maxBytes) {
          resolve(jpeg);
          return;
        }
      }
      resolve(canvas.toDataURL('image/jpeg', 0.1));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

interface ServerIconEditorProps {
  serverName?: string;
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
}

export function ServerIconEditor({ serverName, onApply, onCancel }: ServerIconEditorProps) {
  const [image, setImage] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const scaleToFitRef = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        scaleToFitRef.current = Math.min(EDITOR_VIEWPORT_SIZE / w, EDITOR_VIEWPORT_SIZE / h);
        setSize({ w, h });
        setImage(dataUrl);
        setPos({ x: 0, y: 0 });
        setZoom(1);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const applyCrop = useCallback(() => {
    if (!image || !size) return;
    const img = new Image();
    img.src = image;
    img.onload = () => {
      const D = EDITOR_VIEWPORT_SIZE;
      const scale = scaleToFitRef.current * zoom;
      const canvas = document.createElement('canvas');
      canvas.width = D;
      canvas.height = D;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.translate(D / 2 + pos.x, D / 2 + pos.y);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -size.w / 2, -size.h / 2, size.w, size.h);
      ctx.restore();
      const cropDataUrl = canvas.toDataURL('image/png');
      const cropImg = new Image();
      cropImg.onload = () => {
        const out = document.createElement('canvas');
        out.width = SERVER_ICON_SIZE;
        out.height = SERVER_ICON_SIZE;
        const outCtx = out.getContext('2d');
        if (!outCtx) return;
        outCtx.drawImage(cropImg, 0, 0, D, D, 0, 0, SERVER_ICON_SIZE, SERVER_ICON_SIZE);
        const dataUrl = out.toDataURL('image/png');
        resizeIconIfNeeded(dataUrl, 512 * 512).then((final) => {
          if (final) onApply(final);
        });
      };
      cropImg.src = cropDataUrl;
    };
  }, [image, size, pos, zoom, onApply]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!image) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta)));
  }, [image]);

  return (
    <div className="server-icon-editor-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="server-icon-editor" onClick={(e) => e.stopPropagation()}>
        <div className="server-icon-editor-header">
          <h3>Server icon{serverName ? ` — ${serverName}` : ''}</h3>
          <button type="button" className="server-icon-editor-close" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <p className="server-icon-editor-hint">Choose an image, then drag to position and scroll to zoom.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="server-menu-file-input"
          onChange={handleFileSelect}
          aria-label="Choose image"
        />
        <div
          className={`server-icon-editor-viewport ${!image ? 'server-icon-editor-viewport-empty' : ''}`}
          style={{ width: EDITOR_VIEWPORT_SIZE, height: EDITOR_VIEWPORT_SIZE }}
          onWheel={onWheel}
          onMouseDown={(e) => {
            if (!image) {
              inputRef.current?.click();
              return;
            }
            e.preventDefault();
            setDrag({
              startX: e.clientX,
              startY: e.clientY,
              startPosX: pos.x,
              startPosY: pos.y,
            });
          }}
          onMouseMove={(e) => {
            if (!drag) return;
            setPos({
              x: drag.startPosX + (e.clientX - drag.startX),
              y: drag.startPosY + (e.clientY - drag.startY),
            });
          }}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
          onClick={() => {
            if (!image) inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !image) inputRef.current?.click();
          }}
          aria-label={image ? 'Drag to position icon' : 'Click to choose image'}
        >
          {image && size ? (
            <div
              className="server-icon-editor-image-wrap"
              style={{
                width: size.w,
                height: size.h,
                transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) scale(${scaleToFitRef.current * zoom})`,
              }}
            >
              <img src={image} alt="" draggable={false} />
            </div>
          ) : (
            <span className="server-icon-editor-placeholder">Click to choose image</span>
          )}
        </div>
        {image && (
          <>
            <div className="server-icon-editor-zoom-wrap">
              <span className="server-icon-editor-zoom-label">Zoom</span>
              <input
                type="range"
                className="server-icon-editor-zoom-slider"
                min={0}
                max={100}
                value={((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}
                onChange={(e) => {
                  const t = Number(e.target.value) / 100;
                  setZoom(ZOOM_MIN + t * (ZOOM_MAX - ZOOM_MIN));
                }}
                aria-label="Zoom"
              />
            </div>
            <div className="server-icon-editor-actions">
              <button type="button" className="server-icon-editor-btn server-icon-editor-btn-primary" onClick={applyCrop}>
                Use as icon
              </button>
              <button type="button" className="server-icon-editor-btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
