import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Lock } from 'lucide-react';
// A URL string only; the renderer itself is imported when a paper opens.
// Bundled by Vite (?worker) so it ships as .js: nginx has no type for .mjs,
// and a browser will not start a worker served as a generic binary.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useLanguage } from '../hooks/useLanguage';
import { pushBackHandler } from '../app/shell';

const ZOOMS = [1, 1.25, 1.5, 2, 3];
const GAP = 12; // px between pages
const PAD = 16; // px above the first page
const MAX_FIT = 860; // widest a page is drawn at 100%
const MAX_PIXELS = 12e6; // per canvas; phones refuse much larger ones

/**
 * Tiles the viewer's identity across a drawn page, faintly and on the bias.
 * It is painted into the page's own pixels, so a capture of the page carries
 * it — the same deterrent the video player uses, for a still image.
 */
function paintWatermark(canvas, lines) {
  const ctx = canvas.getContext('2d');
  const text = lines.join('  ·  ');
  const size = Math.max(12, Math.round(canvas.width / 34));
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#101F38';
  ctx.font = `600 ${size}px Inter, Tajawal, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 7);
  const stepX = ctx.measureText(text).width + size * 5;
  const stepY = size * 8;
  const reach = Math.hypot(canvas.width, canvas.height) / 2 + stepX;
  for (let row = 0, y = -reach; y < reach; row += 1, y += stepY) {
    for (let x = -reach + (row % 2 ? stepX / 2 : 0); x < reach; x += stepX) ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/**
 * One page. It is drawn only while near the screen and its canvas is emptied
 * when it scrolls away, so a sixty-page paper costs a few pages of memory.
 */
function Page({ doc, number, width, height, active, watermark }) {
  const canvasRef = useRef(null);
  const [drawnAt, setDrawnAt] = useState(null); // the width it was last drawn at

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!active) {
      // Release the pixels; the white page stays in place for the scrollbar.
      canvas.width = 0;
      canvas.height = 0;
      return undefined;
    }
    let task = null;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      let scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 3);
      const area = base.width * base.height * scale * scale;
      if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      await task.promise;
      if (cancelled) return;
      if (watermark?.length) paintWatermark(canvas, watermark);
      setDrawnAt(width);
    })().catch((err) => {
      // A cancelled render is the page scrolling away, not a fault.
      if (err?.name !== 'RenderingCancelledException') console.warn('page', number, err?.message);
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, number, width, active, watermark]);

  const ready = active && drawnAt === width;
  return (
    <div className={`relative shrink-0 bg-white shadow-float ${ready ? '' : 'animate-pulse'}`} style={{ width, height }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/**
 * A paper, read in place.
 *
 * Draws the PDF itself (pdf.js onto canvases) rather than handing it to the
 * browser's viewer or the phone's PDF app — both of which offer to save or
 * print it. There is no save, print or share control here, the pages cannot
 * be dragged out or right-clicked, and printing the screen leaves them out.
 *
 * Takes the file's bytes, never a URL, so there is no address to open in a
 * new tab. The bytes do reach the device, so this keeps honest people honest;
 * the watermark is what ties a photographed page back to an account.
 *
 * Full screen on purpose: a scanned answer paper is unreadable in a dialog on
 * a phone. The surround is dark in both themes, so the white pages are the
 * only bright thing on the screen.
 */
export default function PdfReader({ data, title, watermark = null, readOnly = false, onClose }) {
  const { t } = useLanguage();
  const panelRef = useRef(null);
  const scrollerRef = useRef(null);
  const anchorRef = useRef(null); // where to keep the reader's eye across a zoom
  const [state, setState] = useState({ doc: null, sizes: null, failed: false });
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [zoom, setZoom] = useState(1);

  useFocusTrap(panelRef, { active: true, onEscape: onClose });
  useEffect(() => pushBackHandler(onClose), [onClose]);

  // Parse the paper, and measure every page once so the column has its full
  // height before a single page is drawn.
  useEffect(() => {
    let alive = true;
    let loading = null;
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      if (!alive) return;
      // A copy: pdf.js hands the buffer to its worker, which empties the original.
      loading = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), useWasm: false });
      const doc = await loading.promise;
      const sizes = await Promise.all(Array.from({ length: doc.numPages }, (_, i) =>
        doc.getPage(i + 1).then((p) => { const v = p.getViewport({ scale: 1 }); return v.height / v.width; })));
      if (alive) setState({ doc, sizes, failed: false });
    })().catch((err) => {
      console.warn('reader', err?.message);
      if (alive) setState({ doc: null, sizes: null, failed: true });
    });
    return () => { alive = false; loading?.destroy(); };
  }, [data]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.floor(Math.min(Math.max(box.width - 24, 200), MAX_FIT) * zoom);

  // Page positions follow from the sizes alone, so which pages are near the
  // screen, and which one is being read, are arithmetic rather than observers.
  const layout = useMemo(() => {
    if (!state.sizes) return null;
    let y = PAD;
    return state.sizes.map((ratio) => {
      const height = Math.round(pageWidth * ratio);
      const top = y;
      y += height + GAP;
      return { top, height };
    });
  }, [state.sizes, pageWidth]);

  const margin = box.height || 800;
  const isNear = (p) => p.top + p.height > scrollTop - margin && p.top < scrollTop + box.height + margin;
  const current = layout
    ? Math.max(1, layout.findIndex((p) => p.top + p.height > scrollTop + box.height * 0.35) + 1 || layout.length)
    : 0;

  // After a zoom, bring back the point that was in the middle of the screen.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const anchor = anchorRef.current;
    if (!el || anchor === null) return;
    anchorRef.current = null;
    el.scrollTop = anchor * el.scrollHeight - el.clientHeight / 2;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [pageWidth]);

  const zoomBy = (dir) => {
    const next = ZOOMS[ZOOMS.indexOf(zoom) + dir];
    if (!next) return;
    const el = scrollerRef.current;
    if (el) anchorRef.current = (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight);
    setZoom(next);
  };

  const onScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    requestAnimationFrame(() => setScrollTop(top));
  };

  const total = state.sizes?.length || 0;
  const barButton = 'rounded-lg p-2 text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent';

  // Portalled to <body>: a page's own spacing (space-y-*) or a transformed
  // ancestor would otherwise pull a fixed, full-screen layer off the edges.
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex select-none flex-col bg-surface-950 animate-fade-in print:hidden"
    >
      <div className="pt-safe shrink-0 border-b border-white/10 bg-surface-950/95">
        <div className="flex items-center gap-2 px-3 py-2">
          <button type="button" onClick={onClose} aria-label={t('common.closeDialog')} className={barButton}>
            <X size={19} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white"><span className="bidi-isolate">{title}</span></p>
            {readOnly && (
              <p className="flex items-center gap-1 text-[11px] text-white/50">
                <Lock size={10} aria-hidden="true" /> {t('pp.reader.readOnly')}
              </p>
            )}
          </div>
          {total > 0 && (
            <span dir="ltr" className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold tabular-nums text-white/80"
              aria-live="polite" aria-label={t('pp.reader.page', { n: current, total })}>
              {current} / {total}
            </span>
          )}
          <div className="flex shrink-0 items-center" dir="ltr">
            <button type="button" onClick={() => zoomBy(-1)} disabled={zoom === ZOOMS[0]}
              aria-label={t('pp.reader.zoomOut')} title={t('pp.reader.zoomOut')} className={barButton}>
              <ZoomOut size={18} />
            </button>
            <span className="hidden w-11 text-center text-xs tabular-nums text-white/60 sm:inline">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]}
              aria-label={t('pp.reader.zoomIn')} title={t('pp.reader.zoomIn')} className={barButton}>
              <ZoomIn size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className="pb-safe min-h-0 flex-1 overflow-auto overscroll-contain px-3"
      >
        {state.failed ? (
          <p className="mx-auto mt-16 max-w-sm text-center text-sm text-white/70">{t('pp.reader.error')}</p>
        ) : !layout ? (
          // Blank pages while the paper is parsed — never a spinner in the middle.
          <div className="mx-auto flex flex-col items-center" style={{ width: pageWidth, gap: GAP, paddingTop: PAD }}>
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse bg-white/90" style={{ width: pageWidth, height: Math.round(pageWidth * 1.414) }} />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center" style={{ width: pageWidth, gap: GAP, paddingTop: PAD, paddingBottom: PAD }}>
            {layout.map((p, i) => (
              <Page key={i} doc={state.doc} number={i + 1} width={pageWidth} height={p.height}
                active={isNear(p)} watermark={watermark} />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
