// Buyer-focused intelligence: tax abatements, comp analysis, negotiation insights
import { fetchTaxAbatementByBBL, fetchPropertyAssessment, type TaxAbatement, type PropertyAssessment } from './nyc-apis';
import { type StreetEasyListing } from './streeteasy';
import { type StoredSale, type NeighborhoodStats } from './kv-storage';

// Tax Abatement Analysis
export interface TaxAbatementAnalysis {
  hasAbatement: boolean;
  abatementType: string | null; // 421-a, J-51, etc.
  startYear: number | null;
  yearsTotal: number | null;
  yearsRemaining: number | null;
  expirationYear: number | null;
  currentTaxBenefit: number | null;
  estimatedPostExpirationTax: number | null;
  warningMessage: string | null;
}

const ABATEMENT_NAMES: Record<string, string> = {
  '421A': '421-a',
  '421-A': '421-a',
  '421a': '421-a',
  'J51': 'J-51',
  'J-51': 'J-51',
  '420C': '420-c',
  '420-C': '420-c',
  'ICIP': 'ICIP',
  'ICAP': 'ICAP',
};

export async function analyzeTaxAbatement(bbl: string): Promise<TaxAbatementAnalysis> {
  const result: TaxAbatementAnalysis = {
    hasAbatement: false,
    abatementType: null,
    startYear: null,
    yearsTotal: null,
    yearsRemaining: null,
    expirationYear: null,
    currentTaxBenefit: null,
    estimatedPostExpirationTax: null,
    warningMessage: null,
  };

  try {
    const [abatement, assessment] = await Promise.all([
      fetchTaxAbatementByBBL(bbl),
      fetchPropertyAssessment(bbl),
    ]);

    if (!abatement) {
      return result;
    }

    result.hasAbatement = true;
    result.abatementType = ABATEMENT_NAMES[abatement.abatement.toUpperCase()] || abatement.abatement;
    result.startYear = parseInt(abatement.init_year, 10) || null;
    result.yearsTotal = parseInt(abatement.ex_years, 10) || null;

    if (result.startYear && result.yearsTotal) {
      result.expirationYear = result.startYear + result.yearsTotal;
      const currentYear = new Date().getFullYear();
      result.yearsRemaining = Math.max(0, result.expirationYear - currentYear);
    }

    // Estimate current vs post-expiration taxes
    if (assessment && abatement.total_tax) {
      const currentTax = parseFloat(abatement.total_tax);
      const abPct = parseFloat(abatement.ab_pct) || 0;

      if (abPct > 0 && abPct < 100) {
        // Current tax is reduced by ab_pct, so full tax = current / (1 - ab_pct/100)
        const fullTax = currentTax / (1 - abPct / 100);
        result.currentTaxBenefit = Math.round(fullTax - currentTax);
        result.estimatedPostExpirationTax = Math.round(fullTax);
      } else if (assessment.avtot) {
        // Estimate from assessed value (rough NYC rate ~10% of assessed for most classes)
        const assessed = parseFloat(assessment.avtot);
        const estimatedFullTax = assessed * 0.1;
        result.currentTaxBenefit = Math.round(estimatedFullTax - currentTax);
        result.estimatedPostExpirationTax = Math.round(estimatedFullTax);
      }
    }

    // Generate warning message
    if (result.yearsRemaining !== null && result.yearsRemaining <= 5) {
      const taxJump = result.currentTaxBenefit
        ? `taxes will increase from ~$${Math.round(parseFloat(abatement.total_tax)).toLocaleString()}/yr to estimated $${result.estimatedPostExpirationTax?.toLocaleString()}/yr`
        : 'taxes will increase significantly';

      if (result.yearsRemaining === 0) {
        result.warningMessage = `${result.abatementType} tax abatement has EXPIRED — ${taxJump}. Verify current tax bill with seller.`;
      } else {
        result.warningMessage = `${result.abatementType} tax abatement expires ${result.expirationYear} (${result.yearsRemaining} year${result.yearsRemaining > 1 ? 's' : ''} remaining) — ${taxJump}`;
      }
    }

    return result;
  } catch (error) {
    console.error('Tax abatement analysis error:', error);
    return result;
  }
}

// Comp Analysis
export interface CompAnalysis {
  askingPricePerSqft: number | null;
  medianCompPricePerSqft: number | null;
  deltaPercent: number | null;
  isAboveMarket: boolean;
  summary: string | null;
}

