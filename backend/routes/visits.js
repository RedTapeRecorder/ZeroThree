const express = require('express')
const visits = express.Router()
const { sql } = require('../db');    // ← correct now

visits.post('/', async(req,res)=>{
    const{rider_id,outlet_id,outcome,arrived_at,departed_at,duration_minutes,units_refill,units_stove,
        units_trippler,payment
    } = req.body

    if (!rider_id || !outlet_id || !outcome || !arrived_at || !departed_at ||!duration_minutes) {
        return res.status(400).json({ error: 'Required fields are missing' })
    }

    try {
        const result = await sql`
        INSERT INTO visits (rider_id,outlet_id,outcome,arrived_at,departed_at,duration_minutes,units_refill,units_stove,units_trippler,payment)
        VALUES (${rider_id}, ${outlet_id}, ${outcome},${arrived_at}, ${departed_at}, ${duration_minutes},${units_refill || null}, ${units_stove || null}, ${units_trippler || null}, ${payment || null})
        RETURNING *
        `

    // 4. Return 201 with the created record
    res.status(201).json(result[0])
    } catch (err) {
        console.error('Error:', err.message)
        res.status(500).json({ error: 'Internal server error' })
    }
})

module.exports=visits