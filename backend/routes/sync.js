const express = require('express')
const sync = express.Router()
const crypto = require('crypto');
const { sql } = require('../db');    // ← correct now
const { pool } = require('../db'); // pg Pool instance
const { requireRider, requireManager } = require('../middleware/authenticate');

// ─────────────────────────────────────────────
// GET /api/v1/sync/shift-start
// REQ-002, REQ-032, REQ-072, REQ-073, REQ-075, REQ-107
// Called once per shift over WiFi before the rider goes into the field
// Returns AES-256-GCM encrypted payload containing:
//   - Active outlets where pin quality is precise or area only (REQ-107)
//   - Assigned route for this rider (REQ-032)
//   - System config: geofence radius + GPS poll interval (REQ-072, REQ-073)
//   - A-GPS almanac flag (REQ-075)
// Session key returned alongside encrypted payload — Flutter holds it in
// memory only, never written to device storage (REQ-087)
// ─────────────────────────────────────────────
sync.get('/sync/shift-start', requireRider, async (req, res) => {
  const riderId = req.rider.id;

  try {
    // ── 1. System config ───────────────────────
    // REQ-072, REQ-073: read geofence radius and GPS poll interval from DB
    // so they can be changed without redeploying the app
    const configResult = await pool.query(
      `SELECT key, value FROM system_config
       WHERE key IN ('geofence_radius_meters', 'gps_poll_interval_seconds')`
    );

    const config = {};
    configResult.rows.forEach(row => {
      config[row.key] = parseFloat(row.value);
    });

    const geofenceRadiusMeters  = config['geofence_radius_meters']     ?? 20;
    const gpsPollIntervalSeconds = config['gps_poll_interval_seconds']  ?? 10;

    // ── 2. Active outlets — quality filtered ───
    // REQ-107: ONLY precise or area pin quality transmitted to rider devices
    // cluster, mismatch, missing are NEVER included regardless of outlet_status
    const outletsResult = await pool.query(
      `SELECT
         o.id,
         o.outlet_name,
         o.outlet_formaladdress,
         o.outlet_barangay,
         o.outlet_district,
         o.outlet_area,
         o.owner_name,
         o.location_pin_quality,
         o.location_verification_level,
         o.outlet_last_visit_time,
         o.show_last_visitor,
         o.show_last_visit_time,
         ST_Y(o.location::geometry) AS latitude,
         ST_X(o.location::geometry) AS longitude
       FROM outlets_main o
       WHERE o.outlet_status = 'active'
         AND o.location_pin_quality IN ('precise', 'area')
         AND o.location IS NOT NULL
       ORDER BY o.id`
    );

    // ── 3. Assigned route ──────────────────────
    // REQ-032: active route for this rider included in sync payload
    const routeResult = await pool.query(
      `SELECT
         r.id          AS route_id,
         r.route_name  AS route_name,
         ro.outlet_id,
         ro.sequence_order,
         ro.is_high_priority
       FROM routes r
       JOIN routes_outlets ro ON ro.route_id = r.id
       WHERE r.assigned_rider_id = $1
         AND r.is_active = TRUE
       ORDER BY ro.sequence_order`,
      [riderId]
    );

    // Shape route into a clean structure
    let assignedRoute = null;
    if (routeResult.rows.length > 0) {
      assignedRoute = {
        route_id:   routeResult.rows[0].route_id,
        route_name: routeResult.rows[0].route_name,
        outlets:    routeResult.rows.map(row => ({
          outlet_id:        row.outlet_id,
          sequence_order:   row.sequence_order,
          is_high_priority: row.is_high_priority,
        })),
      };
    }

    // ── 4. A-GPS almanac flag ──────────────────
    // REQ-075, REQ-081: ~10KB downloaded once per day during shift-start sync
    // Flag tells Flutter whether to fetch fresh almanac data
    // We set it to true — Flutter decides whether to actually download
    // based on whether it already fetched today
    const agpsAlmanacFlag = true;

    // ── 5. Assemble plaintext payload ──────────
    const payload = {
      synced_at:             new Date().toISOString(),
      system_config: {
        geofence_radius_meters:   geofenceRadiusMeters,
        gps_poll_interval_seconds: gpsPollIntervalSeconds,
      },
      outlets:        outletsResult.rows,
      assigned_route: assignedRoute,
      agps_almanac:   agpsAlmanacFlag,
    };

    const payloadJson = JSON.stringify(payload);

    // ── 6. Size guard ──────────────────────────
    // REQ-075: sync must complete within 60 seconds over typical branch WiFi
    // Warn in logs if payload exceeds 200KB — photos are never included (REQ-012)
    const payloadSizeKB = Buffer.byteLength(payloadJson, 'utf8') / 1024;
    if (payloadSizeKB > 200) {
      console.warn(
        `[sync/shift-start] Payload size ${payloadSizeKB.toFixed(1)}KB exceeds 200KB limit for rider ${riderId}`
      );
    }

    // ── 7. AES-256-GCM encryption ─────────────
    // REQ-033, REQ-086: all outlet data encrypted with session key
    // REQ-087: session key held in Flutter memory only — never stored on device
    // Key and IV are generated fresh per shift
    const sessionKey = crypto.randomBytes(32); // 256-bit key
    const iv         = crypto.randomBytes(12);  // 96-bit IV — standard for GCM

    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(payloadJson, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag(); // GCM authentication tag — detects tampering

    // ── 8. Return encrypted payload + session key ──
    // Flutter receives both, holds session key in memory only
    // On logout or shift end: Flutter discards the key → cached data unreadable (REQ-034, REQ-035)
    return res.status(200).json({
      session_key:       sessionKey.toString('hex'),  // 64-char hex — Flutter holds in memory
      iv:                iv.toString('hex'),           // 24-char hex — needed for decryption
      auth_tag:          authTag.toString('hex'),      // 32-char hex — GCM integrity check
      encrypted_payload: encrypted.toString('base64'), // base64-encoded ciphertext
      payload_size_kb:   parseFloat(payloadSizeKB.toFixed(2)),
      outlet_count:      outletsResult.rows.length,
      has_route:         assignedRoute !== null,
    });
  } catch (err) {
    console.error('[GET /sync/shift-start]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports=sync