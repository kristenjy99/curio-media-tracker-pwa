import { useCallback, useEffect, useState } from 'react';

function readTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('rt-theme', theme);
    } catch {
      // trình duyệt chặn localStorage: theme vẫn đổi trong phiên hiện tại
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((value) => (value === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}
