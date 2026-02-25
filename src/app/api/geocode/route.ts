import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/nyc-apis';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 3) {
    return NextResponse.json({ features: [] });
  }

  try {
    const results = await geocodeAddress(query);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Geocode error:', error);
    return NextResponse.json(
      { error: 'Failed to geocode address' },
      { status: 500 }
    );
  }
}
