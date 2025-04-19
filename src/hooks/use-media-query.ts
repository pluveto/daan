import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = () => setMatches(mediaQueryList.matches);

    // Initial check to set the initial value
    listener();

    // Use recommended listener methods (addEventListener preferred)
    try {
      mediaQueryList.addEventListener('change', listener);
    } catch (e) {
      // Fallback for older browsers that don't support addEventListener
      console.warn(
        '`addEventListener` failed, falling back to `addListener`.  Media query might not be fully supported.',
        e,
      ); // Add a warning in case of failure
      mediaQueryList.addListener(listener);
    }

    return () => {
      try {
        mediaQueryList.removeEventListener('change', listener);
      } catch (e) {
        // Fallback for older browsers
        mediaQueryList.removeListener(listener);
      }
    };
  }, [query]);

  return matches;
}
