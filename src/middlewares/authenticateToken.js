const jwt = require("jsonwebtoken");

function createAuthenticateToken(jwtSecret, isTokenBlacklisted) {
  return function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized",
        details: "Missing Bearer token in Authorization header",
      });
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (isTokenBlacklisted && isTokenBlacklisted(token)) {
      return res.status(401).json({
        error: "Unauthorized",
        details: "Token has been logged out",
      });
    }

    try {
      req.user = jwt.verify(token, jwtSecret);
      req.token = token;
      return next();
    } catch {
      return res.status(401).json({
        error: "Unauthorized",
        details: "Invalid or expired token",
      });
    }
  };
}

module.exports = {
  createAuthenticateToken,
};
