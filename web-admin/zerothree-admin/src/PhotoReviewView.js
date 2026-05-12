import { useState, useEffect } from 'react'
import axios from 'axios'
import Sidebar from './Sidebar'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'

export default function PhotoReviewView() {
  const [photos, setPhotos]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [selected, setSelected]   = useState(null)
  const [decision, setDecision]   = useState(null)
  const [reason, setReason]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast, setToast]         = useState(null)

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => { fetchPending() }, [])

  async function fetchPending() {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/photos/pending`, { headers })
      setPhotos(res.data.pending)
    } catch {
      setError('Failed to load pending photos.')
    } finally {
      setLoading(false)
    }
  }

  function openReview(photo) {
    setSelected(photo)
    setDecision(null)
    setReason('')
    setSaveError('')
  }

  function closeReview() {
    setSelected(null)
    setDecision(null)
    setReason('')
    setSaveError('')
  }

  async function submitReview() {
    if (!decision) { setSaveError('Select approve or reject first.'); return }
    if (decision === 'rejected' && !reason.trim()) {
      setSaveError('Please provide a rejection reason.')
      return
    }

    setSaving(true)
    setSaveError('')
    try {
      await axios.patch(
        `${API_URL}/api/v1/admin/photos/${selected.id}/review`,
        { decision, rejection_reason: reason || null },
        { headers }
      )
      const msg = decision === 'approved'
        ? `Photo approved for ${selected.outlet_name}`
        : `Photo rejected for ${selected.outlet_name}`
      showToast(msg, decision)
      closeReview()
      fetchPending()
    } catch {
      setSaveError('Failed to submit review.')
    } finally {
      setSaving(false)
    }
  }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div style={s.page}>
      <Sidebar activePage="photos" />

      <div style={s.content}>
        <div style={s.header}>
          <div>
            <h1 style={s.pageTitle}>Photo Review Queue</h1>
            <p style={s.pageSubtitle}>
              {loading ? 'Loading…' : `${photos.length} pending submission${photos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {error && <div style={s.errorBanner}>{error}</div>}

        {!loading && photos.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>✓</div>
            <p style={s.emptyTitle}>All caught up</p>
            <p style={s.emptySub}>No pending photo submissions to review.</p>
          </div>
        )}

        {!loading && photos.length > 0 && (
          <div style={s.grid}>
            {photos.map(photo => (
              <div key={photo.id} style={s.card}>
                <div style={s.photoRow}>
                  <div style={s.photoCol}>
                    <p style={s.photoLabel}>Current photo</p>
                    {photo.current_photo_url ? (
                      <img src={photo.current_photo_url} alt="Current" style={s.photo} />
                    ) : (
                      <div style={s.noPhoto}>
                        <span style={s.noPhotoIcon}>📷</span>
                        <span style={s.noPhotoText}>No current photo</span>
                      </div>
                    )}
                  </div>
                  <div style={s.photoDivider} />
                  <div style={s.photoCol}>
                    <p style={s.photoLabelNew}>Submitted photo</p>
                    <img src={photo.pending_url} alt="Submitted" style={s.photo} />
                  </div>
                </div>
                <div style={s.cardBody}>
                  <div style={s.cardInfo}>
                    <p style={s.outletName}>{photo.outlet_name}</p>
                    <p style={s.outletMeta}>{photo.outlet_barangay ?? '—'}</p>
                    <p style={s.submittedBy}>
                      Submitted by <strong>{photo.submitted_by?.rider_name ?? 'Unknown'}</strong>
                      {' · '}
                      {fmtDate(photo.submitted_at)}
                    </p>
                  </div>
                  <button style={s.reviewBtn} onClick={() => openReview(photo)}>
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <div>
                <h2 style={s.modalTitle}>Review photo</h2>
                <p style={s.modalSub}>{selected.outlet_name} · {selected.outlet_barangay ?? '—'}</p>
              </div>
              <button style={s.closeBtn} onClick={closeReview}>✕</button>
            </div>

            <div style={s.modalBody}>
              <div style={s.modalPhotoRow}>
                <div style={s.modalPhotoCol}>
                  <p style={s.photoLabel}>Current photo</p>
                  {selected.current_photo_url ? (
                    <img src={selected.current_photo_url} alt="Current" style={s.modalPhoto} />
                  ) : (
                    <div style={{ ...s.noPhoto, height: '220px', borderRadius: '8px' }}>
                      <span style={s.noPhotoIcon}>📷</span>
                      <span style={s.noPhotoText}>No current photo</span>
                    </div>
                  )}
                </div>
                <div style={s.modalPhotoCol}>
                  <p style={s.photoLabelNew}>Submitted photo</p>
                  <img src={selected.pending_url} alt="Submitted" style={s.modalPhoto} />
                </div>
              </div>

              <p style={s.submittedBy}>
                Submitted by <strong>{selected.submitted_by?.rider_name ?? 'Unknown rider'}</strong>
                {' on '}
                {fmtDate(selected.submitted_at)}
              </p>

              <div style={s.decisionRow}>
                <button
                  style={{ ...s.approveBtn, ...(decision === 'approved' ? s.approveBtnActive : {}) }}
                  onClick={() => setDecision('approved')}
                >
                  ✓ Approve
                </button>
                <button
                  style={{ ...s.rejectBtn, ...(decision === 'rejected' ? s.rejectBtnActive : {}) }}
                  onClick={() => setDecision('rejected')}
                >
                  ✕ Reject
                </button>
              </div>

              {decision === 'rejected' && (
                <div style={s.reasonBlock}>
                  <label style={s.reasonLabel}>Rejection reason *</label>
                  <textarea
                    style={s.reasonInput}
                    placeholder="e.g. Wrong outlet, blurry photo, not the storefront…"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              {saveError && <p style={s.inlineError}>{saveError}</p>}
            </div>

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={closeReview}>Cancel</button>
              <button
                style={{
                  ...s.submitBtn,
                  opacity: saving || !decision ? 0.5 : 1,
                  cursor: saving || !decision ? 'not-allowed' : 'pointer',
                }}
                disabled={saving || !decision}
                onClick={submitReview}
              >
                {saving
                  ? 'Submitting…'
                  : decision === 'approved'
                    ? 'Confirm approval'
                    : decision === 'rejected'
                      ? 'Confirm rejection'
                      : 'Select a decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          ...s.toast,
          background: toast.type === 'approved' ? '#dcfce7' : '#fee2e2',
          borderColor: toast.type === 'approved' ? '#bbf7d0' : '#fecaca',
          color: toast.type === 'approved' ? '#15803d' : '#b91c1c',
        }}>
          {toast.type === 'approved' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  )
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const s = {
  page:           { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#f9fafb' },
  content:        { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box', overflow: 'hidden' },
  header:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' },
  pageTitle:      { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle:   { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  errorBanner:    { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '16px' },

  emptyState:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  emptyIcon:      { width: '52px', height: '52px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700' },
  emptyTitle:     { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  emptySub:       { fontSize: '13px', color: '#6b7280', margin: 0 },

  grid:           { flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '16px', alignContent: 'start' },
  card:           { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' },
  photoRow:       { display: 'flex', height: '200px' },
  photoCol:       { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  photoDivider:   { width: '1px', background: '#e5e7eb', flexShrink: 0 },
  photoLabel:     { fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', margin: 0 },
  photoLabelNew:  { fontSize: '10px', fontWeight: '700', color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', margin: 0 },
  photo:          { flex: 1, width: '100%', objectFit: 'cover', display: 'block' },
  noPhoto:        { flex: 1, background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' },
  noPhotoIcon:    { fontSize: '20px', opacity: 0.4 },
  noPhotoText:    { fontSize: '11px', color: '#9ca3af' },

  cardBody:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: '12px' },
  cardInfo:       { flex: 1, minWidth: 0 },
  outletName:     { fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  outletMeta:     { fontSize: '12px', color: '#6b7280', margin: '2px 0' },
  submittedBy:    { fontSize: '12px', color: '#6b7280', margin: 0 },
  reviewBtn:      { padding: '7px 16px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 },

  modalOverlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:          { background: '#fff', borderRadius: '14px', width: '780px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  modalTitle:     { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  modalSub:       { fontSize: '13px', color: '#6b7280', margin: '2px 0 0' },
  closeBtn:       { background: 'none', border: 'none', fontSize: '18px', color: '#9ca3af', cursor: 'pointer', padding: 0 },
  modalBody:      { padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' },
  modalFooter:    { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid #f3f4f6' },

  modalPhotoRow:  { display: 'flex', gap: '12px', height: '220px' },
  modalPhotoCol:  { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' },
  modalPhoto:     { flex: 1, width: '100%', objectFit: 'cover', borderRadius: '8px', display: 'block' },

  decisionRow:    { display: 'flex', gap: '10px' },
  approveBtn:     { flex: 1, padding: '10px', fontSize: '14px', fontWeight: '600', border: '2px solid #e5e7eb', borderRadius: '8px', background: '#fff', color: '#374151', cursor: 'pointer' },
  approveBtnActive:{ background: '#dcfce7', borderColor: '#86efac', color: '#15803d' },
  rejectBtn:      { flex: 1, padding: '10px', fontSize: '14px', fontWeight: '600', border: '2px solid #e5e7eb', borderRadius: '8px', background: '#fff', color: '#374151', cursor: 'pointer' },
  rejectBtnActive:{ background: '#fee2e2', borderColor: '#fca5a5', color: '#b91c1c' },

  reasonBlock:    { display: 'flex', flexDirection: 'column', gap: '6px' },
  reasonLabel:    { fontSize: '12px', fontWeight: '600', color: '#374151' },
  reasonInput:    { padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#111827', resize: 'vertical', fontFamily: 'inherit' },

  inlineError:    { fontSize: '12px', color: '#b91c1c', margin: 0 },
  cancelBtn:      { padding: '9px 18px', fontSize: '13px', fontWeight: '600', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', color: '#6b7280' },
  submitBtn:      { padding: '9px 18px', fontSize: '13px', fontWeight: '600', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px' },

  toast:          { position: 'fixed', bottom: '24px', right: '24px', zIndex: 3000, padding: '12px 20px', borderRadius: '10px', border: '1px solid', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
}
