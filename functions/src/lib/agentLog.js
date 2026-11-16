const { AsyncLocalStorage } = require("async_hooks");

const store = new AsyncLocalStorage();

function setRequestContext(ctx) {
  return store.run(ctx, () => ctx);
}

function getRequestContext() {
  return store.getStore() || {};
}

/**
 * One JSON line per phase — easy to grep in emulator / Cloud Logging.
 * Never logs full prompts or PII dumps.
 */
function agentLog(agent, phase, fields = {}) {
  const ctx = getRequestContext();
  const line = {
    ts: new Date().toISOString(),
    requestId: fields.requestId || ctx.requestId || null,
    agent,
    phase,
    ...fields,
  };
  // Avoid nested undefined noise
  for (const key of Object.keys(line)) {
    if (line[key] === undefined) delete line[key];
  }
  console.log(JSON.stringify(line));
}

function httpLog(fields = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      type: "http",
      ...fields,
    }),
  );
}

module.exports = { agentLog, httpLog, setRequestContext, getRequestContext, store };
