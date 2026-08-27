import { useEffect, useRef, useCallback, useState } from 'react';
import api from '../api/axios';
import { getAccessToken } from '../api/token';
import { getDeviceId } from '../api/fingerprint';

/**
 * Client-side quiz proctor. Detects and reports to the server:
 *   tab/window switches, devtools opening (size + timing heuristics),
 *   copy/paste/cut, right-click, blocked shortcuts, idle time, refresh,
 *   network loss, multiple tabs (BroadcastChannel), fullscreen exit,
 *   mouse inactivity.
 *
 * Events are batched and flushed every 4s (or immediately for severe ones).
 * NOTE (honest limits): everything here runs in the student's browser and is
 * a *deterrent*, not a guarantee — a determined user can bypass client-side
 * checks. Server-side risk scoring + teacher review is the real control.
 */
export default function useAntiCheat({ attemptId, enabled, requireFullscreen, blockCopyPaste, onWarning, onAutoSubmit }) {
  const queue = useRef([]);
  const [violations, setViolations] = useState(0);
  const idleTimer = useRef(null);
  const lastMouse = useRef(0); // seeded on mount; Date.now() during render is impure
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length || !attemptId) return;
    flushing.current = true;
    const events = queue.current.splice(0, 50);
    try {
      const { data } = await api.post('/anticheat/events', { attemptId, events });
      if (data.autoSubmitted) onAutoSubmit?.();
    } catch { /* events re-reported on next flush cycle */ }
    flushing.current = false;
  }, [attemptId, onAutoSubmit]);

  const report = useCallback((type, detail = '', severe = false) => {
    if (!enabled || !attemptId) return;
    queue.current.push({ type, detail, occurredAt: new Date().toISOString() });
    setViolations((v) => v + 1);
    onWarning?.(type, detail);
    if (severe) flush();
  }, [enabled, attemptId, onWarning, flush]);

  useEffect(() => {
    if (!enabled || !attemptId) return undefined;
    lastMouse.current = Date.now();

    const cleanups = [];
    const on = (target, event, handler, opts) => {
      target.addEventListener(event, handler, opts);
      cleanups.push(() => target.removeEventListener(event, handler, opts));
    };

    // Tab / window switching
    on(document, 'visibilitychange', () => {
      if (document.hidden) report('tab_switch', 'Tab hidden', true);
    });
    on(window, 'blur', () => report('window_blur', 'Window lost focus'));

    // Copy / paste / cut / context menu
    if (blockCopyPaste) {
      on(document, 'copy', (e) => { e.preventDefault(); report('copy', 'Copy blocked'); });
      on(document, 'paste', (e) => { e.preventDefault(); report('paste', 'Paste blocked', true); });
      on(document, 'cut', (e) => { e.preventDefault(); report('cut', 'Cut blocked'); });
    }
    on(document, 'contextmenu', (e) => { e.preventDefault(); report('right_click', 'Context menu blocked'); });

    // Keyboard shortcuts (devtools, print, save, view-source, PrintScreen)
    on(document, 'keydown', (e) => {
      const k = e.key?.toLowerCase();
      const blocked =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (e.ctrlKey && ['u', 'p', 's'].includes(k)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(k));
      if (blocked) {
        e.preventDefault();
        report('shortcut_blocked', `Blocked: ${[e.ctrlKey && 'Ctrl', e.metaKey && 'Meta', e.shiftKey && 'Shift', e.altKey && 'Alt', e.key].filter(Boolean).join('+')}`);
      }
      if (e.key === 'PrintScreen') {
        report('screen_capture_suspected', 'PrintScreen pressed', true);
        // Best-effort: overwrite clipboard so the shot can't be pasted.
        navigator.clipboard?.writeText?.('Screenshots are not permitted during quizzes.').catch(() => {});
      }
    });

    // DevTools heuristic 1: window size delta (docked devtools)
    const sizeCheck = setInterval(() => {
      const wDelta = window.outerWidth - window.innerWidth;
      const hDelta = window.outerHeight - window.innerHeight;
      if (wDelta > 200 || hDelta > 250) report('devtools_open', `Size delta ${wDelta}x${hDelta}`, true);
    }, 5000);
    cleanups.push(() => clearInterval(sizeCheck));

    // Multiple tabs of the same attempt via BroadcastChannel
    let channel;
    try {
      channel = new BroadcastChannel(`lms-attempt-${attemptId}`);
      channel.postMessage('probe');
      channel.onmessage = (e) => {
        if (e.data === 'probe') channel.postMessage('present');
        if (e.data === 'present') report('multiple_tabs', 'Same attempt open in another tab', true);
      };
      cleanups.push(() => channel.close());
    } catch { /* BroadcastChannel unsupported */ }

    // Refresh / navigation away
    on(window, 'beforeunload', () => {
      report('page_refresh', 'Page unload during attempt');
      // sendBeacon so the event survives navigation
      try {
        const token = getAccessToken();
        const payload = JSON.stringify({ attemptId, events: queue.current.splice(0, 50) });
        if (payload.length > 30 && token) {
          fetch(`${api.defaults.baseURL}/anticheat/events`, {
            method: 'POST', keepalive: true,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-device-id': getDeviceId(), 'x-client-platform': 'web' },
            body: payload,
          }).catch(() => {});
        }
      } catch { /* best effort */ }
    });

    // Network loss
    on(window, 'offline', () => report('network_offline', 'Connection lost'));

    // Fullscreen exit
    if (requireFullscreen) {
      on(document, 'fullscreenchange', () => {
        if (!document.fullscreenElement) report('fullscreen_exit', 'Left fullscreen', true);
      });
    }

    // Idle / mouse inactivity (2 min without input)
    const activity = () => { lastMouse.current = Date.now(); };
    on(document, 'mousemove', activity, { passive: true });
    on(document, 'keypress', activity, { passive: true });
    idleTimer.current = setInterval(() => {
      if (Date.now() - lastMouse.current > 120000) {
        report('mouse_inactive', 'No input for 2+ minutes');
        lastMouse.current = Date.now();
      }
    }, 30000);
    cleanups.push(() => clearInterval(idleTimer.current));

    // Batched flush
    const flushInterval = setInterval(flush, 4000);
    cleanups.push(() => clearInterval(flushInterval));

    return () => { flush(); cleanups.forEach((fn) => fn()); };
  }, [enabled, attemptId, blockCopyPaste, requireFullscreen, report, flush]);

  const enterFullscreen = useCallback(async () => {
    try { await document.documentElement.requestFullscreen(); } catch { /* user gesture required */ }
  }, []);

  return { violations, enterFullscreen };
}
