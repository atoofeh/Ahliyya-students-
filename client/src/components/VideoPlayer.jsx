import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import {
  Loader2, ShieldCheck, Lock, Eye, AlertTriangle, Maximize, Minimize,
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX,
} from 'lucide-react';
import api, { API_BASE, apiError } from '../api/axios';
import LmsNative, { isNative, platformName } from '../api/native';

/**
 * Protected video player.
 *  - Fetches a short-lived signed stream token (renewed before expiry) — the
 *    raw file is never exposed; the server decrypts on the fly per Range.
 *  - Intermittent dynamic watermark (name / id / timestamp), including expanded view.
 *  - Download & PiP disabled, context menu blocked, playback pauses when the
 *    tab is hidden (limits screen-capture-while-hidden and casting tricks).
 *  - On WebKit the native controls are replaced by the bar below, because
 *    Safari ignores every request to drop its full-screen and PiP buttons.
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

// The most one `timeupdate` may credit. Ticks arrive ~4x a second, so this
// covers playback up to 8x and treats anything larger as a seek.
const MAX_STEP_SECONDS = 2;

/**
 * Whether this browser draws media controls we are not allowed to trim.
 *
 * Every lever for removing the full-screen and picture-in-picture buttons is a
 * Chromium feature: `controlsList`, `disablePictureInPicture`, and the
 * `::-webkit-media-controls-fullscreen-button` pseudo-element, which only
 * reaches Safari on the Mac. On iOS the control overlay is painted by the
 * system, outside the page, and it carries a full-screen button, a
 * picture-in-picture button and an overflow menu whatever the page asks for.
 * All three take the video out from under this component — no watermark, no
 * expand control, nothing — at exactly the moment a screen is worth filming.
 *
 * So where the controls cannot be trimmed they are switched off entirely and
 * the bar below is used instead. The question is asked of the engine, not of
 * the user agent string: every browser on iOS is WebKit underneath, Chrome
 * and Firefox included, so sniffing for Safari would miss most of them.
 *
 * Both clauses were measured rather than assumed. `controlsList` is the
 * Chromium feature this all hinges on, so a browser without it is a browser
 * whose controls we cannot trim — WebKit 605 (Safari 27) still reports it
 * missing, along with `disablePictureInPicture`, which is why a
 * picture-in-picture button appears there whatever the markup says.
 * `webkitSetPresentationMode` then covers a future Safari that adds
 * `controlsList` but keeps drawing its own full-screen and PiP buttons; it is
 * Apple-only, and current Chromium has neither it nor the old
 * `webkitEnterFullscreen`, so no Chromium build is caught by either clause.
 */
const webkitMediaUi = typeof HTMLVideoElement !== 'undefined'
  && (typeof HTMLVideoElement.prototype.webkitSetPresentationMode === 'function'
    || !('controlsList' in HTMLMediaElement.prototype));

const SKIP_SECONDS = 10;
// How long the bar stays after a tap before fading, while the video plays.
const BAR_HIDE_MS = 3400;

