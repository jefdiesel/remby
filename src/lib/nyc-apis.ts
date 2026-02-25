// NYC Open Data API endpoints and utilities

const SOCRATA_APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

interface SocrataRequestOptions {
  limit?: number;
  offset?: number;
  where?: string;
  select?: string;
  order?: string;
}

async function fetchSocrata<T>(endpoint: string, options: SocrataRequestOptions = {}): Promise<T[]> {
  const url = new URL(endpoint);

  if (options.limit) url.searchParams.set('$limit', options.limit.toString());
  if (options.offset) url.searchParams.set('$offset', options.offset.toString());
  if (options.where) url.searchParams.set('$where', options.where);
  if (options.select) url.searchParams.set('$select', options.select);
  if (options.order) url.searchParams.set('$order', options.order);

  const headers: HeadersInit = {
    'Accept': 'application/json',
  };

  if (SOCRATA_APP_TOKEN) {
    headers['X-App-Token'] = SOCRATA_APP_TOKEN;
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`Socrata API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// NYC ACRIS Real Property Master (document records with amounts/dates)
export interface ACRISMaster {
  document_id: string;
  recorded_borough: string;
  doc_type: string;
  document_date: string;
  document_amt: string;
  recorded_datetime: string;
  percent_trans: string;
  crfn: string;
}

export async function fetchACRISMaster(options: SocrataRequestOptions = {}): Promise<ACRISMaster[]> {
  return fetchSocrata<ACRISMaster>(
    'https://data.cityofnewyork.us/resource/bnx9-e6tj.json',
    options
  );
}

// NYC ACRIS Real Property Legals (links documents to properties)
export interface ACRISLegal {
  document_id: string;
  borough: string;
  block: string;
  lot: string;
  easement: string;
  partial_lot: string;
  property_type: string;
}

export async function fetchACRISLegals(options: SocrataRequestOptions = {}): Promise<ACRISLegal[]> {
  return fetchSocrata<ACRISLegal>(
    'https://data.cityofnewyork.us/resource/8h5j-fqxa.json',
    options
  );
}

// Combined sale type for convenience
export interface ACRISSale {
  document_id: string;
  recorded_borough: string;
  doc_type: string;
  document_date: string;
  document_amt: string;
  borough?: string;
  block?: string;
  lot?: string;
}

// Small delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch sales: query Master for deeds, then lookup BBL from Legals
export async function fetchACRISSales(options: SocrataRequestOptions = {}): Promise<ACRISSale[]> {
  // Fetch deed records from ACRIS Master
  const masterRecords = await fetchACRISMaster(options);

  if (masterRecords.length === 0) return [];

  // Get document IDs to lookup BBL info from Legals
  const documentIds = [...new Set(masterRecords.map(r => r.document_id))];

  // Fetch legals in batches
  const batchSize = 50;
  const legals: ACRISLegal[] = [];

  for (let i = 0; i < documentIds.length; i += batchSize) {
    const batch = documentIds.slice(i, i + batchSize);
    const idList = batch.map(id => `'${id}'`).join(',');

    try {
      const batchLegals = await fetchACRISLegals({
        where: `document_id in (${idList})`,
        limit: 500,
      });
      legals.push(...batchLegals);
    } catch (e) {
      console.error(`ACRIS legals batch ${i} failed:`, e);
    }

    // Small delay between batches
    if (i + batchSize < documentIds.length) {
      await delay(50);
    }
  }

  // Create lookup map for legals
  const legalsByDocId = new Map<string, ACRISLegal>();
  for (const legal of legals) {
    if (legal.block && legal.lot && legal.block !== '0') {
      legalsByDocId.set(legal.document_id, legal);
    }
  }

  // Combine data
  return masterRecords.map(master => ({
    document_id: master.document_id,
    recorded_borough: master.recorded_borough,
    doc_type: master.doc_type,
    document_date: master.document_date,
    document_amt: master.document_amt,
    borough: legalsByDocId.get(master.document_id)?.borough,
    block: legalsByDocId.get(master.document_id)?.block,
    lot: legalsByDocId.get(master.document_id)?.lot,
  }));
}

// Also fetch ACRIS parties for buyer/seller names
export interface ACRISParty {
  document_id: string;
  party_type: string;
  name: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export async function fetchACRISParties(documentIds: string[]): Promise<ACRISParty[]> {
  if (documentIds.length === 0) return [];

  // Batch to avoid URL too long errors
  const batchSize = 50;
  const allParties: ACRISParty[] = [];

  for (let i = 0; i < documentIds.length; i += batchSize) {
    const batch = documentIds.slice(i, i + batchSize);
    const idList = batch.map(id => `'${id}'`).join(',');

    try {
      const parties = await fetchSocrata<ACRISParty>(
        'https://data.cityofnewyork.us/resource/636b-3b5g.json',
        { where: `document_id in (${idList})`, limit: 500 }
      );
      allParties.push(...parties);
    } catch (e) {
      console.error(`ACRIS parties batch ${i} failed:`, e);
    }

    // Small delay between batches
    if (i + batchSize < documentIds.length) {
      await delay(50);
    }
  }

  return allParties;
}

// HPD Violations
export interface HPDViolation {
  violationid: string;
  buildingid: string;
  boroid: string;
  borough: string;
  block: string;
  lot: string;
  apartment: string;
  story: string;
  class: string;
  inspectiondate: string;
  approveddate: string;
  originalcertifybydate: string;
  originalcorrectbydate: string;
  newcertifybydate: string;
  newcorrectbydate: string;
  certifieddate: string;
  ordernumber: string;
  novid: string;
  novdescription: string;
  novissueddate: string;
  currentstatus: string;
  currentstatusdate: string;
  novtype: string;
  violationstatus: string;
  latitude: string;
  longitude: string;
  communityboard: string;
  councildistrict: string;
  censustract: string;
  bin: string;
  bbl: string;
  nta: string;
}

export async function fetchHPDViolations(options: SocrataRequestOptions = {}): Promise<HPDViolation[]> {
  return fetchSocrata<HPDViolation>(
    'https://data.cityofnewyork.us/resource/wvxf-dwi5.json',
    options
  );
}

// DOB Violations
export interface DOBViolation {
  isn_dob_bis_viol: string;
  boro: string;
  bin: string;
  block: string;
  lot: string;
  issue_date: string;
  violation_type_code: string;
  violation_number: string;
  house_number: string;
  street: string;
  disposition_date: string;
  disposition_comments: string;
  device_number: string;
  description: string;
  ecb_number: string;
  number: string;
  violation_category: string;
  violation_type: string;
}

export async function fetchDOBViolations(options: SocrataRequestOptions = {}): Promise<DOBViolation[]> {
  return fetchSocrata<DOBViolation>(
    'https://data.cityofnewyork.us/resource/3h2n-5cm9.json',
    options
  );
}

// DOB Permits
export interface DOBPermit {
  job__: string;
  doc__: string;
  borough: string;
  house__: string;
  street_name: string;
  block: string;
  lot: string;
  bin__: string;
  job_type: string;
  job_status: string;
  job_status_descrp: string;
  latest_action_date: string;
  building_type: string;
  residential: string;
  special_district_1: string;
  special_district_2: string;
  work_type: string;
  permit_status: string;
  filing_status: string;
  permit_type: string;
  permit_sequence__: string;
  permit_subtype: string;
  oil_gas: string;
  site_fill: string;
  filing_date: string;
  issuance_date: string;
  expiration_date: string;
  job_start_date: string;
  permittee_s_first_name: string;
  permittee_s_last_name: string;
  permittee_s_business_name: string;
  permittee_s_phone__: string;
  permittee_s_license_type: string;
  permittee_s_license__: string;
  act_as_superintendent: string;
  permittee_s_other_title: string;
  hic_license: string;
  site_safety_mgr_s_first_name: string;
  site_safety_mgr_s_last_name: string;
  site_safety_mgr_business_name: string;
  superintendent_first___last_name: string;
  superintendent_business_name: string;
  owner_s_business_type: string;
  non_profit: string;
  owner_s_business_name: string;
  owner_s_first_name: string;
  owner_s_last_name: string;
  owner_s_house__: string;
  owner_s_house_street_name: string;
  owner_s_house_city: string;
  owner_s_house_state: string;
  owner_s_house_zip_code: string;
  owner_s_phone__: string;
  dobrundate: string;
  bbl: string;
  latitude: string;
  longitude: string;
}

export async function fetchDOBPermits(options: SocrataRequestOptions = {}): Promise<DOBPermit[]> {
  return fetchSocrata<DOBPermit>(
    'https://data.cityofnewyork.us/resource/ipu4-2q9a.json',
    options
  );
}

// NYC Finance Property Data (for tax info)
export interface NYCFinanceProperty {
  paession: string;
  bbl: string;
  boro: string;
  block: string;
  lot: string;
  easession: string;
  housenum_lo: string;
  housenum_hi: string;
  str_name: string;
  zip_code: string;
  bld_story: string;
  bldgcl: string;
  taxclass: string;
  ltfront: string;
  ltdepth: string;
  ext: string;
  story: string;
  fullval: string;
  avland: string;
  avtot: string;
  exland: string;
  extot: string;
  excd1: string;
  staddr: string;
  city: string;
  postcode: string;
  period: string;
  year: string;
}

export async function fetchNYCFinanceProperties(options: SocrataRequestOptions = {}): Promise<NYCFinanceProperty[]> {
  return fetchSocrata<NYCFinanceProperty>(
    'https://data.cityofnewyork.us/resource/bnx9-e6tj.json',
    options
  );
}

// NYC GeoSearch for address autocomplete
export interface GeoSearchFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    id: string;
    gid: string;
    layer: string;
    source: string;
    source_id: string;
    name: string;
    housenumber: string;
    street: string;
    postalcode: string;
    accuracy: string;
    country: string;
    country_gid: string;
    country_a: string;
    region: string;
    region_gid: string;
    region_a: string;
    county: string;
    county_gid: string;
    county_a: string;
    locality: string;
    locality_gid: string;
    locality_a: string;
    borough: string;
    borough_gid: string;
    neighbourhood: string;
    neighbourhood_gid: string;
    label: string;
    addendum?: {
      pad?: {
        bbl?: string;
        bin?: string;
      };
    };
  };
}

export interface GeoSearchResponse {
  type: 'FeatureCollection';
  features: GeoSearchFeature[];
  bbox?: [number, number, number, number];
}

export async function geocodeAddress(query: string): Promise<GeoSearchResponse> {
  const url = new URL('https://geosearch.planninglabs.nyc/v2/autocomplete');
  url.searchParams.set('text', query);
  url.searchParams.set('size', '10');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`GeoSearch API error: ${response.status}`);
  }

  return response.json();
}

// Tax Abatements (421-a, J-51, etc.)
export interface TaxAbatement {
  bbl: string;
  abatement: string; // 421-a, J-51, etc.
  init_year: string;
  ex_years: string;
  ab_pct: string;
  amt_remain: string;
  total_tax: string;
  tax_year: string;
}

export async function fetchTaxAbatements(options: SocrataRequestOptions = {}): Promise<TaxAbatement[]> {
  return fetchSocrata<TaxAbatement>(
    'https://data.cityofnewyork.us/resource/y7az-s7wc.json',
    options
  );
}

export async function fetchTaxAbatementByBBL(bbl: string): Promise<TaxAbatement | null> {
  const borough = bbl[0];
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6);

  const abatements = await fetchTaxAbatements({
    where: `b = '${borough}' AND block = '${block}' AND lot = '${lot}'`,
    order: 'tax_year DESC',
    limit: 1,
  });

  return abatements.length > 0 ? abatements[0] : null;
}

// Property Assessment (for tax estimates)
export interface PropertyAssessment {
  bbl: string;
  boro: string;
  block: string;
  lot: string;
  bldgcl: string; // Building class
  taxclass: string;
  avtot: string; // Assessed total value
  excd1: string; // Exemption code
  excd2: string;
  fullval: string; // Full market value
  year: string;
}

export async function fetchPropertyAssessment(bbl: string): Promise<PropertyAssessment | null> {
  const borough = bbl[0];
  const block = bbl.slice(1, 6).replace(/^0+/, '');
  const lot = bbl.slice(6).replace(/^0+/, '');

  const assessments = await fetchSocrata<PropertyAssessment>(
    'https://data.cityofnewyork.us/resource/yjxr-fw8i.json',
    {
      where: `boro = '${borough}' AND block = '${block}' AND lot = '${lot}'`,
      order: 'year DESC',
      limit: 1,
    }
  );

  return assessments.length > 0 ? assessments[0] : null;
}

// Helper to construct BBL from borough, block, lot
export function constructBBL(borough: string, block: string, lot: string): string {
  // Borough codes: 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island
  const boroughCode = getBoroughCode(borough);
  const paddedBlock = block.padStart(5, '0');
  const paddedLot = lot.padStart(4, '0');
  return `${boroughCode}${paddedBlock}${paddedLot}`;
}

export function getBoroughCode(borough: string): string {
  const normalized = borough.toUpperCase().trim();
  const codes: Record<string, string> = {
    'MANHATTAN': '1',
    'MN': '1',
    '1': '1',
    'BRONX': '2',
    'BX': '2',
    '2': '2',
    'BROOKLYN': '3',
    'BK': '3',
    'KINGS': '3',
    '3': '3',
    'QUEENS': '4',
    'QN': '4',
    '4': '4',
    'STATEN ISLAND': '5',
    'SI': '5',
    'RICHMOND': '5',
    '5': '5',
  };
  return codes[normalized] || '0';
}

export function getBoroughName(code: string): string {
  const names: Record<string, string> = {
    '1': 'Manhattan',
    '2': 'Bronx',
    '3': 'Brooklyn',
    '4': 'Queens',
    '5': 'Staten Island',
  };
  return names[code] || 'Unknown';
}
