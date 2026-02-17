/* Util y hook de borradores persistentes por módulo (localStorage) */
const PREFIX = "morla:draft:";

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveDraft(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch {}
}

export function clearDraft(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

import { useEffect, useMemo } from "react";
export function useAutoDraft(key, data, ms = 400) {
  const serialized = useMemo(() => JSON.stringify(data), [data]);
  useEffect(() => {
    const id = setTimeout(() => {
      try { saveDraft(key, JSON.parse(serialized)); } catch {}
    }, ms);
    return () => clearTimeout(id);
  }, [key, serialized, ms]);
}
