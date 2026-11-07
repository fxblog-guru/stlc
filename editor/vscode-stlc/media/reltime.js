// @ts-check
/**
 * Relative time, written once and loaded twice: by the extension (`live.ts` requires it, so the
 * unit tests cover it) and by the page (a plain <script>, so the labels keep ticking without a
 * message from the host). Two copies of "how long ago" would drift into two different answers on
 * one screen.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else /** @type {any} */ (root).StlcTime = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /**
   * @param {number | string | null | undefined} at  epoch ms or an ISO string
   * @param {number} [now]
   * @returns {string}
   */
  function relativeTime(at, now) {
    const t = typeof at === 'string' ? Date.parse(at) : typeof at === 'number' ? at : NaN;
    if (!Number.isFinite(t)) return '';
    const n = typeof now === 'number' ? now : Date.now();
    const s = Math.max(0, Math.floor((n - t) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
    const d = new Date(t);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }

  /** How long until the label from `relativeTime` would change — the page ticks no faster than this. */
  function nextTickMs(at, now) {
    const t = typeof at === 'string' ? Date.parse(at) : at;
    const n = typeof now === 'number' ? now : Date.now();
    const s = Math.max(0, (n - t) / 1000);
    if (s < 3600) return 15000;
    return 60000;
  }

  return { relativeTime, nextTickMs };
});
