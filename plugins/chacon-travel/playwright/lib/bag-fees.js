// Per-airline checked-bag fees (one-way, first checked bag) used to compute
// total trip cost. Bag fees are charged per direction (outbound + return).
//
// Values are policy-based and may go stale — override here as airlines change
// pricing. Unknown airlines fall through to DEFAULT.
const BAG_FEE_ONE_WAY = {
  'Southwest': 35,
  'Southwest Airlines': 35,
  'Delta': 45,
  'Delta Air Lines': 45,
  'Delta Airlines': 45,
  'United': 50,
  'United Airlines': 50,
  'American': 40,
  'American Airlines': 40,
  'JetBlue': 40,
  'JetBlue Airways': 40,
  'Alaska': 40,
  'Alaska Airlines': 40,
  'Spirit': 40,
  'Spirit Airlines': 40,
  'Frontier': 40,
  'Frontier Airlines': 40,
};

const DEFAULT_ONE_WAY = 40;

/**
 * Returns the per-direction (one-way) checked-bag fee for an airline.
 * Match is case-insensitive and uses the longest matching key (so
 * "Delta Air Lines" wins over "Delta" when both match).
 */
export function bagFeeOneWay(airline) {
  if (!airline) return DEFAULT_ONE_WAY;
  const lc = airline.toLowerCase();
  let best = null;
  for (const key of Object.keys(BAG_FEE_ONE_WAY)) {
    if (lc.includes(key.toLowerCase())) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ? BAG_FEE_ONE_WAY[best] : DEFAULT_ONE_WAY;
}

/**
 * Returns { outbound, return: returnFee, total } for a traveler count.
 * Bag fees are paid per direction per traveler.
 */
export function bagFeesForTrip(airline, travelers = 1) {
  const oneWay = bagFeeOneWay(airline);
  const outbound = oneWay * travelers;
  const ret = oneWay * travelers;
  return { outbound, return: ret, total: outbound + ret, oneWay };
}
