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
  const [selected, setSelected]     = useState(null)   // rider detail panel
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [search, setSearch]         = useState('')
  const [setupCode, setSetupCode]   = useState(null)   // shown after create

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
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/riders/${id}`, { headers })
      setSelected(res.data)
    } catch {
      setError('Failed to load rider details.')
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

  async function submitCreate() {
    setSaving(true)
    setSaveError('')
    try {
      const res = await axios.post(`${API_URL}/api/v1/admin/riders`, createForm, { headers })
      setSetupCode(res.data.setup_code)
      setCreateForm(EMPTY_FORM)
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <Sidebar activePage="riders" />   {/* use "routes" in RoutesView.js */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box' }}>
        {/* everything that was inside s.page goes here */}
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
            onClick={() => { setShowCreate(true); setSaveError(''); setSetupCode(null) }}>
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
          {filtered.map(rider => (
            <div
              key={rider.id}
              style={{
                ...s.riderCard,
                ...(selected?.id === rider.id ? s.riderCardActive : {}),
              }}
              onClick={() => fetchRiderDetail(rider.id)}
            >
              <div style={s.riderAvatar}>
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
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={s.detailPane}>
            <div style={s.detailHeader}>
              <div style={s.detailAvatar}>
                {selected.full_name?.charAt(0).toUpperCase()}
              </div>
              <div style={s.detailTitleBlock}>
                <h2 style={s.detailName}>{selected.full_name}</h2>
                <StatusBadge status={selected.status} />
              </div>
              <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
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

        {!selected && !loading && (
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
              // Setup code screen shown after successful creation
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
                    <Field label="Photo URL">
                      <input style={s.input} value={createForm.photo_url}
                        onChange={e => setCreateForm(f => ({ ...f, photo_url: e.target.value }))} />
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
  </div>)
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
  page:         { display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 28px', boxSizing: 'border-box', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' },
  pageTitle:    { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle: { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  toolbar:      { display: 'flex', gap: '10px', alignItems: 'center' },
  searchInput:  { width: '240px', padding: '9px 14px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827' },
  createBtn:    { padding: '9px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  errorBanner:  { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '16px' },

  content:      { display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' },

  listPane:     { width: '360px', flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  riderCard:    { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.1s' },
  riderCardActive: { borderColor: '#f97316', background: '#fff7ed' },
  riderAvatar:  { width: '40px', height: '40px', borderRadius: '50%', background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0 },
  riderInfo:    { flex: 1, minWidth: 0 },
  riderName:    { fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  riderMeta:    { fontSize: '12px', color: '#6b7280', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  riderRight:   { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 },
  riderStat:    { fontSize: '11px', color: '#9ca3af', margin: 0 },

  detailPane:   { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  detailEmpty:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  detailEmptyText: { fontSize: '14px', color: '#9ca3af' },
  detailHeader: { display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  detailAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', flexShrink: 0 },
  detailTitleBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' },
  detailName:   { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  closeBtn:     { background: 'none', border: 'none', fontSize: '18px', color: '#9ca3af', cursor: 'pointer', padding: 0, flexShrink: 0 },
  detailBody:   { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  detailFooter: { padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '10px' },

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
}
