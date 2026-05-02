// Tiny logger gated by CHACON_DEBUG=1 (set when --debug is passed).
// info() always prints; debug() only prints when debug mode is on.
//
// Use info() for things the user always wants to see (per-hotel result counts,
// site outcomes, partial-result notices). Use debug() for click-by-click /
// CSS-selector noise that's only useful when investigating a broken scraper.

export const isDebug = () => process.env.CHACON_DEBUG === '1';

export function info(...args) { console.log(...args); }

export function debug(...args) {
  if (isDebug()) console.log(...args);
}
