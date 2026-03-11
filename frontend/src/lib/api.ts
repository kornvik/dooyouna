export async function fetchSource(source: string) {
  const resp = await fetch(`/api/data/${source}`);
  if (!resp.ok) return null;
  return resp.json();
}

export async function fetchRegionDossier(lat: number, lon: number) {
  const resp = await fetch(`/api/region-dossier?lat=${lat}&lon=${lon}`);
  return resp.json();
}
