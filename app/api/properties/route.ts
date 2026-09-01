import { NextResponse } from "next/server";
import { parsePropertyFilters } from "@/lib/search/filters";
import { searchProperties } from "@/lib/search/search-properties";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parsePropertyFilters(url.searchParams);
  const result = await searchProperties(filters);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
    },
  });
}
