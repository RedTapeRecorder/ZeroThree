import { useState, useEffect } from 'react'
import axios from 'axios'
import Sidebar from './Sidebar'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'

const EMPTY_FORM = {
  full_name: '', phone_number: '', photo_url: '',
  emergency_contact_name: '', emergency_contact_number: '',
  assigned_areas: '',
}

export default function RidersView() {
  const [riders, setRiders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [selected, setSelected]     = useState(null)
  const [pendingId, setPendingId]   = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [search, setSearch]         = useState('')
  const [setupCode, setSetupCode]   = useState(null)

  // ── Profile photo management states ──
  const [photoBase64, setPhotoBase64] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [updatingPhoto, setUpdatingPhoto] = useState(false)

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => { fetchRiders() }, [])

  async function fetchRiders() {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/riders`, { headers })
      setRiders(res.data)
    } catch {
      setError('Failed to load riders.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchRiderDetail(id) {
    setPendingId(id)
    setSelected(null)
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/riders/${id}`, { headers })
      setSelected(res.data)
    } catch {
      setError('Failed to load rider details.')
      setPendingId(null)
    }
  }

  async function lockRider(id) {
    try {
      await axios.patch(`${API_URL}/api/v1/admin/riders/${id}/lock`, {}, { headers })
      fetchRiders()
      if (selected?.id === id) fetchRiderDetail(id)
    } catch {
      setError('Failed to lock rider.')
    }
  }

  async function activateRider(id) {
    try {
      await axios.patch(`${API_URL}/api/v1/admin/riders/${id}/activate`, {}, { headers })
      fetchRiders()
      if (selected?.id === id) fetchRiderDetail(id)
    } catch {
      setError('Failed to activate rider.')
    }
  }

  // ── Handle file inputs and transform to base64 ──
  function handleFileChange(e, isEditMode = false) {
    const file = e.target.files[0]
    if (!file) return

    if (!isEditMode) {
      setPhotoPreview(URL.createObjectURL(file))
    }

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onloadend = () => {
      if (isEditMode) {
        // Trigger instant patch invocation when editing an existing profile
        submitPhotoUpdate(selected.id, reader.result)
      } else {
        setPhotoBase64(reader.result)
      }
    }
  }

  // ── Direct 1-to-1 Profile Photo Patch Request ──
  async function submitPhotoUpdate(id, base64Data) {
    setUpdatingPhoto(true)
    setError('')
    try {
      const res = await axios.patch(
        `${API_URL}/api/v1/admin/riders/${id}/photo`, 
        { photo_base64: base64Data }, 
        { headers }
      )
      // Refresh the specific active detail view context
      setSelected(prev => ({ ...prev, photo_url: res.data.rider.photo_url }))
      fetchRiders()
    } catch {
      setError('Failed to rewrite profile photo.')
    } finally {
      setUpdatingPhoto(false)
    }
  }

  async function submitCreate() {
    setSaving(true)
    setSaveError('')
    
    const payload = {
      ...createForm,
      photo_base64: photoBase64
    }

    try {
      const res = await axios.post(`${API_URL}/api/v1/admin/riders`, payload, { headers })
      setSetupCode(res.data.setup_code)
      setCreateForm(EMPTY_FORM)
      setPhotoBase64('')
      setPhotoPreview('')
      fetchRiders()
    } catch {
      setSaveError('Could not create rider. Check required fields.')
    } finally {
      setSaving(false)
    }
  }

  const filtered = riders.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.phone_number?.toLowerCase().includes(q) ||
      r.assigned_areas?.toLowerCase().includes(q)
    )
  })

  const activeId = selected?.id ?? pendingId

  return (
    <div style={s.page}>
      <Sidebar activePage="riders" />
      <div style={s.inner}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <h1 style={s.pageTitle}>Riders</h1>
            <p style={s.pageSubtitle}>{riders.length} rider accounts</p>
          </div>
          <div style={s.toolbar}>
            <input
              style={s.searchInput}
              placeholder="Search name, phone, area…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button style={s.createBtn}
              onClick={() => { 
                setShowCreate(true); 
                setSaveError(''); 
                setSetupCode(null);
                setPhotoBase64('');
                setPhotoPreview('');
              }}>
              + New rider
            </button>
          </div>
        </div>

        {error && <div style={s.errorBanner}>{error}</div>}

        {/* ── Content ── */}
        <div style={s.content}>

          {/* Rider list */}
          <div style={s.listPane}>
            {loading && <div style={s.emptyState}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={s.emptyState}>No riders found.</div>
            )}
            {filtered.map(rider => {
              const isActive = activeId === rider.id

              return (
                <div
                  key={rider.id}
                  style={{
                    ...s.riderCard,
                    borderColor: isActive ? '#f97316' : '#e5e7eb',
                    background:  isActive ? '#fff7ed' : '#ffffff',
                  }}
                  onClick={() => fetchRiderDetail(rider.id)}
                >
                  {rider.photo_url ? (
                    <img
                      src={rider.photo_url}
                      alt={rider.full_name}
                      style={s.riderAvatarImg}
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                    />
                  ) : null}
                  <div style={{
                    ...s.riderAvatar,
                    display: rider.photo_url ? 'none' : 'flex',
                  }}>
                    {rider.full_name?.charAt(0).toUpperCase()}
                  </div>

                  <div style={s.riderInfo}>
                    <p style={s.riderName}>{rider.full_name}</p>
                    <p style={s.riderMeta}>{rider.phone_number}</p>
                    <p style={s.riderMeta}>{rider.assigned_areas ?? 'No areas assigned'}</p>
                  </div>
                  <div style={s.riderRight}>
                    <StatusBadge status={rider.status} />
                    <p style={s.riderStat}>{rider.total_visits ?? 0} visits</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={s.detailPane}>
              <div style={s.detailHeader}>
                {selected.photo_url ? (
                  <img
                    src={selected.photo_url}
                    alt={selected.full_name}
                    style={s.detailAvatarImg}
                    onError={e => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div style={{
                  ...s.detailAvatar,
                  display: selected.photo_url ? 'none' : 'flex',
                }}>
                  {selected.full_name?.charAt(0).toUpperCase()}
                </div>

                <div style={s.detailTitleBlock}>
                  <h2 style={s.detailName}>{selected.full_name}</h2>
                  <StatusBadge status={selected.status} />
                </div>
                <button style={s.closeBtn} onClick={() => {
                  setSelected(null)
                  setPendingId(null)
                }}>✕</button>
              </div>

              <div style={s.detailBody}>
                <Section label="Account">
                  <DRow label="Rider ID">#{selected.id}</DRow>
                  <DRow label="Status"><StatusBadge status={selected.status} /></DRow>
                  <DRow label="Date hired">{selected.date_hired ?? '—'}</DRow>
                  <DRow label="Created">{fmt(selected.created_at)}</DRow>
                  <DRow label="Last active">{selected.last_active_at ? fmt(selected.last_active_at) : 'Never'}</DRow>
                </Section>

                <Section label="Statistics">
                  <DRow label="Total visits">{selected.total_visits ?? 0}</DRow>
                  <DRow label="Days active">{selected.days_active ?? 0}</DRow>
                </Section>

                <Section label="Contact">
                  <DRow label="Phone">{selected.phone_number ?? '—'}</DRow>
                  <DRow label="Emergency contact">{selected.emergency_contact_name ?? '—'}</DRow>
                  <DRow label="Emergency phone">{selected.emergency_contact_number ?? '—'}</DRow>
                </Section>

                <Section label="Assignment">
                  <DRow label="Assigned areas">{selected.assigned_areas ?? '—'}</DRow>
                </Section>
              </div>

              <div style={s.detailFooter}>
                <label style={s.editPhotoBtn}>
                  {updatingPhoto ? 'Uploading…' : '📷 Update Photo'}
                  <input 
                    type="file" 
                    accept="image/*" 
                    disabled={updatingPhoto} 
                    style={{ display: 'none' }} 
                    onChange={(e) => handleFileChange(e, true)} 
                  />
                </label>

                {selected.status === 'active' ? (
                  <button style={s.lockBtn} onClick={() => lockRider(selected.id)}>
                    🔒 Lock account
                  </button>
                ) : (
                  <button style={s.activateBtn} onClick={() => activateRider(selected.id)}>
                    ✓ Activate account
                  </button>
                )}
              </div>
            </div>
          )}

          {!selected && pendingId && (
            <div style={s.detailEmpty}>
              <p style={s.detailEmptyText}>Loading rider…</p>
            </div>
          )}

          {!selected && !pendingId && !loading && (
            <div style={s.detailEmpty}>
              <p style={s.detailEmptyText}>Select a rider to view details</p>
            </div>
          )}
        </div>

        {/* ── Create modal ── */}
        {showCreate && (
          <div style={s.modalOverlay}>
            <div style={s.modal}>
              <div style={s.modalHeader}>
                <h2 style={s.modalTitle}>New rider</h2>
                <button style={s.closeBtn} onClick={() => { setShowCreate(false); setSetupCode(null) }}>✕</button>
              </div>

              {setupCode ? (
                <div style={s.setupCodeScreen}>
                  <div style={s.setupCodeIcon}>✓</div>
                  <p style={s.setupCodeTitle}>Rider account created</p>
                  <p style={s.setupCodeSub}>Give this one-time setup code to the rider. It will not be shown again.</p>
                  <div style={s.setupCodeBox}>{setupCode}</div>
                  <button style={s.createBtn} onClick={() => { setShowCreate(false); setSetupCode(null) }}>
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div style={s.modalBody}>
                    <div style={s.formGrid}>
                      <Field label="Full name *">
                        <input style={s.input} value={createForm.full_name}
                          onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} />
                      </Field>
                      <Field label="Phone number *">
                        <input style={s.input} value={createForm.phone_number}
                          onChange={e => setCreateForm(f => ({ ...f, phone_number: e.target.value }))} />
                      </Field>
                      <Field label="Emergency contact name">
                        <input style={s.input} value={createForm.emergency_contact_name}
                          onChange={e => setCreateForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />
                      </Field>
                      <Field label="Emergency contact number">
                        <input style={s.input} value={createForm.emergency_contact_number}
                          onChange={e => setCreateForm(f => ({ ...f, emergency_contact_number: e.target.value }))} />
                      </Field>
                      <Field label="Assigned areas">
                        <input style={s.input} placeholder="e.g. San Juan, Mandaluyong"
                          value={createForm.assigned_areas}
                          onChange={e => setCreateForm(f => ({ ...f, assigned_areas: e.target.value }))} />
                      </Field>

                      <Field label="Profile Picture">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                          <label style={s.fileUploadBtn}>
                            Choose Image
                            <input 
                              type="file" 
                              accept="image/*" 
                              style={{ display: 'none' }} 
                              onChange={(e) => handleFileChange(e, false)} 
                            />
                          </label>
                          {photoPreview ? (
                            <img src={photoPreview} alt="Preview" style={s.uploadPreviewThumb} />
                          ) : (
                            <span style={{ fontSize: '12px', color: '#9ca3af' }}>No file chosen</span>
                          )}
                        </div>
                      </Field>
                    </div>
                    {saveError && <p style={s.inlineError}>{saveError}</p>}
                  </div>
                  <div style={s.modalFooter}>
                    <button style={s.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
                    <button style={s.createBtn} disabled={saving} onClick={submitCreate}>
                      {saving ? 'Creating…' : 'Create rider'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function Section({ label, children }) {
  return (
    <div style={s.section}>
      <p style={s.sectionLabel}>{label}</p>
      {children}
    </div>
  )
}

function DRow({ label, children }) {
  return (
    <div style={s.drow}>
      <span style={s.drowLabel}>{label}</span>
      <span style={s.drowValue}>{children}</span>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={s.fieldGroup}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

function StatusBadge({ status }) {
  const color = status === 'active'
    ? { bg: '#dcfce7', text: '#15803d' }
    : { bg: '#fee2e2', text: '#b91c1c' }
  return (
    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: color.bg, color: color.text }}>
      {status ?? '—'}
    </span>
  )
}

// ── Styles ───────────────────────────────────

const s = {
  page:         { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#f9fafb' },
  inner:        { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' },
  pageTitle:    { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle: { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  toolbar:      { display: 'flex', gap: '10px', alignItems: 'center' },
  searchInput:  { width: '240px', padding: '9px 14px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827' },
  createBtn:    { padding: '9px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  errorBanner:  { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '16px' },
  content:      { display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' },
  listPane:     { width: '360px', flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  riderCard:    { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', border: '1px solid', borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.1s', outline: 'none', userSelect: 'none' },
  riderAvatar:    { width: '40px', height: '40px', borderRadius: '50%', background: '#f97316', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0 },
  riderAvatarImg: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  riderInfo:    { flex: 1, minWidth: 0 },
  riderName:    { fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  riderMeta:    { fontSize: '12px', color: '#6b7280', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  riderRight:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 },
  riderStat:    { fontSize: '11px', color: '#9ca3af', margin: 0 },
  detailPane:   { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  detailEmpty:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  detailEmptyText: { fontSize: '14px', color: '#9ca3af' },
  detailHeader: { display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  detailAvatar:    { width: '56px', height: '56px', borderRadius: '50%', background: '#f97316', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700', flexShrink: 0 },
  detailAvatarImg: { width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #f3f4f6' },
  detailTitleBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' },
  detailName:   { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  closeBtn:     { background: 'none', border: 'none', fontSize: '18px', color: '#9ca3af', cursor: 'pointer', padding: 0, flexShrink: 0 },
  detailBody:   { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  detailFooter: { padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '10px', alignItems: 'center' },
  section:      { display: 'flex', flexDirection: 'column', gap: '10px' },
  sectionLabel: { fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  drow:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  drowLabel:    { color: '#6b7280' },
  drowValue:    { color: '#111827', fontWeight: '500', textAlign: 'right' },
  lockBtn:      { padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  activateBtn:  { padding: '8px 16px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  emptyState:   { padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:        { background: '#fff', borderRadius: '12px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  modalTitle:   { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  modalBody:    { padding: '20px 24px', overflowY: 'auto', flex: 1 },
  modalFooter:  { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid #f3f4f6' },
  cancelBtn:    { padding: '8px 16px', fontSize: '13px', fontWeight: '600', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', color: '#6b7280' },
  formGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  fieldGroup:   { display: 'flex', flexDirection: 'column', gap: '5px' },
  fieldLabel:   { fontSize: '12px', fontWeight: '600', color: '#374151' },
  input:        { padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#111827', width: '100%', boxSizing: 'border-box' },
  inlineError:  { fontSize: '12px', color: '#b91c1c', marginTop: '12px' },
  setupCodeScreen: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', gap: '12px' },
  setupCodeIcon:   { width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700' },
  setupCodeTitle:  { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  setupCodeSub:    { fontSize: '13px', color: '#6b7280', textAlign: 'center', margin: 0, maxWidth: '320px' },
  setupCodeBox:    { fontSize: '28px', fontWeight: '800', letterSpacing: '0.15em', color: '#f97316', background: '#fff7ed', border: '2px dashed #fed7aa', borderRadius: '10px', padding: '16px 32px' },

  fileUploadBtn:   { padding: '8px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', color: '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.1s' },
  uploadPreviewThumb: { width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e5e7eb' },
  
  // New layout configurations for the detailed profile editor button
  editPhotoBtn:    { padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', display: 'inline-block', marginRight: 'auto' }
}