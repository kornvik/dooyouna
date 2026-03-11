import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchRegionDossier } from "@/lib/fetchers/dossier";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latParam = searchParams.get("lat");
  const lonParam = searchParams.get("lon");

  if (!latParam || !lonParam) {
    return NextResponse.json(
      { error: "Missing required query parameters: lat, lon" },
      { status: 400 },
    );
  }

  const lat = parseFloat(latParam);
  const lon = parseFloat(lonParam);

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json(
      { error: "lat and lon must be valid numbers" },
      { status: 400 },
    );
  }

  try {
    const dossier = await fetchRegionDossier(lat, lon);
    return NextResponse.json(dossier);
  } catch (err) {
    console.error("GET /api/region-dossier failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch region dossier" },
      { status: 500 },
    );
  }
}
