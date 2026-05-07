// routes/photos.js
const express = require('express');
const photos = express.Router();
const { pool } = require('../db');
const { requireRider, requireManager } = require('../middleware/authenticate');
const cloudinary = require('cloudinary').v2;

// Cloudinary is configured via environment variable CLOUDINARY_URL
// which is automatically picked up by the SDK — no explicit config call needed

// ─────────────────────────────────────────────
// GET /api/v1/outlets/:id/photo
// REQ-009, REQ-012 | Returns current approved photo URL for an outlet
// Called by rider app — lazy loaded only when outlet detail screen is opened
// Photos are NEVER included in shift-start sync payload
// ─────────────────────────────────────────────
photos .get('/outlets/:id/photo', requireRider, async (req, res) => {
  const outletId = parseInt(req.params.id, 10);

  if (isNaN(outletId)) {
    return res.status(400).json({ error: 'Invalid outlet id' });
  }

  try {
    const result = await pool.query(
      `SELECT id, cloudinary_url, submitted_at
       FROM outlet_photos
       WHERE outlet_id = $1
         AND status = 'approved'
         AND is_current = TRUE
       LIMIT 1`,
      [outletId]
    );

    if (result.rows.length === 0) {
      // No approved photo exists — rider app should show placeholder
      return res.status(200).json({ photo: null });
    }

    const photo = result.rows[0];

    return res.status(200).json({
      photo: {
        id: photo.id,
        url: photo.cloudinary_url,
        submitted_at: photo.submitted_at,
      },
    });
  } catch (err) {
    console.error('[GET /outlets/:id/photo]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/v1/outlets/:id/photo
// REQ-026, REQ-027, REQ-028 | Rider submits a new outlet photo
// Uploaded to Cloudinary, held as 'pending' — existing approved photo stays live
// Submission is silent from rider's perspective (no feedback beyond 201)
// ─────────────────────────────────────────────
photos.post('/outlets/:id/photo', requireRider, async (req, res) => {
  const outletId = parseInt(req.params.id, 10);

  if (isNaN(outletId)) {
    return res.status(400).json({ error: 'Invalid outlet id' });
  }

  // Expect the rider app to send the photo as a base64 data URI
  // e.g. "data:image/jpeg;base64,/9j/4AAQ..."
  const { photo_base64 } = req.body;

  if (!photo_base64) {
    return res.status(400).json({ error: 'photo_base64 is required' });
  }

  try {
    // Verify the outlet exists and is active before accepting the photo
    const outletCheck = await pool.query(
      `SELECT id FROM outlets_main WHERE id = $1 AND outlet_status = 'ACTIVE'`,
      [outletId]
    );

    if (outletCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Outlet not found or not active' });
    }

    // Upload to Cloudinary
    // eager transformation compresses to ~200KB per REQ-082
    const uploadResult = await cloudinary.uploader.upload(photo_base64, {
      folder: `zerothree/outlets/${outletId}`,
      eager: [
        {
          quality: 'auto:good',
          fetch_format: 'jpg',
          width: 1024,
          crop: 'limit',        // never upscale, only downscale
        },
      ],
      eager_async: false,       // wait for transformation before responding
    });

    const transformedUrl = uploadResult.eager?.[0]?.secure_url
      ?? uploadResult.secure_url;

    // Insert photo record as pending — does NOT touch is_current on any existing photo
    await pool.query(
      `INSERT INTO outlet_photos
         (outlet_id, submitted_by_rider_id, cloudinary_url, cloudinary_id,
          submission_source, status, is_current)
       VALUES ($1, $2, $3, $4, 'rider', 'pending', FALSE)`,
      [outletId, req.rider.id, transformedUrl, uploadResult.public_id]
    );

    // REQ-028: silent from rider's perspective — just 201, no payload
    return res.status(201).end();
  } catch (err) {
    console.error('[POST /outlets/:id/photo]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/v1/admin/outlets/:id/photo
// REQ-053 | Manager uploads a photo — approved immediately, becomes current
// No review step for manager-uploaded photos
// ─────────────────────────────────────────────
photos.post('/admin/outlets/:id/photo', requireManager, async (req, res) => {
  const outletId = parseInt(req.params.id, 10);

  if (isNaN(outletId)) {
    return res.status(400).json({ error: 'Invalid outlet id' });
  }

  const { photo_base64 } = req.body;

  if (!photo_base64) {
    return res.status(400).json({ error: 'photo_base64 is required' });
  }

  try {
    const outletCheck = await pool.query(
      `SELECT id FROM outlets WHERE id = $1`,
      [outletId]
    );

    if (outletCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Upload to Cloudinary with same compression as rider uploads
    const uploadResult = await cloudinary.uploader.upload(photo_base64, {
      folder: `zerothree/outlets/${outletId}`,
      eager: [
        {
          quality: 'auto:good',
          fetch_format: 'jpg',
          width: 1024,
          crop: 'limit',
        },
      ],
      eager_async: false,
    });

    const transformedUrl = uploadResult.eager?.[0]?.secure_url
      ?? uploadResult.secure_url;

    // Promote the new photo atomically:
    // 1. Demote any existing current photo
    // 2. Insert new photo as approved + current
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE outlet_photos
         SET is_current = FALSE
         WHERE outlet_id = $1 AND is_current = TRUE`,
        [outletId]
      );

      const insertResult = await client.query(
        `INSERT INTO outlet_photos
           (outlet_id, submitted_by_rider_id, cloudinary_url, cloudinary_id,
            submission_source, status, is_current,
            reviewed_at, reviewed_by)
         VALUES ($1, NULL, $2, $3, 'manager', 'approved', TRUE, NOW(), $4)
         RETURNING id, cloudinary_url, submitted_at`,
        [outletId, transformedUrl, uploadResult.public_id, req.manager.name]
      );

      await client.query('COMMIT');

      const photo = insertResult.rows[0];

      return res.status(201).json({
        photo: {
          id: photo.id,
          url: photo.cloudinary_url,
          submitted_at: photo.submitted_at,
        },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[POST /admin/outlets/:id/photo]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/photos/pending
// REQ-054, REQ-055 | Returns all pending rider-submitted photos with count
// Includes current approved photo alongside each submission for side-by-side review
// ─────────────────────────────────────────────
photos.get('/admin/photos/pending', requireManager, async (req, res) => {
  try {
    // Fetch all pending submissions with outlet context and the current approved photo
    const result = await pool.query(
      `SELECT
         p.id                        AS pending_id,
         p.outlet_id,
         p.cloudinary_url            AS pending_url,
         p.submitted_at,
         p.submitted_by_rider_id,
         r.full_name                 AS rider_name,
         o.outlet_name,
         o.outlet_barangay,
         -- Subquery: pull the current approved photo for this outlet
         (
           SELECT cp.cloudinary_url
           FROM outlet_photos cp
           WHERE cp.outlet_id = p.outlet_id
             AND cp.is_current = TRUE
             AND cp.status = 'approved'
           LIMIT 1
         )                           AS current_photo_url
       FROM outlet_photos p
       JOIN outlets_main o  ON o.id = p.outlet_id
       LEFT JOIN riders r ON r.id = p.submitted_by_rider_id
       WHERE p.status = 'pending'
       ORDER BY p.submitted_at ASC`   // oldest first — clear the backlog in order
    );

    return res.status(200).json({
      count: result.rows.length,
      pending: result.rows.map((row) => ({
        id: row.pending_id,
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        outlet_barangay: row.outlet_barangay,
        pending_url: row.pending_url,
        current_photo_url: row.current_photo_url ?? null,
        submitted_at: row.submitted_at,
        submitted_by: {
          rider_id: row.submitted_by_rider_id,
          rider_name: row.rider_name,
        },
      })),
    });
  } catch (err) {
    console.error('[GET /admin/photos/pending]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/v1/admin/photos/:id/review
// REQ-056, REQ-057, REQ-058 | Manager approves or rejects a pending photo
// On approval: pending photo becomes current, previous current is demoted
// On rejection: photo stays in DB for audit (REQ-057), rejection_reason stored
// ─────────────────────────────────────────────
photos.patch('/admin/photos/:id/review', requireManager, async (req, res) => {
  const photoId = req.params.id; // UUID

  const { decision, rejection_reason } = req.body;

  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({
      error: "decision is required and must be 'approved' or 'rejected'",
    });
  }

  if (decision === 'rejected' && rejection_reason && rejection_reason.length > 500) {
    return res.status(400).json({ error: 'rejection_reason must be under 500 characters' });
  }

  try {
    // Fetch the pending photo record
    const photoResult = await pool.query(
      `SELECT id, outlet_id, status FROM outlet_photos WHERE id = $1`,
      [photoId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const photo = photoResult.rows[0];

    if (photo.status !== 'pending') {
      return res.status(409).json({ error: 'Photo has already been reviewed' });
    }

    if (decision === 'rejected') {
      // Simple update — photo stays in DB per REQ-057, just marked rejected
      await pool.query(
        `UPDATE outlet_photos
         SET status           = 'rejected',
             reviewed_at      = NOW(),
             reviewed_by      = $1,
             rejection_reason = $2
         WHERE id = $3`,
        [req.manager.name, rejection_reason ?? null, photoId]
      );

      return res.status(200).json({ result: 'rejected' });
    }

    // decision === 'approved'
    // Promote atomically: demote current → approve + set is_current on new photo
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Demote whichever photo is currently live for this outlet
      await client.query(
        `UPDATE outlet_photos
         SET is_current = FALSE
         WHERE outlet_id = $1 AND is_current = TRUE`,
        [photo.outlet_id]
      );

      // Approve and promote the submitted photo
      await client.query(
        `UPDATE outlet_photos
         SET status      = 'approved',
             is_current  = TRUE,
             reviewed_at = NOW(),
             reviewed_by = $1
         WHERE id = $2`,
        [req.manager.name, photoId]
      );

      await client.query('COMMIT');

      return res.status(200).json({ result: 'approved' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[PATCH /admin/photos/:id/review]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = photos;