// unique.js — names no other run, platform or shard can also create (the twin of data/unique.ts).
// Usage in a flow:  - runScript: { file: ../../shared/maestro/scripts/unique.js, env: { LABEL: order } }
//                   - inputText: ${output.unique.order}
// Format: qa-<run id>-<platform>-<shard>-<n>-<label>, lowercase, safe for any text field.

output.unique = output.unique || {};
output.uniqueSeq = (output.uniqueSeq || 0) + 1;
var label = typeof LABEL !== 'undefined' ? String(LABEL) : 'item';
var run = output.run || { id: 'local', platform: maestro.platform, shard: '1' };
output.unique[label] = ['qa', run.id, run.platform, run.shard, output.uniqueSeq, label].join('-').toLowerCase();
