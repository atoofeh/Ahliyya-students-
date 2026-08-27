import { useEffect, useState, useCallback } from 'react';
import { ThemeContext } from '../hooks/useTheme';



const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('lms_theme') || 'system');
  const [sysDark, setSysDark] = useState(systemDark);
  const isDark = theme === 'dark' || (theme === 'system' && sysDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('lms_theme', theme);
  }, [theme, isDark]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSysDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const cycle = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycle, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