export function analyzeComps(
  listing: StreetEasyListing | null,
  neighborhoodStats: NeighborhoodStats | null
): CompAnalysis {
  const result: CompAnalysis = {
    askingPricePerSqft: null,
    medianCompPricePerSqft: null,
    deltaPercent: null,
    isAboveMarket: false,
    summary: null,
  };

  if (!listing?.pricePerSqft || !neighborhoodStats?.sales.days180.avgPricePerSqft) {
    // If we have asking price but no sqft, try to estimate
    if (listing?.askingPrice && neighborhoodStats?.sales.days180.medianPrice) {
      const medianPrice = neighborhoodStats.sales.days180.medianPrice;
      const askingPrice = listing.askingPrice;
      const delta = ((askingPrice - medianPrice) / medianPrice) * 100;

      result.deltaPercent = Math.round(delta);
      result.isAboveMarket = delta > 0;

      if (delta > 5) {
        result.summary = `Asking $${askingPrice.toLocaleString()} vs neighborhood median $${medianPrice.toLocaleString()} — priced ${Math.abs(result.deltaPercent)}% above market`;
      } else if (delta < -5) {
        result.summary = `Asking $${askingPrice.toLocaleString()} vs neighborhood median $${medianPrice.toLocaleString()} — priced ${Math.abs(result.deltaPercent)}% below market`;
      } else {
        result.summary = `Asking $${askingPrice.toLocaleString()} — in line with neighborhood median of $${medianPrice.toLocaleString()}`;
      }
    }
    return result;
  }

  result.askingPricePerSqft = listing.pricePerSqft;
  result.medianCompPricePerSqft = neighborhoodStats.sales.days180.avgPricePerSqft;

  const delta = ((result.askingPricePerSqft - result.medianCompPricePerSqft) / result.medianCompPricePerSqft) * 100;
  result.deltaPercent = Math.round(delta);
  result.isAboveMarket = delta > 0;

  if (delta > 5) {
    result.summary = `Asking $${result.askingPricePerSqft}/sqft vs neighborhood median $${result.medianCompPricePerSqft}/sqft — priced ${Math.abs(result.deltaPercent)}% above market`;
  } else if (delta < -5) {
    result.summary = `Asking $${result.askingPricePerSqft}/sqft vs neighborhood median $${result.medianCompPricePerSqft}/sqft — priced ${Math.abs(result.deltaPercent)}% below market`;
  } else {
    result.summary = `Asking $${result.askingPricePerSqft}/sqft — in line with neighborhood median of $${result.medianCompPricePerSqft}/sqft`;
  }

  return result;
}

// Property Type Detection
export type PropertyType = 'coop' | 'condo' | 'house' | 'multi-family' | 'unknown';

export interface PropertyTypeInfo {
  type: PropertyType;
  warning: string | null;
}

const COOP_BUILDING_CLASSES = ['C6', 'C8', 'D0', 'D4'];
const CONDO_BUILDING_CLASSES = ['R1', 'R2', 'R3', 'R4', 'R6', 'R9', 'RR'];
const HOUSE_BUILDING_CLASSES = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3', 'B9'];

export function detectPropertyType(
  buildingClass: string | null,
  deedTypes: string[] = [],
  streetEasyType: string | null = null
): PropertyTypeInfo {
  const result: PropertyTypeInfo = { type: 'unknown', warning: null };

  // Check StreetEasy type first (most reliable for active listings)
  if (streetEasyType) {
    if (streetEasyType === 'coop') {
      result.type = 'coop';
    } else if (streetEasyType === 'condo') {
      result.type = 'condo';
    } else if (streetEasyType === 'townhouse' || streetEasyType === 'house') {
      result.type = 'house';
    }
  }

  // Fall back to building class
  if (result.type === 'unknown' && buildingClass) {
    const bc = buildingClass.toUpperCase();
    if (COOP_BUILDING_CLASSES.some(c => bc.startsWith(c))) {
      result.type = 'coop';
    } else if (CONDO_BUILDING_CLASSES.some(c => bc.startsWith(c))) {
      result.type = 'condo';
    } else if (HOUSE_BUILDING_CLASSES.some(c => bc.startsWith(c))) {
      result.type = 'house';
    }
  }

  // Check deed types for UCC (coop indicator)
  if (result.type === 'unknown') {
    for (const deed of deedTypes) {
      const d = deed.toUpperCase();
      if (d.includes('UCC') || d.includes('COOP') || d.includes('STOCK')) {
        result.type = 'coop';
        break;
      }
    }
  }

  // Add warnings
  if (result.type === 'coop') {
    result.warning = `This is a co-op. Monthly maintenance includes underlying mortgage and property taxes. Request the most recent audited financials and board meeting minutes before making an offer. We cannot pull this data automatically — your attorney should request it directly.`;
  } else if (result.type === 'condo') {
    result.warning = `This is a condo. Request the most recent offering plan amendment and reserve fund balance from the managing agent.`;
  }

  return result;
}

