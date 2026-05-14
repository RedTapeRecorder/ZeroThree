import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import axios from 'axios'
import L from 'leaflet'
import Sidebar from './Sidebar'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'
const THUNDERFOREST_KEY = process.env.REACT_APP_THUNDERFOREST_KEY
const SAN_JUAN = [14.6007, 121.0355]

// ── Draw control ─────────────────────────────
function DrawControl({ onPolygonDrawn, disabled }) {
  const map = useMap()
  const drawnLayersRef = useRef(new L.FeatureGroup())
  const drawControlRef = useRef(null)

  useEffect(() => {
    const drawnLayers = drawnLayersRef.current
    map.addLayer(drawnLayers)

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#6366f1', fillOpacity: 0.1, weight: 2 },
        },
        polyline: false, rectangle: false, circle: false,
        circlemarker: false, marker: false,
      },
      edit: { featureGroup: drawnLayers, remove: true },
    })

    drawControlRef.current = drawControl

    if (!disabled) {
      map.addControl(drawControl)
    }

    map.on(L.Draw.Event.CREATED, e => {
      drawnLayers.clearLayers()
      drawnLayers.addLayer(e.layer)
      onPolygonDrawn(e.layer.getLatLngs()[0])
    })
    map.on(L.Draw.Event.DELETED, () => onPolygonDrawn(null))

    return () => {
      if (drawControlRef.current) map.removeControl(drawControlRef.current)
      map.removeLayer(drawnLayers)
      map.off(L.Draw.Event.CREATED)
      map.off(L.Draw.Event.DELETED)
    }
  }, [map])

  return null
}

// ── Auto-fit bounds ───────────────────────────
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) { map.setView(points[0], 16); return }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
  }, []) // only on mount
  return null
}

