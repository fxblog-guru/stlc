// api.js — the one place a flow issues HTTP (the twin of http/api.client.ts). It is a request
// described by env, so it needs nothing kept between scripts:
//   - runScript:
//       file: ../../shared/maestro/scripts/api.js
//       env:
//         METHOD: POST
//         PATH: /orders
//         BODY: '{"name":"${output.unique.order}","status":"Draft"}'
//         SAVE_AS: order            # output.data.order = the parsed response
//         UNDO: /orders/{id}        # registered for cleanup.yaml; {field} filled from the response
// Base URL and token come from the runner's -e variables (API_BASE_URL, API_TOKEN) — never a flow.

if (typeof API_BASE_URL === 'undefined' || !API_BASE_URL) throw new Error('API_BASE_URL is not set — add it to .env.<env>; the runner passes it with -e');
var method = (typeof METHOD !== 'undefined' ? METHOD : 'GET').toUpperCase();
var url = API_BASE_URL.replace(/\/$/, '') + PATH;
var headers = { 'Content-Type': 'application/json' };
if (typeof API_TOKEN !== 'undefined' && API_TOKEN) headers.Authorization = 'Bearer ' + API_TOKEN;
var opts = { headers: headers };
if (typeof BODY !== 'undefined' && BODY) opts.body = BODY;

var res = method === 'POST' ? http.post(url, opts) : method === 'PUT' ? http.put(url, opts) : method === 'DELETE' ? http.delete(url, opts) : http.get(url, opts);
if (!res.ok) throw new Error(method + ' ' + PATH + ' → ' + res.status + ': ' + res.body);

var data = res.body ? json(res.body) : null;
output.data = output.data || {};
if (typeof SAVE_AS !== 'undefined' && SAVE_AS) output.data[SAVE_AS] = data;
if (typeof UNDO !== 'undefined' && UNDO) {
  var undo = UNDO.replace(/\{(\w+)\}/g, function (_, k) { return data && data[k] !== undefined ? data[k] : '{' + k + '}'; });
  output.cleanup = output.cleanup || [];
  output.cleanup.push(undo);
}
