import { useEffect } from 'react';
import { installShell, applySystemBarStyle } from '../app/shell';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../hooks/useTheme';

/**
 * Installs the Android shell wiring (back button, keyboard, splash) and keeps the
 * system-bar icons legible against the current theme. Renders nothing, and does
 * nothing at all in a browser.
 */
export default function NativeShell() {
  const toast = useToast();
  const { isDark } = useTheme();

  useEffect(() => installShell({
    onExitHint: () => toast.info('Press back again to close the app'),
  }), [toast]);

  useEffect(() => { applySystemBarStyle(isDark); }, [isDark]);

  return null;
}