// ── Point-in-polygon ─────────────────────────
function pointInPolygon(point, polygon) {
  const x = point.lat, y = point.lng
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

const EMPTY_BUILDER = {
  // Step 1 — polygon
  polygon: null,
  inPolygon: [],       // outlets inside the polygon
  // Step 2 — sequencing
  sequence: [],        // outlets clicked in order
  highPriority: new Set(),
  // Route meta
  routeName: '',
  assignedRider: '',
  // UI
  step: 1,             // 1 = draw polygon, 2 = click sequence
  saving: false,
  saveError: '',
  savedRouteId: null,
  showSkipWarning: false,
}

export default function RoutesView() {
  const [view, setView]               = useState('list')
  const [routes, setRoutes]           = useState([])
  const [outlets, setOutlets]         = useState([])
  const [riders, setRiders]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  const [builder, setBuilder]         = useState(EMPTY_BUILDER)
  const [polygon, setPolygon]         = useState(null)

  const [editRoute, setEditRoute]     = useState(null)
  const [editName, setEditName]       = useState('')
  const [editActive, setEditActive]   = useState(true)
  const [editOutlets, setEditOutlets] = useState([])
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState('')
  const [dragIdx, setDragIdx]         = useState(null)
  const [toast, setToast]             = useState(null)

  const [osrmCoords, setOsrmCoords]   = useState(null)
  const [osrmLoading, setOsrmLoading] = useState(false)
  const [osrmError, setOsrmError]     = useState('')
  const [showOsrm, setShowOsrm]       = useState(true)
  const [osrmStats, setOsrmStats]     = useState(null)

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetchRoutes()
    fetchOutlets()
    fetchRiders()
  }, [])

  useEffect(() => {
  console.log('polygon changed:', polygon)
  console.log('outlets available:', outlets.length)
  if (!polygon) {
    setBuilder(b => ({ ...b, inPolygon: [], sequence: [], step: 1 }))
    return
  }
  const inside = outlets.filter(o =>
    o.latitude != null && o.longitude != null &&
    pointInPolygon({ lat: o.latitude, lng: o.longitude }, polygon)
  )
  console.log('inside polygon:', inside.length)
  setBuilder(b => ({ ...b, inPolygon: inside, sequence: [], step: 2 }))
}, [polygon, outlets])

  async function fetchRoutes() {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/routes`, { headers })
      const data = Array.isArray(res.data) ? res.data : res.data.routes ?? []
      setRoutes(data)
    } catch { setError('Failed to load routes.') }
    finally { setLoading(false) }
  }

  async function deleteRoute(routeId) {
    if (!window.confirm('Delete this route? This cannot be undone.')) return
    try {
      await axios.delete(`${API_URL}/api/v1/admin/routes/${routeId}`, { headers })
      showToast('Route deleted', 'success')
      fetchRoutes()
    } catch { showToast('Failed to delete route', 'error') }
  }

  async function duplicateRoute(routeId) {
    try {
      await axios.post(`${API_URL}/api/v1/admin/routes/${routeId}/duplicate`, {}, { headers })
      showToast('Route duplicated', 'success')
      fetchRoutes()
    } catch { showToast('Failed to duplicate route', 'error') }
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

  // ── Builder: pin click ───────────────────
  function handleOutletClick(outlet) {
    if (builder.step !== 2) return
    // Only allow clicks on outlets inside the polygon
    const isInPolygon = builder.inPolygon.some(o => o.id === outlet.id)
    if (!isInPolygon) return

    const alreadySelected = builder.sequence.some(o => o.id === outlet.id)
    if (alreadySelected) {
      // Deselect — remove from sequence
      setBuilder(b => ({
        ...b,
        sequence: b.sequence.filter(o => o.id !== outlet.id),
        highPriority: (() => {
          const next = new Set(b.highPriority)
          next.delete(outlet.id)
          return next
        })(),
      }))
    } else {
      // Add to sequence
      setBuilder(b => ({ ...b, sequence: [...b.sequence, outlet] }))
    }
  }

  // ── Builder: submit ──────────────────────
  function handleSubmitClick() {
    const { routeName, assignedRider, sequence, inPolygon } = builder
    if (!routeName.trim()) { setBuilder(b => ({ ...b, saveError: 'Route name is required.' })); return }
    if (sequence.length === 0) { setBuilder(b => ({ ...b, saveError: 'Click at least one outlet on the map to set the route sequence.' })); return }
    if (sequence.length > 80)  { setBuilder(b => ({ ...b, saveError: 'Maximum 80 outlets per route.' })); return }

    const skipped = inPolygon.filter(o => !sequence.some(s => s.id === o.id))
    if (skipped.length > 0) {
      setBuilder(b => ({ ...b, showSkipWarning: true, saveError: '' }))
      return
    }

    submitRoute()
  }

  async function submitRoute() {
    const { routeName, assignedRider, sequence, highPriority } = builder
    setBuilder(b => ({ ...b, saving: true, saveError: '', showSkipWarning: false }))
    try {
      const res = await axios.post(`${API_URL}/api/v1/admin/routes`, {
        rider_id:   parseInt(assignedRider, 10),
        route_name: routeName,
        outlet_ids: sequence.map(o => o.id),
      }, { headers })

      const routeId = res.data.route_id
      for (const outletId of highPriority) {
        await axios.patch(
          `${API_URL}/api/v1/admin/routes/${routeId}/outlets/${outletId}/priority`,
          {}, { headers }
        )
      }
      setBuilder(b => ({ ...b, savedRouteId: routeId, saving: false }))
      fetchRoutes()
    } catch {
      setBuilder(b => ({ ...b, saveError: 'Failed to create route.', saving: false }))
    }
  }

  function resetBuilder() {
    setBuilder(EMPTY_BUILDER)
    setPolygon(null)
  }
  // ── Edit ─────────────────────────────────
  async function openEdit(routeId) {
    setEditError('')
    setOsrmCoords(null)
    setOsrmStats(null)
    setOsrmError('')
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/routes/${routeId}`, { headers })
      const r = res.data
      setEditRoute(r)
      setEditName(r.route_name)
      setEditActive(r.is_active)
      setEditOutlets(r.outlets)
      setView('edit')
      fetchOsrm(routeId)
    } catch { setError('Failed to load route.') }
  }

  async function fetchOsrm(routeId) {
    setOsrmLoading(true)
    setOsrmError('')
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/routes/${routeId}/osrm`, { headers })
      if (res.data.geometry) {
        setOsrmCoords(res.data.geometry.map(([lng, lat]) => [lat, lng]))
        setOsrmStats({ distance_meters: res.data.distance_meters, duration_seconds: res.data.duration_seconds })
      } else {
        setOsrmError(res.data.reason ?? 'Could not compute street route')
      }
    } catch { setOsrmError('Street routing unavailable') }
    finally { setOsrmLoading(false) }
  }

  function handleDragStart(idx) { setDragIdx(idx) }
  function handleDragOver(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const next = [...editOutlets]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    setEditOutlets(next)
    setDragIdx(idx)
  }
  function handleDragEnd() { setDragIdx(null) }

  function moveUp(idx) {
    if (idx === 0) return
    const next = [...editOutlets]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setEditOutlets(next)
  }
  function moveDown(idx) {
    if (idx === editOutlets.length - 1) return
    const next = [...editOutlets]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setEditOutlets(next)
  }

  async function removeOutletFromRoute(outletId) {
    try {
      await axios.delete(`${API_URL}/api/v1/admin/routes/${editRoute.id}/outlets/${outletId}`, { headers })
      setEditOutlets(prev => prev.filter(o => o.id !== outletId))
    } catch { setEditError('Failed to remove outlet.') }
  }

  async function togglePriority(outletId, current) {
    try {
      const endpoint = current
        ? `${API_URL}/api/v1/admin/routes/${editRoute.id}/outlets/${outletId}/unpriority`
        : `${API_URL}/api/v1/admin/routes/${editRoute.id}/outlets/${outletId}/priority`
      await axios.patch(endpoint, {}, { headers })
      setEditOutlets(prev => prev.map(o => o.id === outletId ? { ...o, is_high_priority: !current } : o))
    } catch { setEditError('Failed to update priority.') }
  }

  async function saveEdit() {
    setEditSaving(true)
    setEditError('')
    try {
      await axios.patch(`${API_URL}/api/v1/admin/routes/${editRoute.id}`,
        { route_name: editName, is_active: editActive }, { headers })
      await axios.put(`${API_URL}/api/v1/admin/routes/${editRoute.id}/sequence`,
        { outlet_ids: editOutlets.map(o => o.id) }, { headers })
      showToast('Route saved successfully', 'success')
      fetchRoutes()
      setView('list')
    } catch { setEditError('Failed to save route.') }
    finally { setEditSaving(false) }
  }

  function openGoogleMaps() {
    const withCoords = editOutlets.filter(o => o.latitude != null && o.longitude != null)
    if (withCoords.length === 0) return
    const LEG_SIZE = 10
    for (let i = 0; i < withCoords.length; i += LEG_SIZE) {
      const leg = withCoords.slice(i, i + LEG_SIZE)
      const origin      = `${leg[0].latitude},${leg[0].longitude}`
      const destination = `${leg[leg.length - 1].latitude},${leg[leg.length - 1].longitude}`
      const waypoints   = leg.slice(1, -1).map(o => `${o.latitude},${o.longitude}`).join('|')
      const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`
      setTimeout(() => window.open(url, '_blank'), Math.floor(i / LEG_SIZE) * 300)
    }
  }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function fmtDistance(m) {
    if (!m) return '—'
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
  }
  function fmtDuration(s) {
    if (!s) return '—'
    const mins = Math.round(s / 60)
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`
  }

  const [routeFilter, setRouteFilter] = useState('all')

  const filteredRoutes = routes.filter(r => {
    if (routeFilter === 'active')   return r.is_active === true
    if (routeFilter === 'inactive') return r.is_active === false
    return true
  })

  const plottable = outlets.filter(o => o.latitude != null && o.longitude != null)
  const minimapPoints = editOutlets.filter(o => o.latitude != null && o.longitude != null).map(o => [o.latitude, o.longitude])
  const skippedCount = builder.inPolygon.filter(o => !builder.sequence.some(s => s.id === o.id)).length
  const sequenceLine = builder.sequence.filter(o => o.latitude != null && o.longitude != null).map(o => [o.latitude, o.longitude])


  return (
    <div style={s.page}>
      <Sidebar activePage="routes" />
      <div style={s.content}>

        {/* ══════════════════════════════════
            ROUTE LIST
        ══════════════════════════════════ */}
        {view === 'list' && (
          <>
            <div style={s.header}>
            <div>
              <h1 style={s.pageTitle}>Routes</h1>
              <p style={s.pageSubtitle}>{filteredRoutes.length} of {routes.length} routes</p>
            </div>
            <div style={s.toolbar}>
              <div style={s.filterToggle}>
                {[['all','Both'],['active','Active only'],['inactive','Inactive only']].map(([val, label]) => (
                  <button
                    key={val}
                    style={{ ...s.filterBtn, ...(routeFilter === val ? s.filterBtnActive : {}) }}
                    onClick={() => setRouteFilter(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button style={s.createBtn} onClick={() => { setView('builder'); resetBuilder() }}>
                + New route
              </button>
            </div>
          </div>
          {error && <div style={s.errorBanner}>{error}</div>}

          <div style={s.tableWrapper}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['ID','Route name','Assigned rider','Outlets','Status','Created','Actions'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRoutes.map(route => (
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
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={s.editBtn} onClick={() => openEdit(route.id)}>Edit</button>
                        <button style={s.dupBtn} onClick={() => duplicateRoute(route.id)}>⧉ Duplicate</button>
                        <button style={s.delBtn} onClick={() => deleteRoute(route.id)}>✕ Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRoutes.length === 0 && !loading && (
              <div style={s.emptyState}>No routes found.</div>
            )}
          </div>
        </>
      )}

        {/* ══════════════════════════════════
            EDIT ROUTE
        ══════════════════════════════════ */}
        {view === 'edit' && editRoute && (
          <>
            <div style={s.header}>
              <div>
                <h1 style={s.pageTitle}>Edit Route</h1>
                <p style={s.pageSubtitle}>{editRoute.rider_name ?? 'No rider assigned'} · {editOutlets.length} outlets</p>
              </div>
              <div style={s.toolbar}>
                <button style={s.cancelBtn} onClick={() => setView('list')}>← Back</button>
                <button style={{ ...s.createBtn, opacity: editSaving ? 0.6 : 1 }}
                  disabled={editSaving} onClick={saveEdit}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
            {editError && <div style={s.errorBanner}>{editError}</div>}

            <div style={s.editLayout}>
              {/* Meta */}
              <div style={s.editMeta}>
                <p style={s.sectionLabel}>Route details</p>
                <div style={s.fieldGroup}>
                  <label style={s.fieldLabel}>Route name</label>
                  <input style={s.input} value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.fieldLabel}>Status</label>
                  <select style={s.input} value={String(editActive)}
                    onChange={e => setEditActive(e.target.value === 'true')}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.fieldLabel}>Assigned rider</label>
                  <select style={s.input} value={editRoute.rider_id ?? ''}
                    onChange={async e => {
                      const riderId = e.target.value || null
                      try {
                        await axios.patch(`${API_URL}/api/v1/admin/routes/${editRoute.id}`,
                          { assigned_rider_id: riderId ? parseInt(riderId, 10) : null },
                          { headers }
                        )
                        setEditRoute(r => ({ ...r, rider_id: riderId, rider_name: riders.find(r => r.id === parseInt(riderId))?.full_name ?? null }))
                      } catch { setEditError('Failed to update rider.') }
                    }}>
                    <option value="">No rider assigned</option>
                    {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </select>
                </div>
                <div style={s.divider} />
                <p style={s.sectionLabel}>Stats</p>
                <div style={s.statRow}><span style={s.statLabel}>Total outlets</span><span style={s.statVal}>{editOutlets.length}</span></div>
                <div style={s.statRow}><span style={s.statLabel}>High priority</span><span style={s.statVal}>{editOutlets.filter(o => o.is_high_priority).length}</span></div>
                {osrmStats && <>
                  <div style={s.statRow}><span style={s.statLabel}>Est. distance</span><span style={s.statVal}>{fmtDistance(osrmStats.distance_meters)}</span></div>
                  <div style={s.statRow}><span style={s.statLabel}>Est. drive time</span><span style={s.statVal}>{fmtDuration(osrmStats.duration_seconds)}</span></div>
                </>}
                <div style={s.divider} />
                <p style={s.sectionLabel}>Export</p>
                <button style={s.gmapsBtn} onClick={openGoogleMaps}>
                  🗺 Open in Google Maps
                </button>
                <p style={s.exportHint}>
                  {editOutlets.filter(o => o.latitude != null).length > 10
                    ? `${Math.ceil(editOutlets.filter(o => o.latitude != null).length / 10)} legs`
                    : 'Full route in one tab'}
                </p>
                <div style={s.divider} />
                <p style={s.hintText}>Drag ⠿ to reorder. ↑↓ for precise moves. ★ toggles priority.</p>
              </div>

              {/* Minimap */}
              <div style={s.minimapPane}>
                <div style={s.minimapHeader}>
                  <p style={s.sectionLabel}>Route map</p>
                  <div style={s.minimapControls}>
                    <button
                      style={{ ...s.toggleBtn, ...(showOsrm ? s.toggleBtnActive : {}) }}
                      onClick={() => setShowOsrm(v => !v)}>
                      {osrmLoading ? '⏳' : '🛣'} Street routing
                    </button>
                    {osrmError && <span style={s.osrmErrorBadge} title={osrmError}>⚠ {osrmError}</span>}
                  </div>
                </div>
                <div style={s.minimapContainer}>
                  {minimapPoints.length === 0 ? (
                    <div style={s.minimapEmpty}>
                      <span style={s.minimapEmptyIcon}>📍</span>
                      <span style={s.minimapEmptyText}>No outlets with coordinates</span>
                    </div>
                  ) : (
                    <MapContainer key="builder-map" center={minimapPoints[0] ?? SAN_JUAN} zoom={14}
                      style={{ width: '100%', height: '100%' }}>
                      <TileLayer
                        url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
                        attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
                      />
                      <FitBounds points={minimapPoints} />
                      {minimapPoints.length > 1 && (
                        <Polyline positions={minimapPoints} color="#f97316" weight={1.5} opacity={0.5} dashArray="5 5" />
                      )}
                      {showOsrm && osrmCoords && osrmCoords.length > 1 && (
                        <Polyline positions={osrmCoords} color="#2563eb" weight={3} opacity={0.75} />
                      )}
                      {editOutlets.filter(o => o.latitude != null && o.longitude != null).map((outlet, idx) => (
                        <CircleMarker key={outlet.id}
                          center={[outlet.latitude, outlet.longitude]}
                          radius={outlet.is_high_priority ? 10 : 8}
                          color={outlet.is_high_priority ? '#dc2626' : '#f97316'}
                          fillColor={outlet.is_high_priority ? '#dc2626' : '#f97316'}
                          fillOpacity={0.9} weight={2}>
                          <Tooltip permanent direction="top" offset={[0, -8]}>
                            <span style={{ fontSize: '10px', fontWeight: '700' }}>{idx + 1}</span>
                          </Tooltip>
                        </CircleMarker>
                      ))}
                    </MapContainer>
                  )}
                  {osrmLoading && (
                    <div style={s.osrmLoadingOverlay}>
                      <div style={s.osrmLoadingBadge}>⏳ Computing street route…</div>
                    </div>
                  )}
                </div>
                {minimapPoints.length > 0 && (
                  <div style={s.minimapLegend}>
                    <LegendItem color="#f97316" label="Outlet" />
                    <LegendItem color="#dc2626" label="High priority" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#f97316" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
                      <span style={{ fontSize: '11px', color: '#374151' }}>As the crow flies</span>
                    </div>
                    {showOsrm && osrmCoords && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#2563eb" strokeWidth="3" /></svg>
                        <span style={{ fontSize: '11px', color: '#374151' }}>Street route</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sequence */}
              <div style={s.editSequence}>
                <div style={s.sequenceHeader}>
                  <p style={s.sectionLabel}>Outlet sequence</p>
                  <span style={s.countPill}>{editOutlets.length} / 80</span>
                </div>
                <div style={s.sequenceList}>
                  {editOutlets.map((outlet, idx) => (
                    <div key={outlet.id} draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      style={{
                        ...s.sequenceRow,
                        ...(dragIdx === idx ? s.sequenceRowDragging : {}),
                        ...(outlet.is_high_priority ? s.sequenceRowHP : {}),
                      }}>
                      <span style={s.dragHandle}>⠿</span>
                      <span style={{ ...s.seqNum, ...(outlet.is_high_priority ? s.seqNumHP : {}) }}>
                        {idx + 1}
                      </span>
                      <div style={s.seqInfo}>
                        <p style={s.seqName}>{outlet.outlet_name}</p>
                        <p style={s.seqMeta}>{outlet.outlet_barangay ?? outlet.outlet_formaladdress ?? '—'}</p>
                      </div>
                      <div style={s.seqActions}>
                        <button style={s.arrowBtn} onClick={() => moveUp(idx)} disabled={idx === 0}>↑</button>
                        <button style={s.arrowBtn} onClick={() => moveDown(idx)} disabled={idx === editOutlets.length - 1}>↓</button>
                        <button style={{ ...s.priorityBtn, ...(outlet.is_high_priority ? s.priorityBtnActive : {}) }}
                          onClick={() => togglePriority(outlet.id, outlet.is_high_priority)}>★</button>
                        <button style={s.removeBtn} onClick={() => removeOutletFromRoute(outlet.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                  {editOutlets.length === 0 && <div style={s.emptyState}>No outlets in this route.</div>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════
            ROUTE BUILDER
        ══════════════════════════════════ */}
        {view === 'builder' && (
          <>
            <div style={s.header}>
              <div>
                <h1 style={s.pageTitle}>Route Builder</h1>
                <p style={s.pageSubtitle}>
                  {builder.step === 1
                    ? 'Step 1 — Draw a polygon to define your route area'
                    : `Step 2 — Click outlets in the order the rider should visit them (${builder.sequence.length} selected)`}
                </p>
              </div>
              <button style={s.cancelBtn} onClick={() => { setView('list'); resetBuilder() }}>
                ← Back
              </button>
            </div>

            {/* Step indicator */}
            <div style={s.stepBar}>
              <div style={{ ...s.stepItem, ...(builder.step >= 1 ? s.stepItemActive : {}) }}>
                <span style={s.stepNum}>1</span>
                <span style={s.stepLabel}>Draw polygon</span>
              </div>
              <div style={s.stepLine} />
              <div style={{ ...s.stepItem, ...(builder.step >= 2 ? s.stepItemActive : {}) }}>
                <span style={s.stepNum}>2</span>
                <span style={s.stepLabel}>Click sequence</span>
              </div>
              <div style={s.stepLine} />
              <div style={{ ...s.stepItem, ...(builder.savedRouteId ? s.stepItemActive : {}) }}>
                <span style={s.stepNum}>3</span>
                <span style={s.stepLabel}>Save route</span>
              </div>
            </div>

            {builder.savedRouteId ? (
              <div style={s.successBlock}>
                <div style={s.successIcon}>✓</div>
                <p style={s.successTitle}>Route created</p>
                <p style={s.successSub}>Route #{builder.savedRouteId} has been assigned.</p>
                <button style={s.createBtn} onClick={() => { setView('list'); resetBuilder() }}>
                  View all routes
                </button>
                <button style={s.cancelBtn} onClick={resetBuilder}>Build another</button>
              </div>
            ) : (
              <div style={s.builderLayout}>

                {/* Map */}
                <div style={s.mapPane}>
                  <MapContainer key="builder-map" center={SAN_JUAN} zoom={14} style={{ width: '100%', height: '100%' }}>
                    <TileLayer
                      url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
                      attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
                    />

                    {/* Auto-fit to all active outlets on mount */}
                    <FitBounds points={plottable.map(o => [o.latitude, o.longitude])} />

                    {/* Polygon draw tool — always available */}
                    <DrawControl onPolygonDrawn={p => setPolygon(p)} />

                    {/* Sequence line — connects clicked outlets in order */}
                    {sequenceLine.length > 1 && (
                      <Polyline positions={sequenceLine} color="#f97316" weight={2.5} opacity={0.8} dashArray="6 4" />
                    )}

                    {/* All plottable outlets */}
                    {plottable.map(outlet => {
                      const isInPolygon  = builder.inPolygon.some(o => o.id === outlet.id)
                      const seqIdx       = builder.sequence.findIndex(o => o.id === outlet.id)
                      const isSequenced  = seqIdx !== -1
                      const isHP         = builder.highPriority.has(outlet.id)

                      // Color logic:
                      // - Outside polygon (or no polygon drawn): grey, small, not clickable visually
                      // - Inside polygon, not yet clicked: purple outline, medium
                      // - Inside polygon, clicked: orange filled, larger, numbered
                      let color, fillColor, fillOpacity, radius, weight
                      if (!polygon || !isInPolygon) {
                        color = '#9ca3af'; fillColor = '#9ca3af'; fillOpacity = 0.3; radius = 5; weight = 1
                      } else if (isSequenced) {
                        color = isHP ? '#dc2626' : '#f97316'
                        fillColor = isHP ? '#dc2626' : '#f97316'
                        fillOpacity = 0.9; radius = 10; weight = 2
                      } else {
                        color = '#6366f1'; fillColor = '#6366f1'; fillOpacity = 0.5; radius = 7; weight = 1.5
                      }

                      return (
                        <CircleMarker
                          key={`${outlet.id}-${isInPolygon}-${isSequenced}-${isHP}`}
                          center={[outlet.latitude, outlet.longitude]}
                          radius={radius}
                          color={color}
                          fillColor={fillColor}
                          fillOpacity={fillOpacity}
                          weight={weight}
                          eventHandlers={{
                            click: () => handleOutletClick(outlet),
                          }}
                        >
                          {isSequenced && (
                            <Tooltip permanent direction="top" offset={[0, -10]}>
                              <span style={{ fontSize: '10px', fontWeight: '800' }}>
                                {seqIdx + 1}
                              </span>
                            </Tooltip>
                          )}
                          {isInPolygon && !isSequenced && (
                            <Tooltip direction="top" offset={[0, -8]}>
                              <span style={{ fontSize: '11px' }}>{outlet.outlet_name}</span>
                            </Tooltip>
                          )}
                        </CircleMarker>
                      )
                    })}
                  </MapContainer>

                  {/* Map legend */}
                  <div style={s.mapLegend}>
                    <LegendItem color="#9ca3af" label="Outside area" />
                    <LegendItem color="#6366f1" label="In area — click to add" />
                    <LegendItem color="#f97316" label="Added to route" />
                    <LegendItem color="#dc2626" label="High priority" />
                  </div>

                  {/* Step 2 hint overlay */}
                  {builder.step === 2 && (
                    <div style={s.mapHintOverlay}>
                      <span style={s.mapHintText}>
                        Click purple pins to add them to your route in sequence order
                      </span>
                    </div>
                  )}
                </div>

                {/* Config panel */}
                <div style={s.configPane}>
                  <div style={s.configSection}>
                    <p style={s.sectionLabel}>Route details</p>
                    <input style={s.input}
                      placeholder="Route name e.g. San Juan North — Tuesday"
                      value={builder.routeName}
                      onChange={e => setBuilder(b => ({ ...b, routeName: e.target.value }))} />
                    <select style={s.input} value={builder.assignedRider}
                      onChange={e => setBuilder(b => ({ ...b, assignedRider: e.target.value }))}>
                      <option value="">No rider assigned (save for later)</option>
                      {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                    </select>
                  </div>

                  <div style={s.configSection}>
                    <div style={s.sequenceHeader}>
                      <p style={s.sectionLabel}>Sequence</p>
                      <span style={s.countPill}>{builder.sequence.length} / 80</span>
                    </div>

                    {builder.step === 1 && (
                      <p style={s.hintText}>Draw a polygon on the map first to define your route area.</p>
                    )}

                    {builder.step === 2 && builder.sequence.length === 0 && (
                      <p style={s.hintText}>
                        {builder.inPolygon.length} outlet{builder.inPolygon.length !== 1 ? 's' : ''} inside your area.
                        Click them on the map in the order the rider should visit.
                      </p>
                    )}

                    {builder.step === 2 && skippedCount > 0 && builder.sequence.length > 0 && (
                      <div style={s.skipInfo}>
                        <span style={s.skipDot} />
                        {skippedCount} outlet{skippedCount !== 1 ? 's' : ''} in area not yet added
                      </div>
                    )}

                    <div style={s.outletList}>
                      {builder.sequence.map((outlet, idx) => (
                        <div key={outlet.id} style={s.outletRow}>
                          <span style={s.outletSeq}>{idx + 1}</span>
                          <div style={s.seqInfo}>
                            <p style={s.seqName}>{outlet.outlet_name}</p>
                            <p style={s.seqMeta}>{outlet.outlet_barangay ?? '—'}</p>
                          </div>
                          <div style={s.seqActions}>
                            <button
                              style={{ ...s.priorityBtn, ...(builder.highPriority.has(outlet.id) ? s.priorityBtnActive : {}) }}
                              onClick={() => {
                                const next = new Set(builder.highPriority)
                                next.has(outlet.id) ? next.delete(outlet.id) : next.add(outlet.id)
                                setBuilder(b => ({ ...b, highPriority: next }))
                              }}>★</button>
                            <button style={s.removeBtn}
                              onClick={() => handleOutletClick(outlet)}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {builder.sequence.length > 0 && (
                      <button style={s.clearBtn}
                        onClick={() => setBuilder(b => ({ ...b, sequence: [], highPriority: new Set() }))}>
                        Clear sequence
                      </button>
                    )}
                  </div>

                  {builder.saveError && <div style={{ ...s.errorBanner, margin: '0 16px' }}>{builder.saveError}</div>}

                  <div style={{ padding: '16px' }}>
                    <button
                      style={{
                        ...s.createBtn,
                        width: '100%',
                        padding: '11px',
                        opacity: builder.saving || builder.step === 1 || builder.sequence.length === 0 ? 0.5 : 1,
                        cursor: builder.saving || builder.step === 1 || builder.sequence.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                      disabled={builder.saving || builder.step === 1 || builder.sequence.length === 0}
                      onClick={handleSubmitClick}
                    >
                      {builder.saving ? 'Creating…' : `Create route (${builder.sequence.length} outlets)`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Skip warning modal ── */}
      {builder.showSkipWarning && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>⚠ Skipped outlets</h2>
            </div>
            <div style={s.modalBody}>
              <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>
                <strong>{skippedCount} outlet{skippedCount !== 1 ? 's' : ''}</strong> inside your polygon {skippedCount !== 1 ? 'were' : 'was'} not added to the sequence.
              </p>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '8px 0 0' }}>
                These outlets will not be included in the route. Continue with {builder.sequence.length} outlet{builder.sequence.length !== 1 ? 's' : ''} only, or go back and add the missing ones.
              </p>
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn}
                onClick={() => setBuilder(b => ({ ...b, showSkipWarning: false }))}>
                Go back and add them
              </button>
              <button style={s.createBtn} onClick={submitRoute}>
                Continue with {builder.sequence.length} outlets
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          ...s.toast,
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          borderColor: toast.type === 'success' ? '#bbf7d0' : '#fecaca',
          color: toast.type === 'success' ? '#15803d' : '#b91c1c',
        }}>
          ✓ {toast.message}
        </div>
      )}
    </div>
  )
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: '11px', color: '#374151' }}>{label}</span>
    </div>
  )
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const s = {
  page:             { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#f9fafb' },
  content:          { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box', overflow: 'hidden' },

  header:           { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px', gap: '16px', flexWrap: 'wrap' },
  pageTitle:        { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle:     { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  toolbar:          { display: 'flex', gap: '10px' },
  createBtn:        { padding: '9px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn:        { padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  errorBanner:      { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '12px' },
  clearBtn:         { padding: '6px 10px', fontSize: '12px', color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', width: '100%' },

  // Step bar
  stepBar:          { display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '0' },
  stepItem:         { display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.4 },
  stepItemActive:   { opacity: 1 },
  stepNum:          { width: '22px', height: '22px', borderRadius: '50%', background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  stepLabel:        { fontSize: '12px', fontWeight: '600', color: '#374151' },
  stepLine:         { flex: 1, height: '1px', background: '#e5e7eb', margin: '0 10px' },

  tableWrapper:     { flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' },
  table:            { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:               { padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  tr:               { borderBottom: '1px solid #f3f4f6' },
  td:               { padding: '10px 14px', color: '#111827', verticalAlign: 'middle' },
  editBtn:          { padding: '4px 12px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: 'pointer', color: '#374151' },
  activeBadge:      { padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: '#dcfce7', color: '#15803d' },
  inactiveBadge:    { padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', color: '#6b7280' },
  emptyState:       { padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },

  // Edit
  editLayout:       { display: 'flex', flex: 1, gap: '12px', overflow: 'hidden' },
  editMeta:         { width: '210px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
  divider:          { height: '1px', background: '#f3f4f6', flexShrink: 0 },
  sectionLabel:     { fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  fieldGroup:       { display: 'flex', flexDirection: 'column', gap: '5px' },
  fieldLabel:       { fontSize: '12px', fontWeight: '600', color: '#374151' },
  input:            { padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#111827', width: '100%', boxSizing: 'border-box' },
  statRow:          { display: 'flex', justifyContent: 'space-between', fontSize: '12px' },
  statLabel:        { color: '#6b7280' },
  statVal:          { fontWeight: '600', color: '#111827' },
  hintText:         { fontSize: '11px', color: '#9ca3af', margin: 0, lineHeight: '1.6' },
  gmapsBtn:         { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', width: '100%', boxSizing: 'border-box' },
  exportHint:       { fontSize: '10px', color: '#9ca3af', margin: 0 },

  minimapPane:      { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  minimapHeader:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, gap: '8px' },
  minimapControls:  { display: 'flex', alignItems: 'center', gap: '8px' },
  toggleBtn:        { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '12px', fontWeight: '600', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff', color: '#6b7280', cursor: 'pointer' },
  toggleBtnActive:  { background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' },
  osrmErrorBadge:   { fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '5px', padding: '3px 8px' },
  minimapContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  minimapEmpty:     { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb' },
  minimapEmptyIcon: { fontSize: '28px', opacity: 0.4 },
  minimapEmptyText: { fontSize: '12px', color: '#9ca3af' },
  osrmLoadingOverlay: { position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, pointerEvents: 'none' },
  osrmLoadingBadge: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', color: '#6b7280', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  minimapLegend:    { display: 'flex', gap: '12px', alignItems: 'center', padding: '7px 14px', borderTop: '1px solid #f3f4f6', flexShrink: 0, flexWrap: 'wrap' },

  editSequence:     { width: '270px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sequenceHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  countPill:        { background: '#f97316', color: '#fff', borderRadius: '99px', padding: '2px 10px', fontSize: '11px', fontWeight: '700' },
  sequenceList:     { flex: 1, overflowY: 'auto', padding: '8px' },
  sequenceRow:      { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', borderRadius: '7px', border: '1px solid #f3f4f6', marginBottom: '5px', background: '#fff', cursor: 'grab', userSelect: 'none' },
  sequenceRowDragging: { opacity: 0.5, background: '#fff7ed', borderColor: '#fed7aa' },
  sequenceRowHP:    { borderColor: '#fcd34d', background: '#fffbeb' },
  dragHandle:       { fontSize: '14px', color: '#d1d5db', cursor: 'grab', flexShrink: 0 },
  seqNum:           { width: '20px', height: '20px', borderRadius: '50%', background: '#f3f4f6', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  seqNumHP:         { background: '#fcd34d', color: '#92400e' },
  seqInfo:          { flex: 1, minWidth: 0 },
  seqName:          { fontSize: '12px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  seqMeta:          { fontSize: '11px', color: '#9ca3af', margin: 0 },
  seqActions:       { display: 'flex', gap: '3px', flexShrink: 0 },
  arrowBtn:         { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  priorityBtn:      { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  priorityBtnActive:{ background: '#fef3c7', borderColor: '#fcd34d', color: '#d97706' },
  removeBtn:        { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', fontSize: '10px', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },

  // Builder
  builderLayout:    { display: 'flex', flex: 1, gap: '12px', overflow: 'hidden' },
  mapPane:          { flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' },
  mapLegend:        { position: 'absolute', bottom: '12px', left: '12px', zIndex: 1000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  mapHintOverlay:   { position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, pointerEvents: 'none' },
  mapHintText:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', color: '#374151', fontWeight: '500', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', whiteSpace: 'nowrap' },

  configPane:       { width: '300px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  configSection:    { padding: '16px', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '10px' },
  outletList:       { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' },
  outletRow:        { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #f3f4f6' },
  outletSeq:        { width: '20px', height: '20px', borderRadius: '50%', background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  skipInfo:         { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '6px 10px' },
  skipDot:          { width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 },

  successBlock:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  successIcon:      { width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700' },
  successTitle:     { fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 },
  successSub:       { fontSize: '13px', color: '#6b7280', margin: 0 },

  modalOverlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:            { background: '#fff', borderRadius: '12px', width: '480px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' },
  modalHeader:      { padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  modalTitle:       { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  modalBody:        { padding: '20px 24px' },
  modalFooter:      { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px', borderTop: '1px solid #f3f4f6' },

  toast:            { position: 'fixed', bottom: '24px', right: '24px', zIndex: 3000, padding: '12px 20px', borderRadius: '10px', border: '1px solid', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
  dupBtn: { padding: '4px 10px', fontSize: '12px', fontWeight: '600', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '5px', cursor: 'pointer', color: '#1d4ed8' },
  delBtn: { padding: '4px 10px', fontSize: '12px', fontWeight: '600', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '5px', cursor: 'pointer', color: '#b91c1c' },
  filterToggle:   { display: 'flex', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' },
  filterBtn:      { padding: '7px 14px', fontSize: '12px', fontWeight: '600', border: 'none', background: '#fff', color: '#6b7280', cursor: 'pointer', borderRight: '1px solid #e5e7eb' },
  filterBtnActive:{ background: '#f97316', color: '#fff' },


}