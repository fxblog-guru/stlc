// cleanup.js — undo every record the flow registered, newest first (the twin of data/cleanup.ts).
// Run by flows/cleanup.yaml from onFlowComplete, so it also runs when the flow failed. A failed
// delete fails the hook: leftover data is a finding, not something to hide. 404 means already gone.

var base = typeof API_BASE_URL !== 'undefined' && API_BASE_URL ? API_BASE_URL.replace(/\/$/, '') : null;
var headers = {};
if (typeof API_TOKEN !== 'undefined' && API_TOKEN) headers.Authorization = 'Bearer ' + API_TOKEN;
var undo = (output.cleanup || []).slice().reverse();
var errors = [];
if (undo.length && !base) errors.push('API_BASE_URL is not set, so ' + undo.length + ' record(s) could not be removed');
for (var i = 0; base && i < undo.length; i++) {
  var res = http.delete(base + undo[i], { headers: headers });
  if (!res.ok && res.status !== 404) errors.push('DELETE ' + undo[i] + ' → ' + res.status);
}
output.cleanup = [];
if (errors.length) throw new Error('cleanup left data behind: ' + errors.join('; '));
