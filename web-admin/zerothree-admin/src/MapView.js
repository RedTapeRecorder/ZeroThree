import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import axios from 'axios'
import 'leaflet/dist/leaflet.css'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'
const THUNDERFOREST_KEY = process.env.REACT_APP_THUNDERFOREST_KEY

const STATUS_COLOR = {
  ACTIVE:   '#22c55e',
  INACTIVE: '#9ca3af',
  PULLOUT:  '#f97316',
}

const LOW_QUALITY = new Set(['cluster', 'mismatch', 'missing'])

function pinStyle(outlet) {
  const base = STATUS_COLOR[outlet.outlet_status] ?? '#9ca3af'
  const lowQ  = LOW_QUALITY.has(outlet.location_pin_quality)
  return {
    color:       base,
    fillColor:   base,
    fillOpacity: lowQ ? 0.25 : 0.85,
    opacity:     lowQ ? 0.4  : 1,
    weight:      1.5,
    radius:      lowQ ? 5    : 7,
  }
}

const SAN_JUAN = [14.6007, 121.0355]

export default function MapView() {
  const [outlets, setOutlets]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)
  const [filters, setFilters]   = useState({
    status:             '',
    pin_quality:        '',
    verification_level: '',
  })
  const [counts, setCounts] = useState({ ACTIVE: 0, INACTIVE: 0, PULLOUT: 0 })
  const token = localStorage.getItem('zt_token')

  useEffect(() => { fetchOutlets() }, [filters])

  async function fetchOutlets() {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filters.status)             params.status             = filters.status
      if (filters.pin_quality)        params.pin_quality        = filters.pin_quality
      if (filters.verification_level) params.verification_level = filters.verification_level

      const res = await axios.get(`${API_URL}/api/v1/admin/outlets`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })

      const data = res.data
      setOutlets(data)

      const c = { ACTIVE: 0, INACTIVE: 0, PULLOUT: 0 }
      data.forEach(o => {
        const s = o.outlet_status
        if (s in c) c[s]++
      })
      setCounts(c)
    } catch (err) {
      setError('Failed to load outlets.')
    } finally {
      setLoading(false)
    }
  }

  const plottable = outlets.filter(o => o.latitude != null && o.longitude != null)

  return (
    <div style={styles.page}>

      {/* ── Sidebar ── */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logoMark}>Z3</div>
          <span style={styles.brandName}>ZeroThree</span>
        </div>

        <nav style={styles.nav}>
          <div style={styles.navItem}>
            🗺 Outlet Map
          </div>
        </nav>

        <div style={styles.statsBlock}>
          <p style={styles.sectionLabel}>Outlets</p>
          <div style={styles.statRow}>
            <span style={{ ...styles.dot, background: STATUS_COLOR.ACTIVE }} />
            <span style={styles.statText}>Active</span>
            <span style={styles.statCount}>{counts.ACTIVE}</span>
          </div>
          <div style={styles.statRow}>
            <span style={{ ...styles.dot, background: STATUS_COLOR.INACTIVE }} />
            <span style={styles.statText}>Inactive</span>
            <span style={styles.statCount}>{counts.INACTIVE}</span>
          </div>
          <div style={styles.statRow}>
            <span style={{ ...styles.dot, background: STATUS_COLOR.PULLOUT }} />
            <span style={styles.statText}>Pullout</span>
            <span style={styles.statCount}>{counts.PULLOUT}</span>
          </div>
          <div style={styles.statRow}>
            <span style={{ ...styles.dot, background: '#cbd5e1' }} />
            <span style={styles.statText}>No coordinates</span>
            <span style={styles.statCount}>{outlets.length - plottable.length}</span>
          </div>
        </div>

        <div style={styles.filtersBlock}>
          <p style={styles.sectionLabel}>Filters</p>

          <select
            style={styles.select}
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="PULLOUT">Pullout</option>
          </select>

          <select
            style={styles.select}
            value={filters.pin_quality}
            onChange={e => setFilters(f => ({ ...f, pin_quality: e.target.value }))}
          >
            <option value="">All pin quality</option>
            <option value="precise">Precise</option>
            <option value="area">Area</option>
            <option value="cluster">Cluster</option>
            <option value="mismatch">Mismatch</option>
            <option value="missing">Missing</option>
          </select>

          <select
            style={styles.select}
            value={filters.verification_level}
            onChange={e => setFilters(f => ({ ...f, verification_level: e.target.value }))}
          >
            <option value="">All verification</option>
            <option value="auditor">Auditor</option>
            <option value="rider">Rider</option>
            <option value="staff">Staff</option>
            <option value="unverified">Unverified</option>
          </select>

          {(filters.status || filters.pin_quality || filters.verification_level) && (
            <button
              style={styles.clearBtn}
              onClick={() => setFilters({ status: '', pin_quality: '', verification_level: '' })}
            >
              Clear filters
            </button>
          )}
        </div>

        <div style={styles.legendBlock}>
          <p style={styles.sectionLabel}>Pin opacity</p>
          <div style={styles.legendRow}>
            <span style={{ ...styles.dot, background: '#22c55e' }} />
            <span style={styles.statText}>High confidence</span>
          </div>
          <div style={styles.legendRow}>
            <span style={{ ...styles.dot, background: '#22c55e', opacity: 0.3 }} />
            <span style={styles.statText}>Low confidence</span>
          </div>
        </div>

        <button
          style={styles.logoutBtn}
          onClick={() => { localStorage.clear(); window.location.href = '/login' }}
        >
          Sign out
        </button>
      </aside>

      {/* ── Map ── */}
      <main style={styles.main}>
        {loading && <div style={styles.loadingBanner}>Loading outlets…</div>}
        {error   && <div style={styles.errorBanner}>{error}</div>}

        <MapContainer center={SAN_JUAN} zoom={14} style={styles.map}>
          <TileLayer
            url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
            attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
          />

          {plottable.map(outlet => (
            <CircleMarker
              key={outlet.id}
              center={[outlet.latitude, outlet.longitude]}
              {...pinStyle(outlet)}
              eventHandlers={{ click: () => setSelected(outlet) }}
            />
          ))}
        </MapContainer>

        {/* ── Outlet panel ── */}
        {selected && (
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <div style={{ flex: 1 }}>
                <p style={styles.panelName}>{selected.outlet_name}</p>
                <p style={styles.panelAddress}>{selected.outlet_formaladdress}</p>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={styles.panelBody}>
              <Row label="Status">
                <Badge status={selected.outlet_status} />
              </Row>
              <Row label="Barangay">{selected.outlet_barangay ?? '—'}</Row>
              <Row label="Pin quality">
                <span style={qualityStyle(selected.location_pin_quality)}>
                  {selected.location_pin_quality ?? '—'}
                </span>
              </Row>
              <Row label="Verification">{selected.location_verification_level ?? '—'}</Row>
              <Row label="Coordinates">
                {selected.latitude != null
                  ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                  : '—'}
              </Row>
              {selected.outlet_last_visit_time && (
                <Row label="Last visit">
                  {new Date(selected.outlet_last_visit_time).toLocaleDateString('en-PH', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </Row>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{children}</span>
    </div>
  )
}

function Badge({ status }) {
  const color = {
    ACTIVE:   { bg: '#dcfce7', text: '#15803d' },
    INACTIVE: { bg: '#f3f4f6', text: '#6b7280' },
    PULLOUT:  { bg: '#ffedd5', text: '#c2410c' },
  }[status] ?? { bg: '#f3f4f6', text: '#6b7280' }

  return (
    <span style={{ ...styles.badge, background: color.bg, color: color.text }}>
      {status ?? '—'}
    </span>
  )
}

function qualityStyle(q) {
  const colors = {
    precise:  { color: '#15803d' },
    area:     { color: '#0369a1' },
    cluster:  { color: '#b45309' },
    mismatch: { color: '#b91c1c' },
    missing:  { color: '#9ca3af' },
  }
  return { fontWeight: 500, ...(colors[q] ?? {}) }
}

const styles = {
  page: {
    display: 'flex',
    height: '100vh',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    overflow: 'hidden',
  },
  sidebar: {
    width: '240px',
    flexShrink: 0,
    background: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
    gap: '8px',
    overflowY: 'auto',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  logoMark: {
    width: '32px',
    height: '32px',
    background: '#f97316',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
    color: '#fff',
  },
  brandName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#111827',
  },
  nav: {
    marginBottom: '8px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    background: '#f3f4f6',
    fontSize: '13px',
    fontWeight: '600',
    color: '#111827',
  },
  statsBlock: {
    borderTop: '1px solid #f3f4f6',
    paddingTop: '16px',
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    margin: '0 0 4px',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
  },
  statText: {
    fontSize: '13px',
    color: '#374151',
    flex: 1,
  },
  statCount: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#111827',
  },
  filtersBlock: {
    borderTop: '1px solid #f3f4f6',
    paddingTop: '16px',
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  select: {
    width: '100%',
    padding: '7px 10px',
    fontSize: '13px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '6px',
    fontSize: '12px',
    color: '#6b7280',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  legendBlock: {
    borderTop: '1px solid #f3f4f6',
    paddingTop: '16px',
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoutBtn: {
    marginTop: 'auto',
    padding: '8px',
    fontSize: '13px',
    color: '#6b7280',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingBanner: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    color: '#6b7280',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  errorBanner: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    color: '#b91c1c',
  },
  panel: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: 1000,
    width: '300px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px',
    borderBottom: '1px solid #f3f4f6',
  },
  panelName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#111827',
    margin: 0,
  },
  panelAddress: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '2px 0 0',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0 0 0 8px',
    flexShrink: 0,
  },
  panelBody: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
  },
  rowLabel: {
    color: '#6b7280',
  },
  rowValue: {
    color: '#111827',
    fontWeight: '500',
    textAlign: 'right',
    maxWidth: '180px',
  },
  badge: {
    padding: '2px 8px',
    borderRadius: '99px',
    fontSize: '12px',
    fontWeight: '600',
  },
}
