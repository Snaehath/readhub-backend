const { verifyToken } = require("./authJwt");
const User = require("../models/user");

function readBearerToken(req) {
  const [scheme, token, extra] = (req.headers.authorization || "").split(" ");
  return scheme === "Bearer" && token && !extra ? token : null;
}

function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  const user = token ? verifyToken(token) : null;
  if (!user || !user.userId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  req.authUser = user;
  return next();
}

async function requireAdmin(req, res, next) {
  const token = readBearerToken(req);
  const user = token ? verifyToken(token) : null;
  if (!user || !user.userId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const currentUser = await User.findById(user.userId).select("role");
  if (!currentUser || currentUser.role !== "admin") {
    return res.status(403).json({ error: "Admins only." });
  }
  req.authUser = user;
  return next();
}

module.exports = { requireAuth, requireAdmin };
