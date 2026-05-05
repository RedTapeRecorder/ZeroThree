const express = require('express')
const admin = express.Router()
const sql = require('../db')

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

module.exports=admin