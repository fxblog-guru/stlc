// Named timeouts — the ONLY place a wait duration may be written (generating-* rule: no magic
// literals, no sleeps). Add a named constant when none fits; never inline a number in a spec.
export const TIMEOUTS = {
  /** page.goto → arrival assertion */
  NAVIGATION: 30_000,
  /** a field/button becomes visible after an action */
  FIELD_VISIBLE: 10_000,
  /** a modal/drawer closes after confirm */
  MODAL_CLOSE: 10_000,
  /** a toast/notification appears */
  TOAST: 5_000,
  /** an API call issued by the UI or a service client returns */
  API_RESPONSE: 15_000,
  /** pollUntil: interval between attempts */
  POLL_INTERVAL: 1_000,
  /** pollUntil: maximum window for async (202) work to settle */
  POLL_MAX: 60_000,
  /** DB read-back after an API mutation (replication / outbox lag) */
  DB_READBACK: 10_000,
  /** axe scan on a fully rendered screen */
  A11Y_SCAN: 20_000,
} as const;

export type TimeoutName = keyof typeof TIMEOUTS;
