import { useState, useCallback, useEffect } from 'react';

interface UseResizableOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function useResizable({ storageKey, defaultWidth, minWidth, maxWidth }: UseResizableOptions) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(storageKey, String(width));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, width, storageKey, minWidth, maxWidth]);

  // Save on width change (debounced via mouseup)
  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem(storageKey, String(width));
    }
  }, [width, isResizing, storageKey]);

  return { width, isResizing, startResize };
}
