// middleware/authenticate.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../db');

// ─────────────────────────────────────────────
// For manager-protected routes
// Validates the JWT returned by POST /auth/manager/login
// ─────────────────────────────────────────────
function requireManager(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (payload.role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.manager = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─────────────────────────────────────────────
// For rider-protected routes
// Validates the raw token stored in flutter_secure_storage
// Accepts token from Authorization header OR request body.
// Accepts rider ID from x-rider-id header OR rider_id in body.
// ─────────────────────────────────────────────
async function requireRider(req, res, next) {
  // 1️⃣ Extract token
  let rawToken = null;
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7);
  } else if (req.body?.token) {
    rawToken = req.body.token;
  }
  if (!rawToken) {
    return res.status(401).json({ error: 'Missing or malformed Authorization token (header or body)' });
  }

  // 2️⃣ Extract rider ID
  let riderId = null;
  const headerRiderId = req.headers['x-rider-id'];
  if (headerRiderId) {
    riderId = parseInt(headerRiderId, 10);
  } else if (req.body?.rider_id) {
    riderId = parseInt(req.body.rider_id, 10);
  }
  if (!riderId) {
    return res.status(400).json({ error: 'rider_id is required in header (x-rider-id) or body (rider_id)' });
  }

  try {
    const result = await pool.query(
      'SELECT id, status, auth_token_hash FROM riders WHERE id = $1',
      [riderId]
    );

    const rider = result.rows[0];

    if (!rider || !rider.auth_token_hash) {
      return res.status(401).json({ status: 'locked' });
    }

    const isValid = await bcrypt.compare(rawToken, rider.auth_token_hash);
    if (!isValid) return res.status(401).json({ error: 'Unauthorized' });

    if (rider.status === 'locked') {
      return res.status(403).json({ status: 'locked' });
    }

    req.rider = rider;
    next();
  } catch (err) {
    console.error('[requireRider]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { requireManager, requireRider };