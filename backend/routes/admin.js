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
  const { outlet_name, outlet_status, outlet_formaladdress, location_pin_quality, lat, lng } = req.body

  // 2. Validate required fields
  if (!outlet_name || !outlet_status || !outlet_formaladdress || !location_pin_quality || !lat || !lng) {
    return res.status(400).json({ error: 'Required fields are missing' })
  }

  // 3. Insert into database
  try {
    const result = await sql`
      INSERT INTO outlets_main (outlet_name, outlet_status, outlet_formaladdress, location_pin_quality, location)
      VALUES (${outlet_name}, ${outlet_status}, ${outlet_formaladdress}, ${location_pin_quality}, ST_Point(${lng}, ${lat})::geography)
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