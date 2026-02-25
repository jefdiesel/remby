// Neighborhood bounding boxes for data sync
// Starting with Bed-Stuy only, expand later

export interface NeighborhoodBounds {
  slug: string;
  name: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

export const NEIGHBORHOODS: NeighborhoodBounds[] = [
  {
    slug: 'bedstuy',
    name: 'Bedford-Stuyvesant',
    north: 40.6980,
    south: 40.6720,
    east: -73.9200,
    west: -73.9650,
  },
  // Add more neighborhoods here later
  // {
  //   slug: 'williamsburg',
  //   name: 'Williamsburg',
  //   north: 40.7200,
  //   south: 40.7000,
  //   east: -73.9400,
  //   west: -73.9700,
  // },
];

// Check if coordinates are within any synced neighborhood
export function getNeighborhoodForCoords(lat: number, lng: number): NeighborhoodBounds | null {
  for (const hood of NEIGHBORHOODS) {
    if (lat <= hood.north && lat >= hood.south && lng >= hood.west && lng <= hood.east) {
      return hood;
    }
  }
  return null;
}

// Build BBL-based filter for datasets without lat/lng
// For Bed-Stuy: Brooklyn (borough 3), blocks roughly 1400-1900
export function buildBoroughBlockFilter(bounds: NeighborhoodBounds): { borough: string; blockRange?: [number, number] } {
  // Map neighborhood slugs to borough codes and approximate block ranges
  const neighborhoodMappings: Record<string, { borough: string; blockRange: [number, number] }> = {
    'bedstuy': { borough: '3', blockRange: [1400, 1900] },
    // Add more neighborhoods as needed
  };

  return neighborhoodMappings[bounds.slug] || { borough: '3' };
}

// Build filter for ACRIS Legals (uses borough, block columns)
export function buildACRISLegalsFilter(bounds: NeighborhoodBounds): string {
  const mapping = buildBoroughBlockFilter(bounds);
  if (mapping.blockRange) {
    return `borough = '${mapping.borough}' AND block >= '${mapping.blockRange[0].toString().padStart(5, '0')}' AND block <= '${mapping.blockRange[1].toString().padStart(5, '0')}'`;
  }
  return `borough = '${mapping.borough}'`;
}

// Build filter for HPD Violations (uses boro, block)
export function buildHPDFilter(bounds: NeighborhoodBounds): string {
  const mapping = buildBoroughBlockFilter(bounds);
  // HPD uses BROOKLYN not 3
  const boroughName = mapping.borough === '3' ? 'BROOKLYN' : mapping.borough;
  if (mapping.blockRange) {
    return `boro = '${boroughName}' AND block >= '${mapping.blockRange[0]}' AND block <= '${mapping.blockRange[1]}'`;
  }
  return `boro = '${boroughName}'`;
}

// Build filter for DOB Violations (uses boro, block)
export function buildDOBViolationsFilter(bounds: NeighborhoodBounds): string {
  const mapping = buildBoroughBlockFilter(bounds);
  if (mapping.blockRange) {
    return `boro = '${mapping.borough}' AND block >= '${mapping.blockRange[0].toString().padStart(5, '0')}' AND block <= '${mapping.blockRange[1].toString().padStart(5, '0')}'`;
  }
  return `boro = '${mapping.borough}'`;
}

// Build filter for DOB Permits (uses borough, block)
export function buildDOBPermitsFilter(bounds: NeighborhoodBounds): string {
  const mapping = buildBoroughBlockFilter(bounds);
  // DOB Permits use "BROOKLYN" for borough name
  const boroughName = mapping.borough === '3' ? 'BROOKLYN' : mapping.borough;
  if (mapping.blockRange) {
    return `borough = '${boroughName}' AND block >= '${mapping.blockRange[0].toString().padStart(5, '0')}' AND block <= '${mapping.blockRange[1].toString().padStart(5, '0')}'`;
  }
  return `borough = '${boroughName}'`;
}
