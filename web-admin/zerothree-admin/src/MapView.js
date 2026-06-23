import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import axios from 'axios'
import Sidebar from './Sidebar'
import PhotoUploadModal from './PhotoUploadModal'
import { useLocation, useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'
const THUNDERFOREST_KEY = process.env.REACT_APP_THUNDERFOREST_KEY
const SAN_JUAN = [14.6007, 121.0355]

// ── Constants ────────────────────────────────


const STATUS_COLOR = {
  ACTIVE:   '#22c55e',
  INACTIVE: '#9ca3af',
  PULLOUT:  '#f97316',
}

const LOW_QUALITY = new Set(['cluster', 'mismatch', 'missing'])

const EMPTY_FORM = {
  outlet_name: '', outlet_formaladdress: '', outlet_status: 'ACTIVE',
  location_pin_quality: 'missing', location_verification_level: 'unverified',
  owner_name: '', owner_contact: '', outlet_barangay: '', outlet_district: '',
  outlet_city: '', outlet_area: '', outlet_concerningbranch: '',
  lat: '', lng: '',
}

const EMPTY_FILTERS = {
  status: '', pin_quality: '', verification_level: '', city: '', area: '',
}

// ── Pin style ────────────────────────────────────────

// ── Helpers ──────────────────────────────────
function Badge({ status }) {
  const color = {
    ACTIVE:   { bg: '#dcfce7', text: '#15803d' },
    INACTIVE: { bg: '#f3f4f6', text: '#6b7280' },
    PULLOUT:  { bg: '#ffedd5', text: '#c2410c' },
  }[status] ?? { bg: '#f3f4f6', text: '#6b7280' }
  return (
    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: color.bg, color: color.text }}>
      {status ?? '—'}
    </span>
  )
}

function qualityStyle(q) {
  return {
    fontWeight: 500,
    color: { precise: '#15803d', area: '#0369a1', cluster: '#b45309', mismatch: '#b91c1c', missing: '#9ca3af' }[q] ?? '#374151',
  }
}

