import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import api, { API_BASE, apiError } from '../api/axios';

/**
 * Protected video player.
 *  - Fetches a short-lived signed stream token (renewed before expiry) — the
 *    raw file is never exposed; the server decrypts on the fly per Range.
 *  - Moving dynamic watermark (name / id / timestamp) rendered as an overlay.
 *  - Download & PiP disabled, context menu blocked, playback pauses when the
 *    tab is hidden (limits screen-capture-while-hidden and casting tricks).
 *  - Resume: seeks to last saved position; progress heartbeat every 10s.
 *
 * Honest limitation: browsers cannot fully prevent screen recording (OS-level
 * capture, phone cameras, virtual displays). The watermark ties any leak to a
 * student identity, which is the strongest deterrent the web platform allows.
 */
export default function VideoPlayer({ videoId, lessonId, startAt = 0, onProgress }) {
  const videoRef = useRef(null);
  const watchedRef = useRef(0);
  const lastBeat = useRef(0);
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);
  const [watermark, setWatermark] = useState(null);
  const [wmPos, setWmPos] = useState({ top: '8%', left: '6%' });

  const fetchToken = useCallback(async () => {
    const { data } = await api.post(`/videos/${videoId}/token`);
    return `${API_BASE}/videos/${videoId}/stream?token=${encodeURIComponent(data.token)}`;
  }, [videoId]);

  // Initial token + watermark payload
  useEffect(() => {
    let cancelled = false;
    setSrc(null); setError(null);
    Promise.all([fetchToken(), api.get('/videos/watermark/me')])
      .then(([url, wm]) => {
        if (cancelled) return;
        setSrc(url);
        if (wm.data.enabled) setWatermark(wm.data.lines);
      })
      .catch((err) => !cancelled && setError(apiError(err, 'Could not load video')));
    return () => { cancelled = true; };
  }, [videoId, fetchToken]);

  // Renew the signed URL before the 5-minute token expires.
  useEffect(() => {
    if (!src) return undefined;
    const interval = setInterval(async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        const { currentTime, paused } = video;
        const fresh = await fetchToken();
        // Only swap when paused to avoid interrupting playback; the browser
        // keeps buffered ranges for the old URL otherwise.
        if (paused) {
          video.src = fresh;
          video.currentTime = currentTime;
        } else {
          setSrc(fresh); // takes effect on next load/seek
        }
      } catch { /* next heartbeat retries */ }
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [src, fetchToken]);

  // Moving watermark position (defeats static cropping)
  useEffect(() => {
    if (!watermark) return undefined;
    const move = setInterval(() => {
      setWmPos({ top: `${8 + Math.random() * 74}%`, left: `${5 + Math.random() * 60}%` });
    }, 7000);
    return () => clearInterval(move);
  }, [watermark]);

  // Pause when tab hidden
  useEffect(() => {
    const onVis = () => { if (document.hidden) videoRef.current?.pause(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Progress heartbeat
  const heartbeat = useCallback(async (position) => {
    if (!lessonId) return;
    const delta = watchedRef.current;
    watchedRef.current = 0;
    try {
      await api.post(`/videos/${videoId}/progress`, {
        lessonId, positionSeconds: Math.floor(position), watchedDelta: Math.floor(delta),
      });
      onProgress?.(position);
    } catch { /* non-fatal */ }
  }, [videoId, lessonId, onProgress]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || video.paused) return;
    watchedRef.current += 0.25; // timeupdate fires ~4x/sec
    if (Date.now() - lastBeat.current > 10000) {
      lastBeat.current = Date.now();
      heartbeat(video.currentTime);
    }
  };

  if (error) {
    return <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-900 text-sm text-rose-400">{error}</div>;
  }
  if (!src) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-900">
        <Loader2 className="animate-spin text-primary-400" size={32} />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-black select-none" onContextMenu={(e) => e.preventDefault()}>
      <video
        ref={videoRef}
        src={src}
        controls
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        playsInline
        className="aspect-video w-full"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => { if (startAt > 2) e.target.currentTime = startAt; }}
        onPause={() => heartbeat(videoRef.current?.currentTime || 0)}
        onEnded={() => heartbeat(videoRef.current?.duration || 0)}
      />
      {watermark && (
        <div
          className="pointer-events-none absolute z-10 rounded bg-black/25 px-2 py-1 text-[11px] leading-tight text-white/60 transition-all duration-1000"
          style={wmPos}
        >
          {watermark.map((line, i) => <div key={i}>{line}</div>)}
          <div>{new Date().toLocaleString()}</div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-14 right-3 z-10 flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/50">
        <ShieldCheck size={11} /> Protected stream
      </div>
    </div>
  );
}
