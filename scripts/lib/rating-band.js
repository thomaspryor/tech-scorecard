// Published rating -> score band. Same rule as Broadway Scorecard
// (scripts/lib/star-reliability.js there): a rating is a band, not a point,
// and the review's text places it inside the band.
//   >= 90% of scale -> 91-100, >= 70% -> 71-90, >= 50% -> 51-70, >= 30% -> 31-50, else 0-30.
//   A printed percentage ("90%") is already a score: +/- 5 points.
const PERCENT_BAND_HALF_WIDTH = 5;

/** "4.5/5", "8 out of 10", "4 stars", "90%" -> {floor, ceiling} or null when unparseable. */
function ratingToBand(rating) {
  if (!rating) return null;
  const s = String(rating).trim();
  const pct = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) {
    const v = Math.round(parseFloat(pct[1]));
    return { floor: Math.max(0, v - PERCENT_BAND_HALF_WIDTH), ceiling: Math.min(100, v + PERCENT_BAND_HALF_WIDTH) };
  }
  let num;
  let max;
  const frac = s.match(/^(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)(?:\s*stars?)?$/i);
  const stars = s.match(/^(\d(?:\.\d)?)\s*stars?$/i);
  if (frac) [num, max] = [parseFloat(frac[1]), parseFloat(frac[2])];
  else if (stars) [num, max] = [parseFloat(stars[1]), 5];
  else return null;
  if (!(max > 0) || num < 0 || num > max) return null;
  const f = num / max;
  if (f >= 0.9) return { floor: 91, ceiling: 100 };
  if (f >= 0.7) return { floor: 71, ceiling: 90 };
  if (f >= 0.5) return { floor: 51, ceiling: 70 };
  if (f >= 0.3) return { floor: 31, ceiling: 50 };
  return { floor: 0, ceiling: 30 };
}

module.exports = { ratingToBand, PERCENT_BAND_HALF_WIDTH };
