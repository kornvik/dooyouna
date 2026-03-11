import { NextResponse } from "next/server";
import { fetchFlights } from "@/lib/fetchers/flights";

export const revalidate = 60;

export async function GET() {
  try {
    const { flights, military_flights } = await fetchFlights();

    return NextResponse.json({
      flights,
      military_flights,
      cctv: [],
      updated: {
        flights: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("GET /api/live-data/fast failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch fast live data" },
      { status: 500 },
    );
  }
}
