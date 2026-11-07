// run-context.js — loaded first by every case flow (runScript). Sets:
//   output.T    every duration a flow may wait, in ms — the ONLY place a timeout is written
//   output.run  the run id, the platform and the shard, for unique names and evidence
// Values come from the runner's -e variables; the defaults below are what a local run uses.
// Maestro JS runs in a sandbox: no require, no process — env variables are plain globals.

output.T = {
  appLaunch: Number(typeof QA_T_APP_LAUNCH !== 'undefined' ? QA_T_APP_LAUNCH : 20000),
  screen: Number(typeof QA_T_SCREEN !== 'undefined' ? QA_T_SCREEN : 10000),
  network: Number(typeof QA_T_NETWORK !== 'undefined' ? QA_T_NETWORK : 15000),
  toast: Number(typeof QA_T_TOAST !== 'undefined' ? QA_T_TOAST : 5000),
};

output.run = {
  id: typeof QA_RUN_ID !== 'undefined' ? QA_RUN_ID : 'local',
  platform: typeof MAESTRO_PLATFORM !== 'undefined' ? MAESTRO_PLATFORM : String(maestro.platform).toLowerCase(),
  shard: typeof QA_SHARD !== 'undefined' ? QA_SHARD : '1',
};
