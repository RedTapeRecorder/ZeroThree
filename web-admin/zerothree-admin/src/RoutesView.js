import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import Sidebar from './Sidebar'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'
const THUNDERFOREST_KEY = process.env.REACT_APP_THUNDERFOREST_KEY
const SAN_JUAN = [14.6007, 121.0355]

// ── Draw control component ───────────────────
// Mounts the leaflet-draw polygon tool onto the map
function DrawControl({ onPolygonDrawn }) {
  const map = useMap()
  const drawnLayersRef = useRef(new L.FeatureGroup())

  useEffect(() => {
    const drawnLayers = drawnLayersRef.current
    map.addLayer(drawnLayers)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#f97316', fillOpacity: 0.15 },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnLayers,
        remove: true,
      },
    })

    map.addControl(drawControl)

    map.on(L.Draw.Event.CREATED, e => {
      drawnLayers.clearLayers()
      drawnLayers.addLayer(e.layer)
      onPolygonDrawn(e.layer.getLatLngs()[0])
    })

    map.on(L.Draw.Event.DELETED, () => {
      onPolygonDrawn(null)
    })

    return () => {
      map.removeControl(drawControl)
      map.removeLayer(drawnLayers)
      map.off(L.Draw.Event.CREATED)
      map.off(L.Draw.Event.DELETED)
    }
  }, [map, onPolygonDrawn])

  return null
}

