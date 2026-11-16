const crypto = require("crypto");

function fingerprint(value) {
  const json = JSON.stringify(value, Object.keys(value).sort());
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 24);
}

module.exports = { fingerprint };
