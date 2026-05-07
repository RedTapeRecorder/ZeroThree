const express = require('express')
const routes = express.Router()
const { sql } = require('../db');    // ← correct now
const { pool } = require('../db'); // pg Pool instance
const { requireRider, requireManager } = require('../middleware/authenticate');

routes.get('/my-route', requireRider, async (req, res) => {
  const riderId = req.rider.id; // From auth middleware

  try {
    const routeQuery = await pool.query(
      `SELECT r.id, r.route_name, r.created_at
       FROM routes r
       WHERE r.rider_id = $1 AND r.status = 'active'
       LIMIT 1`,
      [riderId]
    );

    if (routeQuery.rows.length === 0) {
      return res.status(200).json({ route: null });
    }

    const route = routeQuery.rows[0];
    const outlets = await pool.query(
      `SELECT 
        o.id, o.outlet_name, o.outlet_barangay, o.latitude, o.longitude,
        ro.sequence_number, ro.is_high_priority
       FROM route_outlets ro
       JOIN outlets_main o ON o.id = ro.outlet_id
       WHERE ro.route_id = $1
       ORDER BY ro.sequence_number ASC`,
      [route.id]
    );

    res.status(200).json({
      ...route,
      outlets: outlets.rows
    });
  } catch (err) {
    console.error('[GET /routes/my-route]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports=routes