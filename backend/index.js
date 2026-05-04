// 1. Core Module Imports
const { setDefaultResultOrder } = require('dns')
setDefaultResultOrder('ipv4first')

const express = require('express')
const postgres = require('postgres')
require('dotenv').config()

const app = express()
app.use(express.json())

// 2. Database Configuration (postgres.js - confirmed working)
const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  connect_timeout: 30,
  idle_timeout: 20,
  max: 10
})

// 3. Immediate Connection Test
console.log('--- Attempting Supabase Connection Test ---')
sql`SELECT NOW()`
  .then(res => {
    console.log('✅ SUCCESS: Connected to Supabase!')
    console.log('Current Database Time:', res[0].now)
  })
  .catch(err => {
    console.error('❌ FAILED to connect to Supabase!')
    console.error('Error details:', err.message)
  })

// 4. Health Check Endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() })
})

// 5. Nearby Outlets Endpoint (REQ-001, REQ-002, REQ-107)
app.get('/api/v1/outlets/nearby', async (req, res) => {
  console.log(`--- Nearby Request Received: ${new Date().toISOString()} ---`)

  const { lat, lng, radius = 2000 } = req.query

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and longitude are required' })
  }

  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)
  const radiusNum = parseFloat(radius)

  if (isNaN(latNum) || isNaN(lngNum) || isNaN(radiusNum)) {
    return res.status(400).json({ error: 'lat, lng, and radius must be valid numbers' })
  }

  try {
    console.log('Executing nearby outlets query...')

    // postgres.js uses template literals - longitude first in ST_Point
    const results = await sql`
      SELECT 
        id,
        outlet_name,
        outlet_formaladdress,
        ST_Distance(location, ST_Point(${lngNum}, ${latNum})::geography) AS dist_m
      FROM outlets_main
      WHERE ST_DWithin(location, ST_Point(${lngNum}, ${latNum})::geography, ${radiusNum})
        AND outlet_status = 'ACTIVE'
        AND location_pin_quality IN ('precise', 'area')
        AND location IS NOT NULL
      ORDER BY dist_m ASC
    `

    console.log(`Query successful. Found ${results.length} active outlets.`)
    res.json(results)

  } catch (err) {
    console.error('Database Query Error:', err.message)
    res.status(500).json({ error: 'Internal server error during outlet search' })
  }
})

// 6. Start the Server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 ZeroThree Backend is live!`)
  console.log(`Listening at: http://localhost:${PORT}`)
})