// ── Point-in-polygon helper ──────────────────
function pointInPolygon(point, polygon) {
  const x = point.lat
  const y = point.lng
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export default function RoutesView() {
  const [view, setView]             = useState('list')  // 'list' | 'builder'
  const [routes, setRoutes]         = useState([])
  const [outlets, setOutlets]       = useState([])
  const [riders, setRiders]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  // Builder state
  const [polygon, setPolygon]       = useState(null)
  const [selected, setSelected]     = useState([])      // outlets selected in polygon
  const [routeName, setRouteName]   = useState('')
  const [assignedRider, setAssignedRider] = useState('')
  const [highPriority, setHighPriority]   = useState(new Set())
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [savedRouteId, setSavedRouteId]   = useState(null)

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetchRoutes()
    fetchOutlets()
    fetchRiders()
  }, [])

  // Recompute selected outlets whenever polygon changes
  useEffect(() => {
    if (!polygon) { setSelected([]); return }
    const inside = outlets.filter(o =>
      o.latitude != null && o.longitude != null &&
      pointInPolygon({ lat: o.latitude, lng: o.longitude }, polygon)
    )
    setSelected(inside)
  }, [polygon, outlets])

  async function fetchRoutes() {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/routes`, { headers })
      setRoutes(res.data)
    } catch {
      setError('Failed to load routes.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchOutlets() {
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/outlets`, { headers })
      setOutlets(res.data.filter(o => o.outlet_status === 'ACTIVE'))
    } catch {}
  }

  async function fetchRiders() {
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/riders`, { headers })
      setRiders(res.data.filter(r => r.status === 'active'))
    } catch {}
  }

  async function submitRoute() {
    if (!routeName.trim()) { setSaveError('Route name is required.'); return }
    if (!assignedRider)    { setSaveError('Assign a rider.'); return }
    if (selected.length === 0) { setSaveError('No outlets selected. Draw a polygon on the map.'); return }
    if (selected.length > 80)  { setSaveError('Maximum 80 outlets per route.'); return }

    setSaving(true)
    setSaveError('')
    try {
      const res = await axios.post(`${API_URL}/api/v1/admin/routes`, {
        rider_id:   parseInt(assignedRider, 10),
        route_name: routeName,
        outlet_ids: selected.map(o => o.id),
      }, { headers })

      setSavedRouteId(res.data.route_id)

      // Flag high priority outlets
      for (const outletId of highPriority) {
        await axios.patch(
          `${API_URL}/api/v1/admin/routes/${res.data.route_id}/outlets/${outletId}/priority`,
          {},
          { headers }
        )
      }

      fetchRoutes()
    } catch {
      setSaveError('Failed to create route.')
    } finally {
      setSaving(false)
    }
  }

  function resetBuilder() {
    setPolygon(null)
    setSelected([])
    setRouteName('')
    setAssignedRider('')
    setHighPriority(new Set())
    setSaveError('')
    setSavedRouteId(null)
  }

  function toggleHighPriority(id) {
    setHighPriority(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function removeOutlet(id) {
    setSelected(prev => prev.filter(o => o.id !== id))
  }

  const plottable = outlets.filter(o => o.latitude != null && o.longitude != null)

  return (
  <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
    <Sidebar activePage="routes" />   {/* use "routes" in RoutesView.js */}
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box' }}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.pageTitle}>
            {view === 'list' ? 'Routes' : 'Route Builder'}
          </h1>
          <p style={s.pageSubtitle}>
            {view === 'list'
              ? `${routes.length} routes created`
              : 'Draw a polygon on the map to select outlets'}
          </p>
        </div>
        <div style={s.toolbar}>
          {view === 'list' ? (
            <button style={s.createBtn} onClick={() => { setView('builder'); resetBuilder() }}>
              + New route
            </button>
          ) : (
            <button style={s.cancelBtn} onClick={() => { setView('list'); resetBuilder() }}>
              ← Back to routes
            </button>
          )}
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* ══════════════════════════════════════
          ROUTE LIST VIEW
      ══════════════════════════════════════ */}
      {view === 'list' && (
        <div style={s.tableWrapper}>
          <table style={s.table}>
            <thead>
              <tr>
                {['ID', 'Route name', 'Assigned rider', 'Outlets', 'Status', 'Created'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map(route => (
                <tr key={route.id} style={s.tr}>
                  <td style={s.td}>#{route.id}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{route.route_name}</td>
                  <td style={s.td}>{route.rider_name ?? '—'}</td>
                  <td style={s.td}>{route.outlet_count} outlets</td>
                  <td style={s.td}>
                    <span style={route.is_active ? s.activeBadge : s.inactiveBadge}>
                      {route.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={s.td}>{fmt(route.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {routes.length === 0 && !loading && (
            <div style={s.emptyState}>No routes created yet. Click "+ New route" to build one.</div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          ROUTE BUILDER VIEW
      ══════════════════════════════════════ */}
      {view === 'builder' && (
        <div style={s.builderLayout}>

          {/* Left — map */}
          <div style={s.mapPane}>
            <MapContainer center={SAN_JUAN} zoom={14} style={{ width: '100%', height: '100%' }}>
              <TileLayer
                url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
                attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
              />
              <DrawControl onPolygonDrawn={setPolygon} />
              {plottable.map(outlet => {
                const isSelected = selected.some(o => o.id === outlet.id)
                const isHP       = highPriority.has(outlet.id)
                return (
                  <CircleMarker
                    key={outlet.id}
                    center={[outlet.latitude, outlet.longitude]}
                    radius={isSelected ? 9 : 6}
                    color={isHP ? '#dc2626' : isSelected ? '#f97316' : '#9ca3af'}
                    fillColor={isHP ? '#dc2626' : isSelected ? '#f97316' : '#9ca3af'}
                    fillOpacity={isSelected ? 0.9 : 0.4}
                    weight={isSelected ? 2 : 1}
                  />
                )
              })}
            </MapContainer>

            {/* Map legend */}
            <div style={s.mapLegend}>
              <LegendItem color="#9ca3af" label="Unselected outlet" />
              <LegendItem color="#f97316" label="Selected outlet" />
              <LegendItem color="#dc2626" label="High priority" />
            </div>
          </div>

          {/* Right — route config panel */}
          <div style={s.configPane}>

            {savedRouteId ? (
              // ── Success state ──
              <div style={s.successBlock}>
                <div style={s.successIcon}>✓</div>
                <p style={s.successTitle}>Route created</p>
                <p style={s.successSub}>Route #{savedRouteId} has been assigned to the rider.</p>
                <button style={s.createBtn} onClick={() => { setView('list'); resetBuilder() }}>
                  View all routes
                </button>
                <button style={s.cancelBtn} onClick={resetBuilder}>
                  Build another route
                </button>
              </div>
            ) : (
              <>
                {/* Route details */}
                <div style={s.configSection}>
                  <p style={s.configLabel}>Route details</p>
                  <input
                    style={s.input}
                    placeholder="Route name e.g. San Juan North — Tuesday"
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                  />
                  <select style={s.input} value={assignedRider}
                    onChange={e => setAssignedRider(e.target.value)}>
                    <option value="">Assign to rider…</option>
                    {riders.map(r => (
                      <option key={r.id} value={r.id}>{r.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Selected outlets */}
                <div style={s.configSection}>
                  <p style={s.configLabel}>
                    Selected outlets
                    <span style={s.countPill}>{selected.length} / 80</span>
                  </p>

                  {selected.length === 0 && (
                    <p style={s.hintText}>
                      Use the polygon tool (pentagon icon) in the top-left of the map to draw around outlets.
                    </p>
                  )}

                  {selected.length > 80 && (
                    <div style={s.warnBox}>Too many outlets selected. Maximum is 80.</div>
                  )}

                  <div style={s.outletList}>
                    {selected.map((outlet, idx) => (
                      <div key={outlet.id} style={s.outletRow}>
                        <span style={s.outletSeq}>{idx + 1}</span>
                        <div style={s.outletInfo}>
                          <p style={s.outletName}>{outlet.outlet_name}</p>
                          <p style={s.outletMeta}>{outlet.outlet_barangay ?? outlet.outlet_formaladdress ?? '—'}</p>
                        </div>
                        <div style={s.outletActions}>
                          <button
                            style={{
                              ...s.priorityBtn,
                              ...(highPriority.has(outlet.id) ? s.priorityBtnActive : {}),
                            }}
                            onClick={() => toggleHighPriority(outlet.id)}
                            title="Flag as high priority"
                          >
                            ★
                          </button>
                          <button style={s.removeBtn}
                            onClick={() => removeOutlet(outlet.id)}
                            title="Remove from route">
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {highPriority.size > 0 && (
                    <p style={s.hintText}>
                      ★ {highPriority.size} high priority outlet{highPriority.size > 1 ? 's' : ''} — rider will receive a push notification.
                    </p>
                  )}
                </div>

                {saveError && <div style={s.errorBanner}>{saveError}</div>}

                <button
                  style={{
                    ...s.createBtn,
                    width: '100%',
                    padding: '12px',
                    opacity: saving ? 0.6 : 1,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                  disabled={saving}
                  onClick={submitRoute}
                >
                  {saving ? 'Creating route…' : `Create route (${selected.length} outlets)`}
                </button>
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

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: '11px', color: '#374151' }}>{label}</span>
    </div>
  )
}

// ── Styles ───────────────────────────────────

const s = {
  page:         { display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 28px', boxSizing: 'border-box', fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' },
  pageTitle:    { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle: { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  toolbar:      { display: 'flex', gap: '10px' },
  createBtn:    { padding: '9px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn:    { padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  errorBanner:  { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '12px' },

  tableWrapper: { flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  tr:           { borderBottom: '1px solid #f3f4f6' },
  td:           { padding: '10px 14px', color: '#111827', verticalAlign: 'middle' },
  activeBadge:  { padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: '#dcfce7', color: '#15803d' },
  inactiveBadge:{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', color: '#6b7280' },
  emptyState:   { padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },

  builderLayout:{ display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' },
  mapPane:      { flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' },
  mapLegend:    { position: 'absolute', bottom: '12px', left: '12px', zIndex: 1000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },

  configPane:   { width: '320px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0', overflowY: 'auto' },
  configSection:{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '10px' },
  configLabel:  { fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  countPill:    { background: '#f97316', color: '#fff', borderRadius: '99px', padding: '1px 8px', fontSize: '11px', fontWeight: '700' },
  input:        { padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#111827', width: '100%', boxSizing: 'border-box' },
  hintText:     { fontSize: '12px', color: '#9ca3af', margin: 0, lineHeight: '1.5' },
  warnBox:      { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#b91c1c' },

  outletList:   { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' },
  outletRow:    { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #f3f4f6' },
  outletSeq:    { width: '20px', height: '20px', borderRadius: '50%', background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  outletInfo:   { flex: 1, minWidth: 0 },
  outletName:   { fontSize: '12px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  outletMeta:   { fontSize: '11px', color: '#9ca3af', margin: 0 },
  outletActions:{ display: 'flex', gap: '4px', flexShrink: 0 },
  priorityBtn:  { width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  priorityBtnActive: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#d97706' },
  removeBtn:    { width: '24px', height: '24px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  successBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', gap: '12px', flex: 1, justifyContent: 'center' },
  successIcon:  { width: '52px', height: '52px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700' },
  successTitle: { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  successSub:   { fontSize: '13px', color: '#6b7280', textAlign: 'center', margin: 0 },
}
