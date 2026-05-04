// 1. Core Module Imports
const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json()); // Allows the API to read JSON bodies

// 2. Database Configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Essential for Supabase
  },
  // Adding these for the Pooler (Port 6543)
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, 
});

// 3. Immediate Connection Test
// This runs as soon as you type 'node index.js'
console.log('--- Attempting Supabase Connection Test ---');
pool.query('SELECT NOW()')
  .then(res => {
    console.log('✅ SUCCESS: Connected to Supabase!');
    console.log('Current Database Time:', res.rows[0].now);
  })
  .catch(err => {
    console.error('❌ FAILED to connect to Supabase!');
    console.error('Error details:', err.message);
    console.error('Action: Check your .env file for correct DATABASE_URL and password.');
  });

// 4. Health Check Endpoint (REQ-Health)[cite: 1]
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 5. Nearby Outlets Endpoint (REQ-001, REQ-002, REQ-107)[cite: 1]
app.get('/api/v1/outlets/nearby', async (req, res) => {
  console.log(`--- Nearby Request Received: ${new Date().toISOString()} ---`);
  
  const { lat, lng, radius = 2000 } = req.query;

  // Basic validation[cite: 1]
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    // Spatial query using PostGIS geography types for accuracy in San Juan City
    const nearbyQuery = `
      SELECT id, outlet_name, outlet_formaladdress, 
             ST_Distance(location, ST_Point($1, $2)::geography) AS dist_m
      FROM outlets_duplicate
      WHERE ST_DWithin(location, ST_Point($1, $2)::geography, $3)
        AND outlet_status = 'active'
        AND location_pin_quality IN ('precise', 'area')
        AND location IS NOT NULL
      ORDER BY dist_m ASC;
    `;

    const values = [lng, lat, radius]; // Coordinates order: Longitude, Latitude[cite: 1]
    
    console.log('Executing database query...');
    const result = await pool.query(nearbyQuery, values);
    
    console.log(`Query successful. Found ${result.rows.length} active outlets.`);
    res.json(result.rows);

  } catch (err) {
    console.error('Database Query Error:', err.message);
    res.status(500).json({ error: 'Internal server error during outlet search' });
  }
});

// 6. Start the Server[cite: 1]
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 ZeroThree Backend is live!`);
  console.log(`Listening at: http://localhost:${PORT}`);
});