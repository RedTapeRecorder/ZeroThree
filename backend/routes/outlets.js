const express = require('express')
const router = express.Router()
const sql = require('../db')

router.get('/nearby', async (req, res) => {
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

router.get('/:id/last-visit', async (req, res) => {
  console.log(`--- Last Visit Request Received: ${new Date().toISOString()} ---`)

  const {id} = req.params
  if(!id){
    return res.status(400).json({error:'Outlet ID is required'})
  }

  try{
    console.log("Executing last outlet visited")
    const results = await sql`
    SELECT
      rider_id,
      outlet_id,
      outcome,
      arrived_at,
      departed_at,
      order_id
    FROM visits
    WHERE outlet_id=${id} 
    ORDER BY arrived_at DESC
    LIMIT 1
    `
    const outlet = await sql`
    SELECT show_last_visitor, show_last_visit_time
    FROM outlets_main
    WHERE id = ${id}
    `
    if(results.length===0){
      return res.json({outlet_id:id,message:"No visits recorded yet"})
    }

    //Build Response
    const response = {
      outlet_id: id,
      outcome: results[0].outcome,
      last_visit_date: results[0].departed_at
    }

    //Conditional Fields
    if(outlet[0].show_last_visitor){
      response.rider_id=results[0].rider_id
    }

    if(outlet[0].show_last_visit_time){
      response.exact_time=results[0].arrived_at
    } 

    res.json(response)
  } catch (err) {
    console.error('Error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports=router