// Enhanced Negotiation Signal
export interface NegotiationInsight {
  signal: 'strong_buyer' | 'slight_buyer' | 'neutral' | 'slight_seller' | 'strong_seller';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  factors: string[];
  suggestedOfferRange: { low: number; high: number } | null;
}

export function generateNegotiationInsight(
  listing: StreetEasyListing | null,
  neighborhoodStats: NeighborhoodStats | null,
  sales: StoredSale[] = []
): NegotiationInsight {
  const factors: string[] = [];
  let score = 0; // negative = buyer advantage, positive = seller advantage

  // Default insight
  const insight: NegotiationInsight = {
    signal: 'neutral',
    confidence: 'low',
    summary: 'Insufficient data to assess negotiation position. Request listing history from the seller\'s agent.',
    factors: [],
    suggestedOfferRange: null,
  };

  if (!listing?.askingPrice) {
    return insight;
  }

  // Factor 1: Days on Market
  const avgDOM = neighborhoodStats ? 30 : 28; // Use neighborhood avg or default 28
  if (listing.daysOnMarket !== null) {
    if (listing.daysOnMarket > avgDOM * 1.5) {
      score -= 2;
      factors.push(`Listed ${listing.daysOnMarket} days — ${Math.round((listing.daysOnMarket / avgDOM - 1) * 100)}% longer than neighborhood average of ${avgDOM} days`);
    } else if (listing.daysOnMarket > avgDOM) {
      score -= 1;
      factors.push(`Listed ${listing.daysOnMarket} days — slightly above neighborhood average of ${avgDOM} days`);
    } else if (listing.daysOnMarket < avgDOM * 0.5) {
      score += 2;
      factors.push(`Only ${listing.daysOnMarket} days on market — moving fast`);
    } else {
      factors.push(`${listing.daysOnMarket} days on market — normal pace for the area`);
    }
  }

  // Factor 2: Price Reductions
  if (listing.priceReductions > 0) {
    if (listing.priceReductions >= 2) {
      score -= 2;
      factors.push(`Price reduced ${listing.priceReductions} times totaling $${listing.totalPriceReduction.toLocaleString()}`);
    } else {
      score -= 1;
      factors.push(`Price reduced once by $${listing.totalPriceReduction.toLocaleString()}`);
    }
  } else if (listing.daysOnMarket && listing.daysOnMarket > 30) {
    factors.push('No price reductions despite extended time on market');
    score -= 1;
  }

  // Factor 3: Price vs Comps
  if (neighborhoodStats?.sales.days180.medianPrice) {
    const median = neighborhoodStats.sales.days180.medianPrice;
    const delta = ((listing.askingPrice - median) / median) * 100;

    if (delta > 15) {
      score += 2;
      factors.push(`Priced ${Math.round(delta)}% above recent comps — may be overpriced`);
    } else if (delta > 5) {
      score += 1;
      factors.push(`Priced ${Math.round(delta)}% above neighborhood median`);
    } else if (delta < -10) {
      score += 2;
      factors.push(`Priced ${Math.round(Math.abs(delta))}% below comps — attractive pricing`);
    } else if (delta < -5) {
      score += 1;
      factors.push(`Priced ${Math.round(Math.abs(delta))}% below median — competitive`);
    } else {
      factors.push('Priced in line with recent comparable sales');
    }
  }

  // Factor 4: Seasonality
  const month = new Date().getMonth() + 1;
  if (month >= 11 || month <= 1) {
    score -= 1;
    factors.push('Winter market typically favors buyers');
  } else if (month >= 3 && month <= 6) {
    score += 1;
    factors.push('Spring market typically favors sellers');
  }

  // Factor 5: Listing Status
  if (listing.listingStatus === 'in_contract') {
    score += 3;
    factors.push('Property is already in contract');
  }

  // Determine signal
  if (score <= -3) {
    insight.signal = 'strong_buyer';
  } else if (score <= -1) {
    insight.signal = 'slight_buyer';
  } else if (score >= 3) {
    insight.signal = 'strong_seller';
  } else if (score >= 1) {
    insight.signal = 'slight_seller';
  } else {
    insight.signal = 'neutral';
  }

  // Confidence based on data availability
  const dataPoints = [
    listing.daysOnMarket !== null,
    listing.priceHistory.length > 0,
    neighborhoodStats !== null,
    listing.sqft !== null,
  ].filter(Boolean).length;

  if (dataPoints >= 3) {
    insight.confidence = 'high';
  } else if (dataPoints >= 2) {
    insight.confidence = 'medium';
  } else {
    insight.confidence = 'low';
  }

  insight.factors = factors;

  // Generate summary paragraph
  insight.summary = generateNegotiationSummary(insight, listing, neighborhoodStats);

  // Suggested offer range
  if (insight.confidence !== 'low') {
    const askingPrice = listing.askingPrice;
    if (insight.signal === 'strong_buyer') {
      insight.suggestedOfferRange = {
        low: Math.round(askingPrice * 0.88),
        high: Math.round(askingPrice * 0.94),
      };
    } else if (insight.signal === 'slight_buyer') {
      insight.suggestedOfferRange = {
        low: Math.round(askingPrice * 0.93),
        high: Math.round(askingPrice * 0.97),
      };
    } else if (insight.signal === 'slight_seller') {
      insight.suggestedOfferRange = {
        low: Math.round(askingPrice * 0.97),
        high: Math.round(askingPrice * 1.0),
      };
    } else if (insight.signal === 'strong_seller') {
      insight.suggestedOfferRange = {
        low: Math.round(askingPrice * 0.98),
        high: Math.round(askingPrice * 1.02),
      };
    } else {
      insight.suggestedOfferRange = {
        low: Math.round(askingPrice * 0.95),
        high: Math.round(askingPrice * 0.98),
      };
    }
  }

  return insight;
}

