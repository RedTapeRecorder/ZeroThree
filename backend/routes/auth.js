// routes/auth.js
const express = require('express');
const auth = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sql } = require('../db');    // ← correct now
const { pool } = require('../db'); // pg Pool instance
const { requireRider, requireManager } = require('../middleware/authenticate');

// ─────────────────────────────────────────────
// POST /api/v1/auth/manager/login
// REQ-004 | Manager logs in with email + password, returns JWT
// ─────────────────────────────────────────────
auth.post('/manager/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM managers WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const manager = result.rows[0];

    // Use a constant-time compare even on "not found" to prevent
    // user enumeration via timing attacks
    const dummyHash = '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
    const hashToCompare = manager ? manager.password_hash : dummyHash;
    const isValid = await bcrypt.compare(password, hashToCompare);

    if (!manager || !isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: manager.id, role: 'manager', name: manager.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.name,
      },
    });
    } catch (err) {
    console.error('[auth/manager/login] FULL ERROR:', err); // ← log the whole object, not just err.message
    return res.status(500).json({ 
      error: err.message,  // ← temporarily expose to response
      code: err.code,
      detail: err.detail,
    });
  }
});

// ─────────────────────────────────────────────
// POST /api/v1/auth/rider/setup
// REQ-004, REQ-005 | Rider enters one-time setup code, receives permanent auth token
// ─────────────────────────────────────────────
auth.post('/rider/setup', async (req, res) => {
  const { setup_code } = req.body;

  if (!setup_code) {
    return res.status(400).json({ error: 'setup_code is required' });
  }

  try {
    // Find a rider whose setup_code matches and hasn't been used yet
    // setup_code is stored plaintext (short-lived, single-use)
    const result = await pool.query(
      `SELECT id, full_name, status, setup_code, auth_token_hash
       FROM riders
       WHERE setup_code = $1`,
      [setup_code.trim()]
    );

    const rider = result.rows[0];

    if (!rider) {
      return res.status(401).json({ error: 'Invalid or already used setup code' });
    }

    if (rider.status === 'locked') {
      return res.status(403).json({ error: 'Account is locked. Contact your manager.' });
    }

    // Generate a cryptographically secure permanent auth token
    const rawToken = crypto.randomBytes(48).toString('hex'); // 96-char hex string
    const tokenHash = await bcrypt.hash(rawToken, 12);

    // Persist the hash and clear the one-time code atomically
    await pool.query(
      `UPDATE riders
       SET auth_token_hash = $1,
           setup_code = NULL,
           last_active_at = NOW()
       WHERE id = $2`,
      [tokenHash, rider.id]
    );

    return res.status(200).json({
      token: rawToken,           // Sent once — rider must store this in flutter_secure_storage
      rider: {
        id: rider.id,
        full_name: rider.full_name,
      },
    });
  } catch (err) {
    console.error('[auth/rider/setup]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/v1/auth/rider/verify
// REQ-036, REQ-043 | Verifies rider token on every reconnect, returns account status
// ─────────────────────────────────────────────
auth.post('/rider/verify', async (req, res) => {
  const authHeader = req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const rawToken = authHeader.slice(7); // strip "Bearer "

  try {
    // Pull the rider by a lightweight lookup — we need the hash to compare
    // Since we can't query by hash directly, require the rider to also send their id
    // Alternative: use a lookup index on a short token prefix (see note below)
    const { rider_id } = req.body;

    if (!rider_id) {
      return res.status(400).json({ error: 'rider_id is required in request body' });
    }

    const result = await pool.query(
      `SELECT id, full_name, status, auth_token_hash, fcm_token
       FROM riders
       WHERE id = $1`,
      [rider_id]
    );

    const rider = result.rows[0];

    if (!rider) {
      return res.status(401).json({ status: 'invalid' });
    }

    // auth_token_hash = NULL means the account was locked (REQ-043)
    if (!rider.auth_token_hash) {
      return res.status(200).json({ status: 'locked' });
    }

    const isValid = await bcrypt.compare(rawToken, rider.auth_token_hash);

    if (!isValid) {
      return res.status(401).json({ status: 'invalid' });
    }

    if (rider.status === 'locked') {
      return res.status(200).json({ status: 'locked' });
    }

    // Update last_active_at on every successful verify (tracks last server sync)
    await pool.query(
      'UPDATE riders SET last_active_at = NOW() WHERE id = $1',
      [rider.id]
    );

    return res.status(200).json({
      status: 'active',
      rider: {
        id: rider.id,
        full_name: rider.full_name,
      },
    });
  } catch (err) {
    console.error('[auth/rider/verify]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// NOT INDICATED IN THE IMPLEMENTATION PLAN
// PATCH /admin/riders/:id/reset-setup
// Manager regenerates a setup code for a rider who has lost their token

auth.patch('/admin/riders/:id/reset-setup', requireManager, async (req, res) => {
  const riderId = parseInt(req.params.id, 10);

  // Generate a new readable setup code
  const newSetupCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  // e.g. "A3F8B21C" — easy to read out over the phone

  await pool.query(
    `UPDATE riders
     SET setup_code     = $1,
         auth_token_hash = NULL,   -- invalidate existing token
         last_active_at  = NULL
     WHERE id = $2`,
    [newSetupCode, riderId]
  );

  return res.status(200).json({ setup_code: newSetupCode });
});

module.exports = auth;