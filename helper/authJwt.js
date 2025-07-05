const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET ;

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