function generateNegotiationSummary(
  insight: NegotiationInsight,
  listing: StreetEasyListing,
  neighborhoodStats: NeighborhoodStats | null
): string {
  const parts: string[] = [];

  // Days on market context
  if (listing.daysOnMarket !== null) {
    const avgDOM = 28;
    if (listing.daysOnMarket > avgDOM * 1.5) {
      parts.push(`This property has been listed ${listing.daysOnMarket} days — nearly double the neighborhood average of ${avgDOM} days.`);
    } else if (listing.daysOnMarket < 14) {
      parts.push(`Listed just ${listing.daysOnMarket} days ago — still fresh on market.`);
    }
  }

  // Price reduction context
  if (listing.priceReductions > 0) {
    parts.push(`The price has been reduced ${listing.priceReductions} time${listing.priceReductions > 1 ? 's' : ''} totaling $${listing.totalPriceReduction.toLocaleString()}.`);
  }

  // Comp context
  if (neighborhoodStats?.sales.days180.medianPrice && listing.askingPrice) {
    const median = neighborhoodStats.sales.days180.medianPrice;
    const delta = ((listing.askingPrice - median) / median) * 100;
    if (Math.abs(delta) > 5) {
      parts.push(`Current ask is ${Math.abs(Math.round(delta))}% ${delta > 0 ? 'above' : 'below'} recent comps.`);
    }
  }

  // Recommendation
  if (insight.signal === 'strong_buyer') {
    parts.push('There is meaningful room to negotiate — consider opening at 8-12% below ask.');
  } else if (insight.signal === 'slight_buyer') {
    parts.push('Moderate negotiating room exists — consider opening 5-7% below ask.');
  } else if (insight.signal === 'strong_seller') {
    parts.push('Seller is in a strong position. Come in at or near ask with clean terms to compete.');
  } else if (insight.signal === 'slight_seller') {
    parts.push('Limited negotiating room. A modest discount of 2-3% may be possible with a strong offer.');
  } else {
    parts.push('Standard negotiating dynamics — a 3-5% discount is reasonable to explore.');
  }

  return parts.join(' ');
}
