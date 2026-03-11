export const API_BASE = "";

export async function fetchFastData(etag?: string) {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  const resp = await fetch(`${API_BASE}/api/live-data/fast`, { headers });
  if (resp.status === 304) return { notModified: true, etag };

  const data = await resp.json();
  return { data, etag: resp.headers.get("etag") || "", notModified: false };
}

export async function fetchSlowData() {
  const resp = await fetch(`${API_BASE}/api/live-data/slow`);
  return resp.json();
}

export async function fetchRegionDossier(lat: number, lon: number) {
  const resp = await fetch(
    `${API_BASE}/api/region-dossier?lat=${lat}&lon=${lon}`
  );
  return resp.json();
}

export async function fetchHealth() {
  const resp = await fetch(`${API_BASE}/api/health`);
  return resp.json();
}
