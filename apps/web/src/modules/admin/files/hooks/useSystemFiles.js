import { useEffect, useState } from 'react';
import { loadSystemFiles } from '../services/systemFiles.js';

/**
 * Folder sistem (L7) satu folder project. Dimuat sekali per folder, saat tab
 * sistem pertama kali dibuka, lalu dipakai bersama kedua tab sistem.
 */
export function useSystemFiles(folder, enabled) {
  const [state, setState] = useState({ key: null, data: null, error: '' });
  const key = folder ? `${folder.id}` : null;

  useEffect(() => {
    if (!enabled || !folder || state.key === key) return undefined;
    let cancelled = false;
    loadSystemFiles(folder)
      .then((data) => { if (!cancelled) setState({ key, data, error: '' }); })
      .catch((error) => { if (!cancelled) setState({ key, data: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [enabled, folder, key, state.key]);

  return { loading: enabled && state.key !== key, data: state.key === key ? state.data : null, error: state.key === key ? state.error : '' };
}
