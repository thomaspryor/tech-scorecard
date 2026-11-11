// Which outlet a review URL belongs to. Shared by refresh.js and the discovery code, so both read a URL the same way.
const { hostOf } = require('./page');

/** @typedef {{id: string, domain: string, altDomains?: string[]}} OutletDomains */

/**
 * The outlet a URL belongs to. Two outlets can share a domain (Digital Foundry publishes on eurogamer.net):
 * the one named in the path wins ("/digitalfoundry-..."), then the one the domain is named after.
 * @template {OutletDomains} O
 * @param {string} u
 * @param {O[]} outlets
 * @returns {O | undefined}
 */
function outletFor(u, outlets) {
  const host = hostOf(u);
  const found = outlets.filter((o) =>
    [o.domain, ...(o.altDomains || [])].some((d) => host === d || host.endsWith(`.${d}`)),
  );
  if (found.length < 2) return found[0];
  const key = (/** @type {string} */ s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let pathname = '';
  try {
    pathname = key(new URL(u).pathname);
  } catch {
    /* hostOf already matched, so the URL parses */
  }
  return (
    found.find((o) => pathname.includes(key(o.id))) ||
    found.find((o) => key(host.replace(/^www\./, '')).startsWith(key(o.id))) ||
    found[0]
  );
}

module.exports = { outletFor };
