// actor.js — resolve ACTOR to its credentials (the twin of the actor pool in auth/session.ts).
// The runner builds QA_ACTORS from .env.<env> — `standard` from TEST_USER / TEST_PASSWORD, any other
// role from TEST_USER_<ROLE> / TEST_PASSWORD_<ROLE> — and passes it with -e as one JSON value.
// A role with no credentials stops the flow with the variable names to set.

var role = typeof ACTOR !== 'undefined' && ACTOR ? String(ACTOR) : 'standard';
var actors = typeof QA_ACTORS !== 'undefined' && QA_ACTORS ? JSON.parse(QA_ACTORS) : {};
var a = actors[role];
if (!a || !a.user || !a.password) {
  var suffix = role === 'standard' ? '' : '_' + role.toUpperCase().replace(/-/g, '_');
  throw new Error('actor `' + role + '`: set TEST_USER' + suffix + ' and TEST_PASSWORD' + suffix + ' in .env.<env>');
}
output.actor = { role: role, user: a.user, password: a.password };