/** Seconds as a clock, dropping the hours on anything under one. */
function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const ss = String(whole % 60).padStart(2, '0');
  const mm = Math.floor(whole / 60) % 60;
  const hh = Math.floor(whole / 3600);
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
export default function VideoPlayer({ videoId, lessonId, startAt = 0, onProgress }) {
  const videoRef = useRef(null);
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
  const [isExpanded, setIsExpanded] = useState(false);
  // The watch allowance, as the server last reported it. null for staff, and
  // for a student while the platform limit is switched off.
  const [views, setViews] = useState(null);
  const [blocked, setBlocked] = useState(false);
  // Playback mirrored into state, for the controls this component draws itself
  // on WebKit. Nothing else reads it, so it stays unset everywhere else.
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [barShown, setBarShown] = useState(true);
  const hideTimer = useRef(null);
  const { t } = useLanguage();

  /**
   * The control bar fades while the video plays and returns on a tap — what
   * iOS's own player does, so it is what a student expects. It stays put
   * whenever playback is stopped: a paused screen with no controls on it
   * reads as broken rather than as tidy.
   */
  const holdBar = useCallback(() => {
    clearTimeout(hideTimer.current);
    setBarShown(true);
  }, []);
  const revealBar = useCallback(() => {
    clearTimeout(hideTimer.current);
    setBarShown(true);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setBarShown(false);
    }, BAR_HIDE_MS);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

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

  useEffect(() => {
    if (!isExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isExpanded]);

  /**
   * WebKit's ways of taking the video out from under this component.
   *
   * Each one ends with the video painting alone — the watermark, the expand
   * control and everything else here gone, at exactly the moment a screen is
   * worth filming. Switching off the native controls removes the buttons that
   * offered it, but not the routes themselves: a pinch-out gesture on the
   * video enters full screen with no control involved, and the presentation
   * API can be reached whether or not anything on screen calls it.
   *
   * AirPlay: `x-webkit-airplay="deny"` removes the route picker, so the video
   * cannot be sent to a television where this overlay does not follow it.
   * Mirroring is a different path, and the iOS app already covers its window.
   *
   * Picture in picture: the video would float above the app, unmarked, and
   * keep playing while the student is somewhere else entirely — so it is put
   * straight back inline, and paused if that refuses.
   *
   * Fullscreen: leave again the moment it begins, and switch on the expanded
   * layout above instead — the same filled screen, with the watermark still on
   * it. Expanding first means there is no flash of the small player on the way
   * back. If leaving does not take, the video is playing unmarked, so it
   * stops: a surprising pause is the cheaper mistake.
   *
   * Keyed to `src` because the element below only exists once there is one.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.setAttribute('x-webkit-airplay', 'deny');
    video.setAttribute('disableremoteplayback', '');
    let check;
    const onBegin = () => {
      setIsExpanded(true);
      try { video.webkitExitFullscreen?.(); } catch { /* the check below covers it */ }
      clearTimeout(check);
      check = setTimeout(() => {
        if (video.webkitDisplayingFullscreen) video.pause();
      }, 600);
    };
    const onEnd = () => clearTimeout(check);
    // Either picture-in-picture API starting is treated the same way: back
    // inline, and failing that paused, because the thing to stop is unmarked
    // playback rather than any particular API.
    const onPip = () => {
      try {
        if (typeof video.webkitSetPresentationMode === 'function') {
          video.webkitSetPresentationMode('inline');
        } else if (document.pictureInPictureElement === video) {
          document.exitPictureInPicture().catch(() => video.pause());
        }
      } catch { video.pause(); }
    };
    const onPresentation = () => {
      if (video.webkitPresentationMode === 'picture-in-picture') onPip();
    };
    video.addEventListener('webkitbeginfullscreen', onBegin);
    video.addEventListener('webkitendfullscreen', onEnd);
    video.addEventListener('webkitpresentationmodechanged', onPresentation);
    video.addEventListener('enterpictureinpicture', onPip);
    return () => {
      clearTimeout(check);
      video.removeEventListener('webkitbeginfullscreen', onBegin);
      video.removeEventListener('webkitendfullscreen', onEnd);
      video.removeEventListener('webkitpresentationmodechanged', onPresentation);
      video.removeEventListener('enterpictureinpicture', onPip);
    };
  }, [src]);

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
    // Only the bar below reads this, and only WebKit draws that bar — so no
    // other browser re-renders four times a second for nothing.
    if (webkitMediaUi) setCurrent(position);
    if (video.paused) return;
    if (advanced > 0 && advanced <= MAX_STEP_SECONDS) watchedRef.current += advanced;
    if (Date.now() - lastBeat.current > 10000) {
      lastBeat.current = Date.now();
      heartbeat(position);
    }
  };

  /*
    The controls this component draws on WebKit. Each one nudges the element
    and lets the element's own events settle the state, so the bar can never
    disagree with the video — including when something other than a tap moves
    it, such as the heartbeat swapping in a renewed stream URL.
  */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    revealBar();
  };
  const skip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : video.currentTime;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), end);
    revealBar();
  };
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    // `muted` is the only part of volume a phone lets a page touch; the
    // loudness itself belongs to the hardware buttons.
    video.muted = !video.muted;
    revealBar();
  };
  const seekTo = (value) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrent(value);
    revealBar();
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
      className={`select-none overflow-hidden bg-black ${
        isExpanded
          ? 'fixed inset-0 z-[70] flex h-[100dvh] w-screen items-center justify-center rounded-none'
          : 'relative aspect-video w-full rounded-xl'}`}
      style={isExpanded ? {
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        paddingInlineStart: 'var(--safe-left)',
        paddingInlineEnd: 'var(--safe-right)',
      } : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        src={src}
        controls={!webkitMediaUi}
        controlsList="nofullscreen nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        playsInline
        className={`lesson-video ${isExpanded ? 'h-full w-full object-contain' : 'aspect-video w-full'}`}
        onClick={webkitMediaUi ? revealBar : undefined}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => {
          if (startAt > 2) e.target.currentTime = startAt;
          lastPos.current = e.target.currentTime;
          setCurrent(e.target.currentTime);
          setDuration(Number.isFinite(e.target.duration) ? e.target.duration : 0);
        }}
        onDurationChange={(e) => setDuration(Number.isFinite(e.target.duration) ? e.target.duration : 0)}
        onSeeked={(e) => { lastPos.current = e.target.currentTime; setCurrent(e.target.currentTime); }}
        onPlay={() => { setPlaying(true); revealBar(); }}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onVolumeChange={(e) => setMuted(e.target.muted)}
        onPause={() => { setPlaying(false); holdBar(); heartbeat(videoRef.current?.currentTime || 0); }}
        onEnded={() => { setPlaying(false); holdBar(); finish(videoRef.current?.duration || 0); }}
      />
      {/* WebKit's controls are off, so these are the controls. Everything the
          native bar offered that is not here — full screen, picture in
          picture, AirPlay, the overflow menu — was a way out of this
          component, and leaving it out is the point. */}
      {webkitMediaUi && (
        <>
          {/* Fixed to LTR for the same reason as the scrubber: these move
              playback along the time axis, and that axis does not flip. Let
              the row mirror and "forward" lands on the left while the
              progress it controls still fills to the right. */}
          <div
            dir="ltr"
            className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-7 transition-opacity duration-300 ${
              barShown ? 'opacity-100' : 'opacity-0'}`}
          >
            <button
              type="button"
              onClick={() => skip(-SKIP_SECONDS)}
              aria-label={t('video.back10')}
              title={t('video.back10')}
              className="pointer-events-auto rounded-full bg-black/40 p-2.5 text-white transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <RotateCcw size={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={t(playing ? 'video.pause' : 'video.play')}
              title={t(playing ? 'video.pause' : 'video.play')}
              className="pointer-events-auto rounded-full bg-black/55 p-3.5 text-white shadow-lg transition-colors hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {waiting && playing
                ? <Loader2 size={28} className="animate-spin" aria-hidden="true" />
                : playing ? <Pause size={28} aria-hidden="true" /> : <Play size={28} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => skip(SKIP_SECONDS)}
              aria-label={t('video.forward10')}
              title={t('video.forward10')}
              className="pointer-events-auto rounded-full bg-black/40 p-2.5 text-white transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <RotateCw size={24} aria-hidden="true" />
            </button>
          </div>
          <div
            className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-3 pb-2 pt-7 transition-opacity duration-300 ${
              barShown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            style={isExpanded ? {
              bottom: 'var(--safe-bottom)',
              paddingInlineStart: 'calc(var(--safe-left) + 0.75rem)',
              paddingInlineEnd: 'calc(var(--safe-right) + 0.75rem)',
            } : undefined}
          >
            {/* Time runs left to right in Arabic as well: the scrubber is a
                clock rather than a sentence, and a mirrored one reads as
                rewinding. The two readings are isolated so the bidi algorithm
                cannot pull a colon across into the wrong number. */}
            <div dir="ltr" className="flex items-center gap-2.5">
              <span className="bidi-isolate w-10 shrink-0 text-end text-[11px] tabular-nums text-white/80">{clock(current)}</span>
              <input
                type="range"
                className="video-scrubber min-w-0 flex-1"
                min={0}
                max={duration || 0}
                step="any"
                value={duration ? Math.min(current, duration) : 0}
                disabled={!duration}
                aria-label={t('video.seek')}
                aria-valuetext={`${clock(current)} / ${clock(duration)}`}
                onChange={(e) => seekTo(Number(e.target.value))}
                style={{ '--played': `${duration ? (Math.min(current, duration) / duration) * 100 : 0}%` }}
              />
              <span className="bidi-isolate w-10 shrink-0 text-[11px] tabular-nums text-white/80">{clock(duration)}</span>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={t(muted ? 'video.unmute' : 'video.mute')}
                title={t(muted ? 'video.unmute' : 'video.mute')}
                aria-pressed={muted}
                className="shrink-0 rounded-lg p-1 text-white/85 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-label={t(isExpanded ? 'video.collapse' : 'video.expand')}
        title={t(isExpanded ? 'video.collapse' : 'video.expand')}
        aria-pressed={isExpanded}
        className="absolute end-3 top-3 z-20 rounded-lg bg-black/60 p-2 text-white/90 shadow transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={isExpanded ? {
          top: 'calc(var(--safe-top) + 0.75rem)',
          insetInlineEnd: 'calc(var(--safe-right) + 0.75rem)',
        } : undefined}
      >
        {isExpanded ? <Minimize size={18} aria-hidden="true" /> : <Maximize size={18} aria-hidden="true" />}
      </button>
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
      {/* Sits clear of whichever control bar is in use, and above the home
          indicator once expanded. It outlives the bar's fade on purpose: the
          mark is a statement about the stream, not a control. */}
      <div
        dir="ltr"
        className="pointer-events-none absolute z-10 flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/50"
        style={{
          bottom: isExpanded ? 'calc(var(--safe-bottom) + 3.75rem)' : '3.75rem',
          insetInlineEnd: isExpanded ? 'calc(var(--safe-right) + 0.75rem)' : '0.75rem',
        }}
      >
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
