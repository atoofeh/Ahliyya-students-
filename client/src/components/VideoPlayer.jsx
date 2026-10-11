import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { Loader2, ShieldCheck, Lock, Eye, AlertTriangle } from 'lucide-react';
import api, { API_BASE, apiError } from '../api/axios';
import LmsNative, { isNative, platformName } from '../api/native';

/**
 * Protected video player.
 *  - Fetches a short-lived signed stream token (renewed before expiry) — the
 *    raw file is never exposed; the server decrypts on the fly per Range.
 *  - Intermittent dynamic watermark (name / id / timestamp), fullscreen included.
 *  - Download & PiP disabled, context menu blocked, playback pauses when the
 *    tab is hidden (limits screen-capture-while-hidden and casting tricks).
 *  - Resume: seeks to last saved position; progress heartbeat every 10s.
 *
 * Honest limitation: browsers cannot fully prevent screen recording (OS-level
 * capture, phone cameras, virtual displays). The watermark ties any leak to a
 * student identity, which is the strongest deterrent the web platform allows.
 */

/**
 * Watermark cadence. The mark blinks rather than sits: a few seconds on, most
 * of a minute off. Anyone filming the screen with a second phone for longer
 * than a minute captures the student's identity, while a student who is simply
 * watching the lesson has an unobstructed picture ~87% of the time. The gap is
 * jittered so its timing cannot be learned and recorded around.
 */
const WM_SHOW_MS = 6000;
const WM_GAP_MIN_MS = 38000;
const WM_GAP_JITTER_MS = 14000;
const WM_FIRST_MS = 5000;

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

