const express = require('express')
const admin = express.Router()
const { sql } = require('../db');    // ← correct now
const { pool } = require('../db'); // pg Pool instance
const { requireRider, requireManager } = require('../middleware/authenticate');

admin.get('/outlets', async (req, res) => {
  const { status, pin_quality, verification_level } = req.query

  try {
    const results = await sql`
      SELECT 
        id,
        outlet_name,
        outlet_formaladdress,
        outlet_status,
        location_pin_quality,
        location_verification_level
      FROM outlets_main
      WHERE 1=1
      ${status ? sql`AND outlet_status = ${status}` : sql``}
      ${pin_quality ? sql`AND location_pin_quality = ${pin_quality}` : sql``}
      ${verification_level ? sql`AND location_verification_level = ${verification_level}` : sql``}
      ORDER BY outlet_status ASC, id ASC
    `
    res.json(results)
  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

admin.get('/outlets/unvisited', async (req, res) => {
  try {
    const results = await sql`
        SELECT o.id, o.outlet_name, o.outlet_formaladdress, o.outlet_status
        FROM outlets_main o
        WHERE o.outlet_status = 'ACTIVE'
        AND o.id NOT IN (
            SELECT DISTINCT outlet_id 
            FROM visits 
            WHERE arrived_at > NOW() - INTERVAL '7 days'
            )
        ORDER BY o.outlet_status ASC, o.id ASC;
      `
    res.json(results)
  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

admin.post('/outlets', async (req, res) => {
  // 1. Extract from request body
  const { outlet_name, outlet_status, outlet_formaladdress, location_pin_quality, location_verification_level, owner_name, lat, lng, 
          outlet_city, outlet_district, outlet_barangay, owner_contact, outlet_area, outlet_concerningbranch, show_last_visitor, show_last_visit_time
  } = req.body

  // 2. Validate required fields
  if (!outlet_name || !outlet_status || !outlet_formaladdress || !location_pin_quality || !location_verification_level ||!owner_name|| !lat || !lng) {
    return res.status(400).json({ error: 'Required fields are missing' })
  }

  // 3. Insert into database
  try {
    const result = await sql`
      INSERT INTO outlets_main (outlet_name, outlet_status, outlet_formaladdress, location_pin_quality, location_verification_level, owner_name, location,
      outlet_city, outlet_district, outlet_barangay, owner_contact, outlet_area, outlet_concerningbranch, show_last_visitor, show_last_visit_time)
      VALUES (${outlet_name}, ${outlet_status}, ${outlet_formaladdress}, ${location_pin_quality}, ${location_verification_level}, ${owner_name}, ST_Point(${lng}, ${lat})::geography,
      ${outlet_city || null}, ${outlet_district || null}, ${outlet_barangay || null}, ${owner_contact || null}, ${outlet_area || null}, ${outlet_concerningbranch || null}, ${show_last_visitor ?? null}, ${show_last_visit_time ?? null}
      )
      RETURNING *
    `

    // 4. Return 201 with the created record
    res.status(201).json(result[0])

  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

admin.patch('/outlets/:id', async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ error: 'No outlet given' })
  }

  // Extract all possible fields
  const { outlet_name, outlet_status, outlet_formaladdress, 
          location_pin_quality, location_verification_level,
          owner_name, lat, lng, outlet_city, outlet_district, 
          outlet_barangay, owner_contact, outlet_area, 
          outlet_concerningbranch, show_last_visitor, 
          show_last_visit_time } = req.body

  // Build updates object FIRST
  const updates = {}
  if (outlet_name !== undefined) updates.outlet_name = outlet_name
  if (outlet_status !== undefined) updates.outlet_status = outlet_status
  if (outlet_formaladdress !== undefined) updates.outlet_formaladdress = outlet_formaladdress
  if (location_pin_quality !== undefined) updates.location_pin_quality = location_pin_quality
  if (location_verification_level !== undefined) updates.location_verification_level = location_verification_level
  if (owner_name !== undefined) updates.owner_name = owner_name
  if (outlet_city !== undefined) updates.outlet_city = outlet_city
  if (outlet_district !== undefined) updates.outlet_district = outlet_district
  if (outlet_barangay !== undefined) updates.outlet_barangay = outlet_barangay
  if (owner_contact !== undefined) updates.owner_contact = owner_contact
  if (outlet_area !== undefined) updates.outlet_area = outlet_area
  if (outlet_concerningbranch !== undefined) updates.outlet_concerningbranch = outlet_concerningbranch
  if (show_last_visitor !== undefined) updates.show_last_visitor = show_last_visitor
  if (show_last_visit_time !== undefined) updates.show_last_visit_time = show_last_visit_time

  // Validate something was sent
  const hasLocation = lat !== undefined && lng !== undefined
  if (Object.keys(updates).length === 0 && !hasLocation) {
    return res.status(400).json({ error: 'No fields provided to update' })
  }

  try {
    const result = await sql`
      UPDATE outlets_main
      SET
        ${sql(updates)},
        ${hasLocation ? sql`location = ST_Point(${lng}, ${lat})::geography,` : sql``}
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' })
    }

    res.json(result[0])

  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

admin.patch('/outlets/:id/flags', async (req, res) => {
  const { id } = req.params
  const { show_last_visitor, show_last_visit_time } = req.body

  // Validate - at least one flag must be provided
  if (show_last_visitor === undefined && show_last_visit_time === undefined) {
    return res.status(400).json({ error: 'No flags provided' })
  }

  try {
    const result = await sql`
      UPDATE outlets_main
      SET
        show_last_visitor = COALESCE(${show_last_visitor ?? null}, show_last_visitor),
        show_last_visit_time = COALESCE(${show_last_visit_time ?? null}, show_last_visit_time),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' })
    }

    res.json(result[0])

  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─────────────────────────────────────────────
// GET /api/v1/admin/visits/today
// REQ-066 | All visit activity from the current day across all riders
// Includes outcome, outlet name, rider, arrival, departure, duration
// ─────────────────────────────────────────────
admin.get('/visits/today', requireManager, async (req, res) => {
  console.log("initializing today's visits")
  try {
    const result = await pool.query(
      `SELECT
         v.id,
         v.outcome,
         v.arrived_at,
         v.departed_at,
         v.duration_minutes,
         v.units_refill,
         v.units_tripler,
         v.payment,
         v.created_at,
         o.id           AS outlet_id,
         o.outlet_name,
         o.outlet_barangay,
         o.outlet_district,
         r.id           AS rider_id,
         r.full_name    AS rider_name
       FROM visits v
       JOIN outlets_main o ON o.id = v.outlet_id
       JOIN riders  r ON r.id = v.rider_id
       WHERE v.arrived_at >= (NOW() AT TIME ZONE 'Asia/Manila')::DATE
          OR (
               v.arrived_at IS NULL
               AND v.created_at >= (NOW() AT TIME ZONE 'Asia/Manila')::DATE
             )
       ORDER BY COALESCE(v.arrived_at, v.created_at) DESC`
      // REQ-022: all times are stored as UTC but the day boundary is
      // evaluated in PST (UTC+8 / Asia/Manila) so "today" is correct
      // for the branch manager sitting in San Juan City
    );

    return res.status(200).json({
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), // YYYY-MM-DD
      count: result.rows.length,
      visits: result.rows.map(formatVisit),
    });
  } catch (err) {
    console.error('[GET /admin/visits/today]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/outlets/:id/visits
// REQ-067 | Full visit history for a specific outlet
// ─────────────────────────────────────────────
admin.get('/outlets/:id/visits', requireManager, async (req, res) => {
  const outletId = parseInt(req.params.id, 10);

  if (isNaN(outletId)) {
    return res.status(400).json({ error: 'Invalid outlet id' });
  }

  // Optional pagination via query params — ?limit=50&offset=0
  const limit  = Math.min(parseInt(req.query.limit  ?? 50,  10), 200);
  const offset =           parseInt(req.query.offset ?? 0,   10);

  try {
    // Verify outlet exists
    const outletCheck = await pool.query(
      `SELECT id, outlet_name FROM outlets WHERE id = $1`,
      [outletId]
    );

    if (outletCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    const result = await pool.query(
      `SELECT
         v.id,
         v.outcome,
         v.arrived_at,
         v.departed_at,
         v.duration_minutes,
         v.units_refilled,
         v.units_sold_new,
         v.payment_collected,
         v.gps_accuracy_meters,
         v.notes,
         v.created_at,
         r.id        AS rider_id,
         r.full_name AS rider_name
       FROM visits v
       JOIN riders r ON r.id = v.rider_id
       WHERE v.outlet_id = $1
       ORDER BY COALESCE(v.arrived_at, v.created_at) DESC
       LIMIT $2 OFFSET $3`,
      [outletId, limit, offset]
    );

    // Total count for pagination (separate query — COUNT(*) on filtered set)
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM visits WHERE outlet_id = $1`,
      [outletId]
    );

    return res.status(200).json({
      outlet_id: outletId,
      outlet_name: outletCheck.rows[0].outlet_name,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
      visits: result.rows.map(formatVisit),
    });
  } catch (err) {
    console.error('[GET /admin/outlets/:id/visits]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/riders/:id/visits
// REQ-068 | Full visit history for a specific rider
// ─────────────────────────────────────────────
admin.get('/riders/:id/visits', requireManager, async (req, res) => {
  const riderId = parseInt(req.params.id, 10);

  if (isNaN(riderId)) {
    return res.status(400).json({ error: 'Invalid rider id' });
  }

  const limit  = Math.min(parseInt(req.query.limit  ?? 50,  10), 200);
  const offset =           parseInt(req.query.offset ?? 0,   10);

  // Optional date filter — ?date=2026-03-15 (YYYY-MM-DD in PST)
  const dateFilter = req.query.date ?? null;

  try {
    const riderCheck = await pool.query(
      `SELECT id, full_name FROM riders WHERE id = $1`,
      [riderId]
    );

    if (riderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Rider not found' });
    }

    // Build WHERE clause conditionally to support optional date filter
    const conditions = [`v.rider_id = $1`];
    const params     = [riderId];
    let   paramIdx   = 2;

    if (dateFilter) {
      // Filter to a single calendar day in PST
      conditions.push(
        `(v.arrived_at AT TIME ZONE 'Asia/Manila')::DATE = $${paramIdx}`
      );
      params.push(dateFilter);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT
         v.id,
         v.outcome,
         v.arrived_at,
         v.departed_at,
         v.duration_minutes,
         v.units_refilled,
         v.units_sold_new,
         v.payment_collected,
         v.gps_accuracy_meters,
         v.notes,
         v.created_at,
         o.id           AS outlet_id,
         o.outlet_name,
         o.outlet_barangay
       FROM visits v
       JOIN outlets o ON o.id = v.outlet_id
       WHERE ${whereClause}
       ORDER BY COALESCE(v.arrived_at, v.created_at) DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM visits v WHERE ${whereClause}`,
      params
    );

    return res.status(200).json({
      rider_id: riderId,
      rider_name: riderCheck.rows[0].full_name,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
      visits: result.rows.map(formatVisit),
    });
  } catch (err) {
    console.error('[GET /admin/riders/:id/visits]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// Shared response formatter
// Keeps the shape consistent across all three GET endpoints
// ─────────────────────────────────────────────
function formatVisit(row) {
  return {
    id:                  row.id,
    outcome:             row.outcome,
    arrived_at:          row.arrived_at   ?? null,
    departed_at:         row.departed_at  ?? null,
    duration_minutes:    row.duration_minutes ?? null,
    units_refilled:      row.units_refilled  ?? 0,
    units_sold_new:      row.units_sold_new  ?? 0,
    payment_collected:   row.payment_collected
                           ? parseFloat(row.payment_collected)
                           : null,
    gps_accuracy_meters: row.gps_accuracy_meters
                           ? parseFloat(row.gps_accuracy_meters)
                           : null,
    notes:               row.notes ?? null,
    created_at:          row.created_at,
    // Rider context (present on today + outlet history endpoints)
    ...(row.rider_id && {
      rider: {
        id:   row.rider_id,
        name: row.rider_name,
      },
    }),
    // Outlet context (present on today + rider history endpoints)
    ...(row.outlet_id && {
      outlet: {
        id:       row.outlet_id,
        name:     row.outlet_name,
        barangay: row.outlet_barangay ?? null,
        ...(row.outlet_district && { district: row.outlet_district }),
      },
    }),
  };
}

module.exports=admin