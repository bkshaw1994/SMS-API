const blacklistedTokens = new Map();

function addTokenToBlacklist(token, expUnixSeconds) {
  const expiryMs =
    typeof expUnixSeconds === "number"
      ? expUnixSeconds * 1000
      : Date.now() + 24 * 60 * 60 * 1000;
  blacklistedTokens.set(token, expiryMs);
}

function isTokenBlacklisted(token) {
  const expiryMs = blacklistedTokens.get(token);
  if (!expiryMs) {
    return false;
  }

  if (Date.now() > expiryMs) {
    blacklistedTokens.delete(token);
    return false;
  }

  return true;
}

module.exports = {
  addTokenToBlacklist,
  isTokenBlacklisted,
};