// The most one `timeupdate` may credit. Ticks arrive ~4x a second, so this
// covers playback up to 8x and treats anything larger as a seek.
const MAX_STEP_SECONDS = 2;
export default function VideoPlayer({ videoId, lessonId, startAt = 0, onProgress }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const watchedRef = useRef(0);
  const lastBeat = useRef(0);
  // Where playback was at the previous tick, so watched time can be measured
  // along the video rather than along the clock.
  const lastPos = useRef(0);
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);
  const [watermark, setWatermark] = useState(null);
  const [wmPos, setWmPos] = useState({ top: '8%', left: '6%' });
  const [wmShown, setWmShown] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The watch allowance, as the server last reported it. null for staff, and
  // for a student while the platform limit is switched off.
  const [views, setViews] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!isNative || platformName() !== 'ios') return undefined;
    let active = true;
    let listener;
    LmsNative.addListener('screenRecordingChanged', ({ captured }) => {
      if (captured) videoRef.current?.pause();
    }).then((handle) => {
      if (active) listener = handle;
      else handle.remove();
    }).catch(() => {});
    return () => { active = false; listener?.remove(); };
  }, []);

  const fetchToken = useCallback(async () => {
    const { data } = await api.post(`/videos/${videoId}/token`);
    // Every token issue re-counts the allowance, so the strip below the video
    // stays honest as the student watches rather than only at first load.
    setViews(data.viewLimit ? { remaining: data.viewsRemaining, limit: data.viewLimit } : null);
    return `${API_BASE}/videos/${videoId}/stream?token=${encodeURIComponent(data.token)}`;
  }, [videoId]);

  // Initial token + watermark payload. State is only set from the async
  // continuation; callers remount the player with key={videoId} to reset it.
  useEffect(() => {
    let cancelled = false;
    // Deferred by a tick: fetchToken() reports the watch allowance back into
    // state, and setting state straight from an effect body is what the
    // react-hooks rule forbids.
    const timer = setTimeout(() => {
      Promise.all([fetchToken(), api.get('/videos/watermark/me')])
        .then(([url, wm]) => {
          if (cancelled) return;
          setSrc(url);
          if (wm.data.enabled) setWatermark(wm.data.lines);
        })
        .catch((err) => {
          if (cancelled) return;
          // Out of views is not a failure to report as one — it is a rule the
          // student needs explained, so it gets its own panel.
          if (err.response?.data?.code === 'VIDEO_VIEW_LIMIT') setBlocked(true);
          else setError(apiError(err, 'Could not load video'));
        });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
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

  // Show the watermark in bursts, each at a fresh random position so cropping a
  // fixed corner never removes it. Runs while paused too — a still photograph of
  // a paused frame should carry the same risk of catching the mark.
  useEffect(() => {
    if (!watermark) return undefined;
    let timer;
    function show() {
      setWmPos({ top: `${8 + Math.random() * 74}%`, left: `${5 + Math.random() * 60}%` });
      setWmShown(true);
      timer = setTimeout(hide, WM_SHOW_MS);
    }
    function hide() {
      setWmShown(false);
      timer = setTimeout(show, WM_GAP_MIN_MS + Math.random() * WM_GAP_JITTER_MS);
    }
    timer = setTimeout(show, WM_FIRST_MS);
    return () => clearTimeout(timer);
  }, [watermark]);

  /**
   * A fullscreened <video> paints alone: a sibling overlay is not part of the
   * fullscreen element, so the watermark used to disappear at exactly the moment
   * a screen is most worth filming. Redirect fullscreen onto the wrapper — which
   * does contain the overlay — whenever the native control fullscreens the video.
   */
  useEffect(() => {
    const onChange = () => {
      const fs = fullscreenElement();
      if (fs && fs === videoRef.current && containerRef.current) {
        // Requesting on an ancestor swaps the fullscreen element without leaving
        // fullscreen; the click that started it still counts as the activation.
        const box = containerRef.current;
        const request = box.requestFullscreen || box.webkitRequestFullscreen;
        try { Promise.resolve(request?.call(box)).catch(() => {}); } catch { /* stays native */ }
        return;
      }
      setIsFullscreen(!!fs && fs === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

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

  /**
   * Reaching the end is the moment a view is earned, so it is also the moment
   * the counter above would otherwise start lying — the token that set it was
   * issued before the watch. Ask again once the final heartbeat has landed.
   * The player itself stays put: someone who has just finished watching should
   * not have the video yanked out from under them, and the next visit shows
   * the locked panel anyway.
   */
  const finish = useCallback(async (position) => {
    await heartbeat(position);
    try {
      const { data } = await api.post(`/videos/${videoId}/token`);
      setViews(data.viewLimit ? { remaining: data.viewsRemaining, limit: data.viewLimit } : null);
    } catch (err) {
      if (err.response?.data?.code === 'VIDEO_VIEW_LIMIT') {
        setViews((v) => (v ? { ...v, remaining: 0 } : v));
      }
    }
  }, [heartbeat, videoId]);

  /**
   * Watched time, measured along the video.
   *
   * `timeupdate` fires about four times a second of *wall clock*, so counting
   * ticks would credit someone watching at 2x with half of what they actually
   * saw — and the allowance is meant to count whole viewings of the material,
   * not minutes spent in front of it. Taking the distance playback moved
   * instead credits the video's own seconds at any speed.
   *
   * Only forward movement counts, and only a step small enough to be playback:
   * a bigger jump is a seek, and dragging the scrubber to the end must never
   * earn a view.
   */
  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const position = video.currentTime;
    const advanced = position - lastPos.current;
    lastPos.current = position;
    if (video.paused) return;
    if (advanced > 0 && advanced <= MAX_STEP_SECONDS) watchedRef.current += advanced;
    if (Date.now() - lastBeat.current > 10000) {
      lastBeat.current = Date.now();
      heartbeat(position);
    }
  };

  if (blocked) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl bg-surface-900 px-6 text-center">
        <Lock size={26} className="text-amber-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-white">{t('video.limitReached')}</p>
        <p className="max-w-sm text-xs leading-relaxed text-surface-400">{t('video.limitHint')}</p>
      </div>
    );
  }
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

  const spent = views && views.remaining <= 0;
  const lastView = views && views.remaining === 1;

  return (
    <>
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden bg-black ${
        isFullscreen ? 'flex h-screen w-screen items-center justify-center' : 'rounded-xl'}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        src={src}
        controls
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        playsInline
        className={isFullscreen ? 'max-h-full max-w-full' : 'aspect-video w-full'}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => {
          if (startAt > 2) e.target.currentTime = startAt;
          lastPos.current = e.target.currentTime;
        }}
        onSeeked={(e) => { lastPos.current = e.target.currentTime; }}
        onPause={() => heartbeat(videoRef.current?.currentTime || 0)}
        onEnded={() => finish(videoRef.current?.duration || 0)}
      />
      {watermark && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-10 rounded bg-black/25 px-2 py-1 text-[11px] leading-tight text-white/60 transition-opacity duration-700 ${
            wmShown ? 'opacity-100' : 'opacity-0'}`}
          style={wmPos}
        >
          {watermark.map((line, i) => <div key={i}>{line}</div>)}
          <div>{new Date().toLocaleString()}</div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-14 end-3 z-10 flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/50">
        <ShieldCheck size={11} /> Protected stream
      </div>
    </div>

    {/* The allowance, stated before it runs out rather than at the moment it
        does. A view is whole-video watch time, so the hint says so — nobody
        should think opening the page cost them one. */}
    {views && (
      <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 text-xs ${
        lastView || spent
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-200'
          : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'
      }`}>
        {lastView || spent ? <AlertTriangle size={13} className="shrink-0" /> : <Eye size={13} className="shrink-0" />}
        <span className="bidi-isolate font-semibold">
          {spent ? t('video.limitReached')
            : lastView ? t('video.lastView')
            : t('video.viewsLeft', { count: views.remaining, limit: views.limit })}
        </span>
        <span className="text-[11px] opacity-80">{spent ? t('video.limitHint') : t('video.viewsHint')}</span>
      </div>
    )}
    </>
  );
}