function PRow({ label, children }) {
  return (
    <div style={s.prow}>
      <span style={s.prowLabel}>{label}</span>
      <span style={s.prowValue}>{children}</span>
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

// ────────────────────────────────────────────
export default function MapView() {
  // ── State ────────────────────────────────
  const [activeTab, setActiveTab]       = useState('map')   // 'map' | 'table'
  const [outlets, setOutlets]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [filters, setFilters]           = useState(EMPTY_FILTERS)
  const [counts, setCounts]             = useState({ ACTIVE: 0, INACTIVE: 0, PULLOUT: 0 })

  // Map panel
  const [selected, setSelected]         = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  // Table
  const [search, setSearch]             = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [createForm, setCreateForm]     = useState(EMPTY_FORM);
  const [showOutletModal, setShowOutletModal] = useState(false);
  const [outletModalMode, setOutletModalMode] = useState('view'); // 'view' or 'edit'
  const [modalOutlet, setModalOutlet]   = useState(null)
  const [modalOutletForm, setModalOutletForm] = useState({})
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState('')

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }
  
  //Picture
  const [uploadOutlet, setUploadOutlet] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()
  const highlightedId = location.state?.outletId ?? null
  
  // ── Pin style ────────────────────────────────────────
  const getPinStyle = (outlet) => {
    const base = STATUS_COLOR[outlet.outlet_status] ?? '#9ca3af'
    const lowQ = LOW_QUALITY.has(outlet.location_pin_quality)
    const isHighlighted = (highlightedId && String(outlet.id) === String(highlightedId)) || (selected && String(outlet.id) === String(selected.id))

    if (isHighlighted) {
      // Selected outlet: gold fill with black outline
      return {
        color: '#000000',        // black outline (stroke)
        fillColor: '#FFD700',    // gold fill
        fillOpacity: 1,
        opacity: 1,              // stroke opacity
        weight: 2,               // stroke width
        radius: lowQ ? 8 : 11,   // radius (approximately 50% larger than normal)
        stroke: true,
        fill: true
      }
    }

    // Non-selected outlet: use status-based styling
    return {
      color:       base,         // stroke color
      fillColor:   base,         // fill color
      fillOpacity: lowQ ? 0.25 : 0.85,
      opacity:     lowQ ? 0.4  : 1,   // stroke opacity
      weight:      1.5,
      radius:      lowQ ? 5 : 7
    }
}

  // ── Effects ──────────────────────────────
  useEffect(() => {
    fetchOutlets()
  }, [filters])

  // Handle incoming outlet ID from dashboard navigation
  useEffect(() => {
    if (location.state?.outletId) {
      // Check token
      if (!token) {
        navigate('/login', { replace: true })
        return
      }

      // Clear any previous error
      setError('')

      // Switch to map tab when navigating to view an outlet
      setActiveTab('map');

      // Fetch the specific outlet directly to ensure we can find it regardless of filters
      const fetchSpecificOutlet = async () => {
        try {
          const res = await axios.get(`${API_URL}/api/v1/admin/outlets/${location.state.outletId}`, { headers })
          const outlet = res.data
          if (outlet) {
            handlePinClick(outlet)
          }
        } catch (err) {
          // Check if it's a 401 error
          if (err.response && err.response.status === 401) {
            navigate('/login', { replace: true })
          } else {
            setError('Failed to load outlet details.')
            // Fallback to filtering approach if direct fetch fails
            const outlet = outlets.find(o => String(o.id) === String(location.state.outletId))
            if (outlet) {
              handlePinClick(outlet)
            }
          }
        }
      }

      fetchSpecificOutlet()
    }
  }, [location, outlets, navigate, token, setActiveTab])

  // ── Derived ──────────────────────────────
  const plottable = outlets.filter(o => o.latitude != null && o.longitude != null)

  const filtered = outlets.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      o.outlet_name?.toLowerCase().includes(q) ||
      o.outlet_formaladdress?.toLowerCase().includes(q) ||
      o.outlet_barangay?.toLowerCase().includes(q) ||
      o.owner_name?.toLowerCase().includes(q)
    )
  })
  // Sort outlets by ID ascending for table view
  const sortedFiltered = [...filtered].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))

  const hasFilters = Object.values(filters).some(v => v !== '')

  // ── Fetch ────────────────────────────────
  async function fetchOutlets(skipFilters = false) {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (!skipFilters) {
        if (filters.status)             params.status             = filters.status
        if (filters.pin_quality)        params.pin_quality        = filters.pin_quality
        if (filters.verification_level) params.verification_level = filters.verification_level
        if (filters.city)               params.city               = filters.city
        if (filters.area)               params.area               = filters.area
      }

      const res = await axios.get(`${API_URL}/api/v1/admin/outlets`, { headers, params })
      const data = res.data
      setOutlets(data)

      const c = { ACTIVE: 0, INACTIVE: 0, PULLOUT: 0 }
      data.forEach(o => { if (o.outlet_status in c) c[o.outlet_status]++ })
      setCounts(c)
    } catch {
      setError('Failed to load outlets.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchPhoto(outletId) {
    setSelectedPhoto(null)
    setPhotoLoading(true)
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/outlets/${outletId}/photo`, { headers })
      setSelectedPhoto(res.data.photo)
    } catch {
      setSelectedPhoto(null)
    } finally {
      setPhotoLoading(false)
    }
  }

  // ── Map handlers ─────────────────────────
  function handlePinClick(outlet) {
    setSelected(outlet)
    fetchPhoto(outlet.id)
  }

  function closePanel() {
    setSelected(null)
    setSelectedPhoto(null)
  }

  // ── Table handlers ───────────────────────
  async function submitCreate() {
    setSaving(true)
    setSaveError('')
    try {
      await axios.post(`${API_URL}/api/v1/admin/outlets`, createForm, { headers })
      setShowCreate(false)
      setCreateForm(EMPTY_FORM)
      fetchOutlets()
    } catch {
      setSaveError('Could not create outlet. Check required fields.')
    } finally {
      setSaving(false)
    }
  }

  // Modal outlet handlers
  async function saveModalOutlet() {
    setSaving(true)
    setSaveError('')
    try {
      if (outletModalMode === 'edit' && modalOutlet) {
        await axios.patch(`${API_URL}/api/v1/admin/outlets/${modalOutlet.id}`, modalOutletForm, { headers })
      } else {
        // For new outlets (though we're not using this for create)
        await axios.post(`${API_URL}/api/v1/admin/outlets`, modalOutletForm, { headers })
      }
      setShowOutletModal(false)
      fetchOutlets()
    } catch {
      setSaveError('Save failed. Check your inputs.')
    } finally {
      setSaving(false)
    }
  }

  // ────────────────────────────────────────
  return (
    <div style={s.page}>
      <Sidebar activePage="map" />

      {/* ── Secondary sidebar (filters) ── */}
      <aside style={s.filterSidebar}>

        {/* Tab switcher */}
        <div style={s.tabs}>
          <button
            style={{ ...s.tab, ...(activeTab === 'map'   ? s.tabActive : {}) }}
            onClick={() => setActiveTab('map')}>
            🗺 Outlet Map
          </button>
          <button
            style={{ ...s.tab, ...(activeTab === 'table' ? s.tabActive : {}) }}
            onClick={() => setActiveTab('table')}>
            ☰ Outlet Table
          </button>
        </div>

        {/* Summary counts */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Summary</p>
          {[['ACTIVE','Active'],['INACTIVE','Inactive'],['PULLOUT','Pullout']].map(([key, label]) => (
            <div key={key} style={s.countRow}>
              <span style={{ ...s.dot, background: STATUS_COLOR[key] }} />
              <span style={s.countLabel}>{label}</span>
              <span style={s.countVal}>{counts[key]}</span>
            </div>
          ))}
          <div style={s.countRow}>
            <span style={{ ...s.dot, background: '#cbd5e1' }} />
            <span style={s.countLabel}>No coords</span>
            <span style={s.countVal}>{outlets.length - plottable.length}</span>
          </div>
        </div>

        <div style={s.divider} />

        {/* Filters */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Filters</p>

          <select style={s.select} value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="PULLOUT">Pullout</option>
          </select>

          <select style={s.select} value={filters.pin_quality}
            onChange={e => setFilters(f => ({ ...f, pin_quality: e.target.value }))}>
            <option value="">All pin quality</option>
            <option value="precise">Precise</option>
            <option value="area">Area</option>
            <option value="cluster">Cluster</option>
            <option value="mismatch">Mismatch</option>
            <option value="missing">Missing</option>
          </select>

          <select style={s.select} value={filters.verification_level}
            onChange={e => setFilters(f => ({ ...f, verification_level: e.target.value }))}>
            <option value="">All verification</option>
            <option value="auditor">Auditor</option>
            <option value="rider">Rider</option>
            <option value="staff">Staff</option>
            <option value="unverified">Unverified</option>
          </select>

          <select style={s.select} value={filters.city}
            onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}>
            <option value="">All cities</option>
            <option value="San Juan City">San Juan City</option>
            <option value="Mandaluyong">Mandaluyong</option>
            <option value="Quezon City">Quezon City</option>
            <option value="Manila">Manila</option>
          </select>

          <select style={s.select} value={filters.area}
            onChange={e => setFilters(f => ({ ...f, area: e.target.value }))}>
            <option value="">All areas</option>
            <option value="Tondo">Tondo</option>
            <option value="Sta. Mesa">Sta. Mesa</option>
            <option value="Pandacan">Pandacan</option>
            <option value="Sampaloc">Sampaloc</option>
          </select>

          {hasFilters && (
            <button style={s.clearBtn} onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear all filters
            </button>
          )}
        </div>

        {/* Map legend — only on map tab */}
        {activeTab === 'map' && (
          <>
            <div style={s.divider} />
            <div style={s.section}>
              <p style={s.sectionLabel}>Pin legend</p>
              <div style={s.countRow}>
                <span style={{ ...s.dot, background: '#22c55e' }} />
                <span style={s.countLabel}>High confidence</span>
              </div>
              <div style={s.countRow}>
                <span style={{ ...s.dot, background: '#22c55e', opacity: 0.3 }} />
                <span style={s.countLabel}>Low confidence</span>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* ── Main content ── */}
      <main style={s.main}>
        {loading && <div style={s.loadingBanner}>Loading outlets…</div>}
        {error   && <div style={s.errorBanner}>{error}</div>}

        {/* ══════════════════════════════════
            OUTLET MAP VIEW
        ══════════════════════════════════ */}
        {activeTab === 'map' && (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <MapContainer center={SAN_JUAN} zoom={14} style={{ width: '100%', height: '100%' }}>
              <TileLayer
                url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
                attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
              />
              {plottable.map(outlet => (
                <CircleMarker
                  key={outlet.id}
                  center={[outlet.latitude, outlet.longitude]}
                  {...getPinStyle(outlet)}
                  eventHandlers={{ click: () => handlePinClick(outlet) }}
                />
              ))}
            </MapContainer>

            {/* Outlet panel */}
            {selected && (
              <div style={s.panel}>
                <div style={s.panelHeader}>
                  <div style={{ flex: 1 }}>
                    <p style={s.panelName}>{selected.outlet_name}</p>
                    <p style={s.panelAddr}>{selected.outlet_formaladdress}</p>
                  </div>
                  <button style={s.closeBtn} onClick={closePanel}>✕</button>
                </div>

                {/* Photo */}
                <div style={s.photoSection}>
                  {photoLoading && (
                    <div style={s.photoPlaceholder}>
                      <span style={s.photoPlaceholderText}>Loading photo…</span>
                    </div>
                  )}
                  {!photoLoading && selectedPhoto && (
                    <img src={selectedPhoto.url} alt={selected.outlet_name} style={s.photo} />
                  )}
                  {!photoLoading && !selectedPhoto && (
                    <div style={s.photoPlaceholder}>
                      <span style={s.photoPlaceholderIcon}>📷</span>
                      <span style={s.photoPlaceholderText}>No photo available</span>
                    </div>
                  )}
                </div>

                <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6' }}>
                  <button
                    style={{ width: '100%', padding: '7px', fontSize: '12px', fontWeight: '600', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '7px', cursor: 'pointer', color: '#c2410c' }}
                    onClick={() => setUploadOutlet(selected)}
                  >
                    📷 Upload new photo
                  </button>
                </div>

                <div style={s.panelBody}>
                  <PRow label="Status"><Badge status={selected.outlet_status} /></PRow>
                  <PRow label="Owner">{selected.owner_name ?? '—'}</PRow>
                  <PRow label="Barangay">{selected.outlet_barangay ?? '—'}</PRow>
                  <PRow label="City">{selected.outlet_city ?? '—'}</PRow>
                  <PRow label="Area">{selected.outlet_area ?? '—'}</PRow>
                  <PRow label="Pin quality">
                    <span style={qualityStyle(selected.location_pin_quality)}>
                      {selected.location_pin_quality ?? '—'}
                    </span>
                  </PRow>
                  <PRow label="Verification">{selected.location_verification_level ?? '—'}</PRow>
                  <PRow label="Coordinates">
                    {selected.latitude != null
                      ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                      : '—'}
                  </PRow>
                  {selected.outlet_last_visit_time && (
                    <PRow label="Last visit">
                      {new Date(selected.outlet_last_visit_time).toLocaleDateString('en-PH', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </PRow>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════
            OUTLET TABLE VIEW
        ══════════════════════════════════ */}
        {activeTab === 'table' && (
          <div style={s.tableContainer}>
            <div style={s.tableHeader}>
              <div>
                <h1 style={s.pageTitle}>Outlet Table View</h1>
                <p style={s.pageSubtitle}>{sortedFiltered.length} of {outlets.length} outlets</p>
              </div>
              <div style={s.toolbar}>
                <input
                  style={s.searchInput}
                  placeholder="Search name, address, barangay, owner…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <button style={s.createBtn}
                  onClick={() => { setShowCreate(true); setSaveError('') }}>
                  + New outlet
                </button>
              </div>
            </div>

            <div style={s.tableWrapper}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['ID','Name','Address','Barangay','City','Area','Status','Pin Quality','Verification','Owner','Actions'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedFiltered.map(outlet => (
                    <tr key={outlet.id} style={s.tr}>
                      {/* Read row with clickable outlet name */}
                      <>
                        <td style={s.td}>{outlet.id}</td>
                        <td style={{ ...s.td, fontWeight: 500, cursor: 'pointer' }}
                            onClick={() => {
                              setActiveTab('map');
                              setSelected(outlet);
                              fetchPhoto(outlet.id);
                            }}>
                            {outlet.outlet_name}
                          </td>
                          <td style={s.td}>{outlet.outlet_formaladdress ?? '—'}</td>
                          <td style={s.td}>{outlet.outlet_barangay ?? '—'}</td>
                          <td style={s.td}>{outlet.outlet_city ?? '—'}</td>
                          <td style={s.td}>{outlet.outlet_area ?? '—'}</td>
                          <td style={s.td}><Badge status={outlet.outlet_status} /></td>
                          <td style={s.td}><span style={qualityStyle(outlet.location_pin_quality)}>{outlet.location_pin_quality ?? '—'}</span></td>
                          <td style={s.td}>{outlet.location_verification_level ?? '—'}</td>
                          <td style={s.td}>{outlet.owner_name ?? '—'}</td>
                          <td style={s.td}>
                            <div style={{ display: 'flex', gap: '6px', flexDirection: 'row' }}>
                              <button style={s.editBtn}
                                      onClick={() => {
                                        setModalOutlet(outlet);
                                        setModalOutletForm({
                                          outlet_name: outlet.outlet_name ?? '',
                                          outlet_formaladdress: outlet.outlet_formaladdress ?? '',
                                          outlet_status: outlet.outlet_status ?? 'ACTIVE',
                                          location_pin_quality: outlet.location_pin_quality ?? 'missing',
                                          location_verification_level: outlet.location_verification_level ?? 'unverified',
                                          owner_name: outlet.owner_name ?? '',
                                          owner_contact: outlet.owner_contact ?? '',
                                          outlet_barangay: outlet.outlet_barangay ?? '',
                                          outlet_district: outlet.outlet_district ?? '',
                                          outlet_city: outlet.outlet_city ?? '',
                                          outlet_area: outlet.outlet_area ?? '',
                                          outlet_concerningbranch: outlet.outlet_concerningbranch ?? '',
                                          lat: outlet.latitude ?? '',
                                          lng: outlet.longitude ?? '',
                                        });
                                        setOutletModalMode('edit');
                                        setShowOutletModal(true);
                                      }}>
                                      Edit
                                    </button>
                              <button style={s.editBtn}
                                      onClick={() => setUploadOutlet(outlet)}>
                                Upload photo
                              </button>
                            </div>
                          </td>
                        </>
                      </tr>
                  ))}
                </tbody>
              </table>
              {sortedFiltered.length === 0 && !loading && (
                <div style={s.emptyState}>No outlets match your search or filters.</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════
          CREATE MODAL
      ══════════════════════════════════ */}
      {showCreate && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>New outlet</h2>
              <button style={s.closeBtn} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={s.modalBody}>
              <div style={s.formGrid}>
                <Field label="Outlet name *">
                  <input style={s.input} value={createForm.outlet_name}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_name: e.target.value }))} />
                </Field>
                <Field label="Owner name *">
                  <input style={s.input} value={createForm.owner_name}
                    onChange={e => setCreateForm(f => ({ ...f, owner_name: e.target.value }))} />
                </Field>
                <Field label="Formal address *">
                  <input style={s.input} value={createForm.outlet_formaladdress}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_formaladdress: e.target.value }))} />
                </Field>
                <Field label="Owner contact">
                  <input style={s.input} value={createForm.owner_contact}
                    onChange={e => setCreateForm(f => ({ ...f, owner_contact: e.target.value }))} />
                </Field>
                <Field label="Barangay">
                  <input style={s.input} value={createForm.outlet_barangay}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_barangay: e.target.value }))} />
                </Field>
                <Field label="District">
                  <input style={s.input} value={createForm.outlet_district}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_district: e.target.value }))} />
                </Field>
                <Field label="City">
                  <select style={s.input} value={createForm.outlet_city}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_city: e.target.value }))}>
                    <option value="">Select city</option>
                    <option value="San Juan City">San Juan City</option>
                    <option value="Mandaluyong">Mandaluyong</option>
                    <option value="Quezon City">Quezon City</option>
                    <option value="Manila">Manila</option>
                  </select>
                </Field>
                <Field label="Area">
                  <input style={s.input} value={createForm.outlet_area}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_area: e.target.value }))} />
                </Field>
                <Field label="Latitude *">
                  <input style={s.input} type="number" step="any" value={createForm.lat}
                    onChange={e => setCreateForm(f => ({ ...f, lat: e.target.value }))} />
                </Field>
                <Field label="Longitude *">
                  <input style={s.input} type="number" step="any" value={createForm.lng}
                    onChange={e => setCreateForm(f => ({ ...f, lng: e.target.value }))} />
                </Field>
                <Field label="Status *">
                  <select style={s.input} value={createForm.outlet_status}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_status: e.target.value }))}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="PULLOUT">PULLOUT</option>
                  </select>
                </Field>
                <Field label="Pin quality *">
                  <select style={s.input} value={createForm.location_pin_quality}
                    onChange={e => setCreateForm(f => ({ ...f, location_pin_quality: e.target.value }))}>
                    <option value="precise">precise</option>
                    <option value="area">area</option>
                    <option value="cluster">cluster</option>
                    <option value="mismatch">mismatch</option>
                    <option value="missing">missing</option>
                  </select>
                </Field>
                <Field label="Verification level *">
                  <select style={s.input} value={createForm.location_verification_level}
                    onChange={e => setCreateForm(f => ({ ...f, location_verification_level: e.target.value }))}>
                    <option value="auditor">auditor</option>
                    <option value="rider">rider</option>
                    <option value="staff">staff</option>
                    <option value="unverified">unverified</option>
                  </select>
                </Field>
                <Field label="Concerning branch">
                  <input style={s.input} value={createForm.outlet_concerningbranch}
                    onChange={e => setCreateForm(f => ({ ...f, outlet_concerningbranch: e.target.value }))} />
                </Field>
              </div>
              {saveError && <p style={s.inlineError}>{saveError}</p>}
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={s.saveBtn} disabled={saving} onClick={submitCreate}>
                {saving ? 'Creating…' : 'Create outlet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadOutlet && (
        <PhotoUploadModal
          outletId={uploadOutlet.id}
          outletName={uploadOutlet.outlet_name}
          onClose={() => setUploadOutlet(null)}
          onSuccess={(url) => {
            // If the uploaded outlet is the currently selected map pin, refresh the photo
            if (selected?.id === uploadOutlet.id) {
              setSelectedPhoto({ url })
            }
            setUploadOutlet(null)
          }}
        />
      )}

      {/* Outlet Modal (View/Edit) */}
      {showOutletModal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>{outletModalMode === 'view' ? 'Outlet Details' : 'Edit Outlet'}</h2>
              <button style={s.closeBtn} onClick={() => setShowOutletModal(false)}>✕</button>
            </div>
            <div style={s.modalBody}>
              <div style={s.formGrid}>
                <Field label="Outlet name *">
                  <input style={s.input} value={modalOutletForm.outlet_name}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_name: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Owner name *">
                  <input style={s.input} value={modalOutletForm.owner_name}
                    onChange={e => setModalOutletForm(f => ({ ...f, owner_name: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Formal address *">
                  <input style={s.input} value={modalOutletForm.outlet_formaladdress}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_formaladdress: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Owner contact">
                  <input style={s.input} value={modalOutletForm.owner_contact}
                    onChange={e => setModalOutletForm(f => ({ ...f, owner_contact: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Barangay">
                  <input style={s.input} value={modalOutletForm.outlet_barangay}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_barangay: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="District">
                  <input style={s.input} value={modalOutletForm.outlet_district}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_district: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="City">
                  <select style={s.input} value={modalOutletForm.outlet_city}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_city: e.target.value }))}
                    disabled={outletModalMode === 'view'}>
                    <option value="">Select city</option>
                    <option value="San Juan City">San Juan City</option>
                    <option value="Mandaluyong">Mandaluyong</option>
                    <option value="Quezon City">Quezon City</option>
                    <option value="Manila">Manila</option>
                  </select>
                </Field>
                <Field label="Area">
                  <input style={s.input} value={modalOutletForm.outlet_area}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_area: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Latitude *">
                  <input style={s.input} type="number" step="any" value={modalOutletForm.lat}
                    onChange={e => setModalOutletForm(f => ({ ...f, lat: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Longitude *">
                  <input style={s.input} type="number" step="any" value={modalOutletForm.lng}
                    onChange={e => setModalOutletForm(f => ({ ...f, lng: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
                <Field label="Status *">
                  <select style={s.input} value={modalOutletForm.outlet_status}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_status: e.target.value }))}
                    disabled={outletModalMode === 'view'}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="PULLOUT">PULLOUT</option>
                  </select>
                </Field>
                <Field label="Pin quality *">
                  <select style={s.input} value={modalOutletForm.location_pin_quality}
                    onChange={e => setModalOutletForm(f => ({ ...f, location_pin_quality: e.target.value }))}
                    disabled={outletModalMode === 'view'} >
                    <option value="precise">precise</option>
                    <option value="area">area</option>
                    <option value="cluster">cluster</option>
                    <option value="mismatch">mismatch</option>
                    <option value="missing">missing</option>
                  </select>
                </Field>
                <Field label="Verification level *">
                  <select style={s.input} value={modalOutletForm.location_verification_level}
                    onChange={e => setModalOutletForm(f => ({ ...f, location_verification_level: e.target.value }))}
                    disabled={outletModalMode === 'view'}>
                    <option value="auditor">auditor</option>
                    <option value="rider">rider</option>
                    <option value="staff">staff</option>
                    <option value="unverified">unverified</option>
                  </select>
                </Field>
                <Field label="Concerning branch">
                  <input style={s.input} value={modalOutletForm.outlet_concerningbranch}
                    onChange={e => setModalOutletForm(f => ({ ...f, outlet_concerningbranch: e.target.value }))}
                    disabled={outletModalMode === 'view'} />
                </Field>
              </div>
              {saveError && <p style={s.inlineError}>{saveError}</p>}
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setShowOutletModal(false)}>Cancel</button>
              {outletModalMode === 'view' && (
                <button style={{ padding: '4px 12px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: 'pointer', color: '#374151', marginRight: '8px' }}
                  onClick={() => {
                    setOutletModalMode('edit');
                  }}>
                  Edit
                </button>
              )}
              <button style={s.saveBtn} disabled={saving} onClick={saveModalOutlet}>
                {saving ? 'Saving…' : outletModalMode === 'view' ? 'Close' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ───────────────────────────────────
const s = {
  page:           { display: 'flex', height: '100vh', fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: 'hidden', background: '#f9fafb' },

  // Filter sidebar (secondary — sits between Sidebar and main)
  filterSidebar:  { width: '180px', flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px', overflowY: 'auto' },

  tabs:           { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' },
  tab:            { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'none', fontSize: '13px', fontWeight: '500', color: '#374151', cursor: 'pointer', textAlign: 'left' },
  tabActive:      { background: '#fff7ed', color: '#c2410c', fontWeight: '600' },

  section:        { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionLabel:   { fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  divider:        { height: '1px', background: '#f3f4f6' },

  countRow:       { display: 'flex', alignItems: 'center', gap: '8px' },
  dot:            { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  countLabel:     { fontSize: '13px', color: '#374151', flex: 1 },
  countVal:       { fontSize: '13px', fontWeight: '600', color: '#111827' },

  select:         { width: '100%', padding: '7px 10px', fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff', color: '#111827', cursor: 'pointer' },
  clearBtn:       { padding: '6px', fontSize: '12px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },

  // Main
  main:           { flex: 1, position: 'relative', overflow: 'hidden' },

  loadingBanner:  { position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', color: '#6b7280', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  errorBanner:    { position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', color: '#b91c1c' },

  // Map panel
  panel:          { position: 'absolute', top: '12px', right: '12px', zIndex: 1000, width: '300px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', overflow: 'hidden', maxHeight: 'calc(100vh - 24px)', display: 'flex', flexDirection: 'column' },
  panelHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  panelName:      { fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 },
  panelAddr:      { fontSize: '12px', color: '#6b7280', margin: '2px 0 0' },
  closeBtn:       { background: 'none', border: 'none', fontSize: '16px', color: '#9ca3af', cursor: 'pointer', padding: '0 0 0 8px', flexShrink: 0 },
  photoSection:   { flexShrink: 0 },
  photo:          { width: '100%', height: '180px', objectFit: 'cover', display: 'block' },
  photoPlaceholder: { height: '120px', background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  photoPlaceholderIcon: { fontSize: '24px', opacity: 0.4 },
  photoPlaceholderText: { fontSize: '12px', color: '#9ca3af' },
  panelBody:      { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' },
  prow:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  prowLabel:      { color: '#6b7280' },
  prowValue:      { color: '#111827', fontWeight: '500', textAlign: 'right', maxWidth: '180px' },

  // Table
  tableContainer: { display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 28px', boxSizing: 'border-box' },
  tableHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' },
  pageTitle:      { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle:   { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  toolbar:        { display: 'flex', gap: '10px', alignItems: 'center' },
  searchInput:    { width: '260px', padding: '9px 14px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', color: '#111827' },
  createBtn:      { padding: '9px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn:      { padding: '4px 12px', fontSize: '12px', fontWeight: '600', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: 'pointer', color: '#6b7280' },

  tableWrapper:   { flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' },
  table:          { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:             { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 },
  tr:             { borderBottom: '1px solid #f3f4f6' },
  td:             { padding: '10px 12px', color: '#111827', verticalAlign: 'middle' },
  cellInput:      { width: '100%', padding: '5px 8px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '5px', minWidth: '80px' },
  cellSelect:     { width: '100%', padding: '5px 8px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '5px' },
  editBtn:        { padding: '4px 12px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: 'pointer', color: '#374151' },
  saveBtn:        { padding: '4px 12px', fontSize: '12px', fontWeight: '600', background: '#f97316', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' },
  inlineError:    { fontSize: '11px', color: '#b91c1c', margin: '4px 0 0' },
  emptyState:     { padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },

  // Modal
  modalOverlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:          { background: '#fff', borderRadius: '12px', width: '680px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  modalTitle:     { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  modalBody:      { padding: '20px 24px', overflowY: 'auto', flex: 1 },
  modalFooter:    { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid #f3f4f6' },
  formGrid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  fieldGroup:     { display: 'flex', flexDirection: 'column', gap: '5px' },
  fieldLabel:     { fontSize: '12px', fontWeight: '600', color: '#374151' },
  input:          { padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#111827', width: '100%', boxSizing: 'border-box' },
}
