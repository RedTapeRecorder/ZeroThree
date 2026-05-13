import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet'
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
        polyline: false, rectangle: false, circle: false,
        circlemarker: false, marker: false,
      },
      edit: { featureGroup: drawnLayers, remove: true },
    })

    map.addControl(drawControl)
    map.on(L.Draw.Event.CREATED, e => {
      drawnLayers.clearLayers()
      drawnLayers.addLayer(e.layer)
      onPolygonDrawn(e.layer.getLatLngs()[0])
    })
    map.on(L.Draw.Event.DELETED, () => onPolygonDrawn(null))

    return () => {
      map.removeControl(drawControl)
      map.removeLayer(drawnLayers)
      map.off(L.Draw.Event.CREATED)
      map.off(L.Draw.Event.DELETED)
    }
  }, [map, onPolygonDrawn])

  return null
}

// ── Auto-fit map bounds to outlet points ─────
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 16)
      return
    }
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [32, 32] })
  }, [points, map])
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
  polygon: null, selected: [], routeName: '',
  assignedRider: '', highPriority: new Set(),
  saving: false, saveError: '', savedRouteId: null,
}

export default function RoutesView() {
  const [view, setView]               = useState('list')
  const [routes, setRoutes]           = useState([])
  const [outlets, setOutlets]         = useState([])
  const [riders, setRiders]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  const [builder, setBuilder]         = useState(EMPTY_BUILDER)

  const [editRoute, setEditRoute]     = useState(null)
  const [editName, setEditName]       = useState('')
  const [editActive, setEditActive]   = useState(true)
  const [editOutlets, setEditOutlets] = useState([])
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState('')
  const [dragIdx, setDragIdx]         = useState(null)
  const [toast, setToast]             = useState(null)

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetchRoutes()
    fetchOutlets()
    fetchRiders()
  }, [])

  useEffect(() => {
    if (!builder.polygon) { setBuilder(b => ({ ...b, selected: [] })); return }
    const inside = outlets.filter(o =>
      o.latitude != null && o.longitude != null &&
      pointInPolygon({ lat: o.latitude, lng: o.longitude }, builder.polygon)
    )
    setBuilder(b => ({ ...b, selected: inside }))
  }, [builder.polygon, outlets])

  async function fetchRoutes() {
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/routes`, { headers })
      const data = Array.isArray(res.data) ? res.data : res.data.routes ?? []
      setRoutes(data)
    } catch { setError('Failed to load routes.') }
    finally { setLoading(false) }
  }

  async function fetchOutlets() {
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/outlets`, { headers })
      setOutlets(res.data.filter(o => o.outlet_status === 'ACTIVE'|| o.outlet_status === 'INACTIVE'))
    } catch {}
  }

  async function fetchRiders() {
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/riders`, { headers })
      setRiders(res.data.filter(r => r.status === 'active'))
    } catch {}
  }

  async function openEdit(routeId) {
    setEditError('')
    try {
      const res = await axios.get(`${API_URL}/api/v1/admin/routes/${routeId}`, { headers })
      const r = res.data
      setEditRoute(r)
      setEditName(r.route_name)
      setEditActive(r.is_active)
      setEditOutlets(r.outlets)
      setView('edit')
    } catch { setError('Failed to load route.') }
  }

  // ── Drag to reorder ───────────────────────
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
      await axios.delete(
        `${API_URL}/api/v1/admin/routes/${editRoute.id}/outlets/${outletId}`,
        { headers }
      )
      setEditOutlets(prev => prev.filter(o => o.id !== outletId))
    } catch { setEditError('Failed to remove outlet.') }
  }

  async function togglePriority(outletId, current) {
    try {
      const endpoint = current
        ? `${API_URL}/api/v1/admin/routes/${editRoute.id}/outlets/${outletId}/unpriority`
        : `${API_URL}/api/v1/admin/routes/${editRoute.id}/outlets/${outletId}/priority`
      await axios.patch(endpoint, {}, { headers })
      setEditOutlets(prev =>
        prev.map(o => o.id === outletId ? { ...o, is_high_priority: !current } : o)
      )
    } catch { setEditError('Failed to update priority.') }
  }

  async function saveEdit() {
    setEditSaving(true)
    setEditError('')
    try {
      await axios.patch(
        `${API_URL}/api/v1/admin/routes/${editRoute.id}`,
        { route_name: editName, is_active: editActive },
        { headers }
      )
      await axios.put(
        `${API_URL}/api/v1/admin/routes/${editRoute.id}/sequence`,
        { outlet_ids: editOutlets.map(o => o.id) },
        { headers }
      )
      showToast('Route saved successfully', 'success')
      fetchRoutes()
      setView('list')
    } catch { setEditError('Failed to save route.') }
    finally { setEditSaving(false) }
  }

  async function submitRoute() {
    const { routeName, assignedRider, selected, highPriority } = builder
    if (!routeName.trim()) { setBuilder(b => ({ ...b, saveError: 'Route name is required.' })); return }
    if (!assignedRider)    { setBuilder(b => ({ ...b, saveError: 'Assign a rider.' })); return }
    if (selected.length === 0) { setBuilder(b => ({ ...b, saveError: 'No outlets selected. Draw a polygon.' })); return }
    if (selected.length > 80)  { setBuilder(b => ({ ...b, saveError: 'Maximum 80 outlets per route.' })); return }

    setBuilder(b => ({ ...b, saving: true, saveError: '' }))
    try {
      const res = await axios.post(`${API_URL}/api/v1/admin/routes`, {
        rider_id:   parseInt(assignedRider, 10),
        route_name: routeName,
        outlet_ids: selected.map(o => o.id),
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

  function resetBuilder() { setBuilder(EMPTY_BUILDER) }

  function showToast(message, type) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Minimap data ─────────────────────────
  // Only outlets that have coordinates, in sequence order
  const minimapPoints = editOutlets
    .filter(o => o.latitude != null && o.longitude != null)
    .map(o => [o.latitude, o.longitude])

  // Polyline connects them in sequence order
  const routeLine = minimapPoints

  const plottable = outlets.filter(o => o.latitude != null && o.longitude != null)

  return (
    <div style={s.page}>
      <Sidebar activePage="routes" />

      <div style={s.content}>

        {/* ══════════════════════════════════════
            ROUTE LIST
        ══════════════════════════════════════ */}
        {view === 'list' && (
          <>
            <div style={s.header}>
              <div>
                <h1 style={s.pageTitle}>Routes</h1>
                <p style={s.pageSubtitle}>{routes.length} routes created</p>
              </div>
              <button style={s.createBtn} onClick={() => { setView('builder'); resetBuilder() }}>
                + New route
              </button>
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
                      <td style={s.td}>
                        <button style={s.editBtn} onClick={() => openEdit(route.id)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {routes.length === 0 && !loading && (
                <div style={s.emptyState}>No routes yet. Click "+ New route" to build one.</div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            EDIT ROUTE — three columns
        ══════════════════════════════════════ */}
        {view === 'edit' && editRoute && (
          <>
            <div style={s.header}>
              <div>
                <h1 style={s.pageTitle}>Edit Route</h1>
                <p style={s.pageSubtitle}>
                  {editRoute.rider_name} · {editOutlets.length} outlets
                </p>
              </div>
              <div style={s.toolbar}>
                <button style={s.cancelBtn} onClick={() => setView('list')}>← Back</button>
                <button
                  style={{ ...s.createBtn, opacity: editSaving ? 0.6 : 1 }}
                  disabled={editSaving}
                  onClick={saveEdit}
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>

            {editError && <div style={s.errorBanner}>{editError}</div>}

            <div style={s.editLayout}>

              {/* ── Column 1: Meta ── */}
              <div style={s.editMeta}>
                <p style={s.sectionLabel}>Route details</p>

                <div style={s.fieldGroup}>
                  <label style={s.fieldLabel}>Route name</label>
                  <input style={s.input} value={editName}
                    onChange={e => setEditName(e.target.value)} />
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
                  <input
                    style={{ ...s.input, background: '#f9fafb', color: '#6b7280' }}
                    value={editRoute.rider_name}
                    readOnly
                  />
                </div>

                <div style={s.divider} />

                <p style={s.sectionLabel}>Stats</p>
                <div style={s.statRow}>
                  <span style={s.statLabel}>Total outlets</span>
                  <span style={s.statVal}>{editOutlets.length}</span>
                </div>
                <div style={s.statRow}>
                  <span style={s.statLabel}>High priority</span>
                  <span style={s.statVal}>{editOutlets.filter(o => o.is_high_priority).length}</span>
                </div>
                <div style={s.statRow}>
                  <span style={s.statLabel}>On map</span>
                  <span style={s.statVal}>{minimapPoints.length}</span>
                </div>
                <div style={s.statRow}>
                  <span style={s.statLabel}>Created</span>
                  <span style={s.statVal}>{fmt(editRoute.created_at)}</span>
                </div>

                <div style={s.divider} />

                <p style={s.hintText}>
                  Drag ⠿ to reorder. Use ↑↓ for precise moves. ★ toggles high priority. Changes save when you click "Save changes".
                </p>
              </div>

              {/* ── Column 2: Minimap ── */}
              <div style={s.minimapPane}>
                <div style={s.minimapHeader}>
                  <p style={s.sectionLabel}>Route map</p>
                  <span style={s.minimapHint}>Outlets connected in sequence order</span>
                </div>

                <div style={s.minimapContainer}>
                  {minimapPoints.length === 0 ? (
                    <div style={s.minimapEmpty}>
                      <span style={s.minimapEmptyIcon}>📍</span>
                      <span style={s.minimapEmptyText}>No outlets with coordinates</span>
                    </div>
                  ) : (
                    <MapContainer
                      center={minimapPoints[0] ?? SAN_JUAN}
                      zoom={14}
                      style={{ width: '100%', height: '100%' }}
                      zoomControl={true}
                      scrollWheelZoom={true}
                    >
                      <TileLayer
                        url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
                        attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
                      />

                      {/* Auto-fit to all points */}
                      <FitBounds points={minimapPoints} />

                      {/* Route line connecting outlets in sequence */}
                      {routeLine.length > 1 && (
                        <Polyline
                          positions={routeLine}
                          color="#f97316"
                          weight={2.5}
                          opacity={0.7}
                          dashArray="6 4"
                        />
                      )}

                      {/* Outlet pins numbered by sequence */}
                      {editOutlets
                        .filter(o => o.latitude != null && o.longitude != null)
                        .map((outlet, idx) => (
                          <CircleMarker
                            key={outlet.id}
                            center={[outlet.latitude, outlet.longitude]}
                            radius={outlet.is_high_priority ? 10 : 8}
                            color={outlet.is_high_priority ? '#dc2626' : '#f97316'}
                            fillColor={outlet.is_high_priority ? '#dc2626' : '#f97316'}
                            fillOpacity={0.9}
                            weight={2}
                          >
                            <Tooltip permanent direction="top" offset={[0, -8]}
                              className="seq-label">
                              <span style={{ fontSize: '10px', fontWeight: '700' }}>
                                {idx + 1}
                              </span>
                            </Tooltip>
                          </CircleMarker>
                        ))}
                    </MapContainer>
                  )}
                </div>

                {/* Minimap legend */}
                {minimapPoints.length > 0 && (
                  <div style={s.minimapLegend}>
                    <LegendItem color="#f97316" label="Outlet" />
                    <LegendItem color="#dc2626" label="High priority" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="20" height="8">
                        <line x1="0" y1="4" x2="20" y2="4"
                          stroke="#f97316" strokeWidth="2"
                          strokeDasharray="5 3" />
                      </svg>
                      <span style={{ fontSize: '11px', color: '#374151' }}>Route path</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Column 3: Sequence list ── */}
              <div style={s.editSequence}>
                <div style={s.sequenceHeader}>
                  <p style={s.sectionLabel}>Outlet sequence</p>
                  <span style={s.countPill}>{editOutlets.length} / 80</span>
                </div>

                <div style={s.sequenceList}>
                  {editOutlets.map((outlet, idx) => (
                    <div
                      key={outlet.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      style={{
                        ...s.sequenceRow,
                        ...(dragIdx === idx ? s.sequenceRowDragging : {}),
                        ...(outlet.is_high_priority ? s.sequenceRowHP : {}),
                      }}
                    >
                      <span style={s.dragHandle} title="Drag to reorder">⠿</span>

                      <span style={{
                        ...s.seqNum,
                        ...(outlet.is_high_priority ? s.seqNumHP : {}),
                      }}>
                        {idx + 1}
                      </span>

                      <div style={s.seqInfo}>
                        <p style={s.seqName}>{outlet.outlet_name}</p>
                        <p style={s.seqMeta}>
                          {outlet.outlet_barangay ?? outlet.outlet_formaladdress ?? '—'}
                        </p>
                      </div>

                      <div style={s.seqActions}>
                        <button style={s.arrowBtn} onClick={() => moveUp(idx)}
                          disabled={idx === 0} title="Move up">↑</button>
                        <button style={s.arrowBtn} onClick={() => moveDown(idx)}
                          disabled={idx === editOutlets.length - 1} title="Move down">↓</button>
                        <button
                          style={{
                            ...s.priorityBtn,
                            ...(outlet.is_high_priority ? s.priorityBtnActive : {}),
                          }}
                          onClick={() => togglePriority(outlet.id, outlet.is_high_priority)}
                          title="Toggle high priority"
                        >★</button>
                        <button style={s.removeBtn}
                          onClick={() => removeOutletFromRoute(outlet.id)}
                          title="Remove from route">✕</button>
                      </div>
                    </div>
                  ))}

                  {editOutlets.length === 0 && (
                    <div style={s.emptyState}>No outlets in this route.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            ROUTE BUILDER
        ══════════════════════════════════════ */}
        {view === 'builder' && (
          <>
            <div style={s.header}>
              <div>
                <h1 style={s.pageTitle}>Route Builder</h1>
                <p style={s.pageSubtitle}>Draw a polygon on the map to select outlets</p>
              </div>
              <button style={s.cancelBtn} onClick={() => { setView('list'); resetBuilder() }}>
                ← Back to routes
              </button>
            </div>

            <div style={s.builderLayout}>
              <div style={s.mapPane}>
                <MapContainer center={SAN_JUAN} zoom={14} style={{ width: '100%', height: '100%' }}>
                  <TileLayer
                    url={`https://{s}.tile.thunderforest.com/neighbourhood/{z}/{x}/{y}.png?apikey=${THUNDERFOREST_KEY}`}
                    attribution='&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
                  />
                  <DrawControl onPolygonDrawn={p => setBuilder(b => ({ ...b, polygon: p }))} />
                  {plottable.map(outlet => {
                    const isSel = builder.selected.some(o => o.id === outlet.id)
                    const isHP  = builder.highPriority.has(outlet.id)
                    return (
                      <CircleMarker
                        key={outlet.id}
                        center={[outlet.latitude, outlet.longitude]}
                        radius={isSel ? 9 : 6}
                        color={isHP ? '#dc2626' : isSel ? '#f97316' : '#9ca3af'}
                        fillColor={isHP ? '#dc2626' : isSel ? '#f97316' : '#9ca3af'}
                        fillOpacity={isSel ? 0.9 : 0.4}
                        weight={isSel ? 2 : 1}
                      />
                    )
                  })}
                </MapContainer>

                <div style={s.mapLegend}>
                  <LegendItem color="#9ca3af" label="Unselected" />
                  <LegendItem color="#f97316" label="Selected" />
                  <LegendItem color="#dc2626" label="High priority" />
                </div>
              </div>

              <div style={s.configPane}>
                {builder.savedRouteId ? (
                  <div style={s.successBlock}>
                    <div style={s.successIcon}>✓</div>
                    <p style={s.successTitle}>Route created</p>
                    <p style={s.successSub}>Route #{builder.savedRouteId} assigned.</p>
                    <button style={s.createBtn}
                      onClick={() => { setView('list'); resetBuilder() }}>
                      View all routes
                    </button>
                    <button style={s.cancelBtn} onClick={resetBuilder}>
                      Build another
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={s.configSection}>
                      <p style={s.sectionLabel}>Route details</p>
                      <input
                        style={s.input}
                        placeholder="Route name e.g. San Juan North — Tuesday"
                        value={builder.routeName}
                        onChange={e => setBuilder(b => ({ ...b, routeName: e.target.value }))}
                      />
                      <select style={s.input} value={builder.assignedRider}
                        onChange={e => setBuilder(b => ({ ...b, assignedRider: e.target.value }))}>
                        <option value="">Assign to rider…</option>
                        {riders.map(r => (
                          <option key={r.id} value={r.id}>{r.full_name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={s.configSection}>
                      <div style={s.sequenceHeader}>
                        <p style={s.sectionLabel}>Selected outlets</p>
                        <span style={s.countPill}>{builder.selected.length} / 80</span>
                      </div>

                      {builder.selected.length === 0 && (
                        <p style={s.hintText}>
                          Use the polygon tool in the top-left of the map to draw around outlets.
                        </p>
                      )}
                      {builder.selected.length > 80 && (
                        <div style={s.warnBox}>Too many outlets. Maximum is 80.</div>
                      )}

                      <div style={s.outletList}>
                        {builder.selected.map((outlet, idx) => (
                          <div key={outlet.id} style={s.outletRow}>
                            <span style={s.outletSeq}>{idx + 1}</span>
                            <div style={s.seqInfo}>
                              <p style={s.seqName}>{outlet.outlet_name}</p>
                              <p style={s.seqMeta}>{outlet.outlet_barangay ?? '—'}</p>
                            </div>
                            <div style={s.seqActions}>
                              <button
                                style={{
                                  ...s.priorityBtn,
                                  ...(builder.highPriority.has(outlet.id) ? s.priorityBtnActive : {}),
                                }}
                                onClick={() => {
                                  const next = new Set(builder.highPriority)
                                  next.has(outlet.id) ? next.delete(outlet.id) : next.add(outlet.id)
                                  setBuilder(b => ({ ...b, highPriority: next }))
                                }}
                                title="Flag high priority"
                              >★</button>
                              <button style={s.removeBtn}
                                onClick={() => setBuilder(b => ({
                                  ...b,
                                  selected: b.selected.filter(o => o.id !== outlet.id),
                                }))}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {builder.saveError && <div style={s.errorBanner}>{builder.saveError}</div>}

                    <button
                      style={{
                        ...s.createBtn,
                        margin: '0 16px 16px',
                        opacity: builder.saving ? 0.6 : 1,
                        cursor: builder.saving ? 'not-allowed' : 'pointer',
                      }}
                      disabled={builder.saving}
                      onClick={submitRoute}
                    >
                      {builder.saving
                        ? 'Creating…'
                        : `Create route (${builder.selected.length} outlets)`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

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
      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: '11px', color: '#374151' }}>{label}</span>
    </div>
  )
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const s = {
  page:           { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#f9fafb' },
  content:        { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box', overflow: 'hidden' },

  header:         { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' },
  pageTitle:      { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle:   { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  toolbar:        { display: 'flex', gap: '10px' },
  createBtn:      { padding: '9px 18px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn:      { padding: '9px 18px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  errorBanner:    { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', marginBottom: '12px' },

  tableWrapper:   { flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' },
  table:          { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:             { padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  tr:             { borderBottom: '1px solid #f3f4f6' },
  td:             { padding: '10px 14px', color: '#111827', verticalAlign: 'middle' },
  editBtn:        { padding: '4px 12px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: 'pointer', color: '#374151' },
  activeBadge:    { padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: '#dcfce7', color: '#15803d' },
  inactiveBadge:  { padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: '#f3f4f6', color: '#6b7280' },
  emptyState:     { padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },

  // Edit — three columns
  editLayout:     { display: 'flex', flex: 1, gap: '12px', overflow: 'hidden' },

  editMeta:       { width: '220px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
  divider:        { height: '1px', background: '#f3f4f6' },
  sectionLabel:   { fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  fieldGroup:     { display: 'flex', flexDirection: 'column', gap: '5px' },
  fieldLabel:     { fontSize: '12px', fontWeight: '600', color: '#374151' },
  input:          { padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#111827', width: '100%', boxSizing: 'border-box' },
  statRow:        { display: 'flex', justifyContent: 'space-between', fontSize: '12px' },
  statLabel:      { color: '#6b7280' },
  statVal:        { fontWeight: '600', color: '#111827' },
  hintText:       { fontSize: '11px', color: '#9ca3af', margin: 0, lineHeight: '1.6' },

  // Minimap column
  minimapPane:    { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  minimapHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  minimapHint:    { fontSize: '11px', color: '#9ca3af' },
  minimapContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  minimapEmpty:   { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#f9fafb' },
  minimapEmptyIcon: { fontSize: '28px', opacity: 0.4 },
  minimapEmptyText: { fontSize: '12px', color: '#9ca3af' },
  minimapLegend:  { display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 16px', borderTop: '1px solid #f3f4f6', flexShrink: 0, flexWrap: 'wrap' },

  // Sequence column
  editSequence:   { width: '280px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sequenceHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  countPill:      { background: '#f97316', color: '#fff', borderRadius: '99px', padding: '2px 10px', fontSize: '11px', fontWeight: '700' },
  sequenceList:   { flex: 1, overflowY: 'auto', padding: '8px' },

  sequenceRow:    { display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', borderRadius: '7px', border: '1px solid #f3f4f6', marginBottom: '5px', background: '#fff', cursor: 'grab', userSelect: 'none' },
  sequenceRowDragging: { opacity: 0.5, background: '#fff7ed', borderColor: '#fed7aa' },
  sequenceRowHP:  { borderColor: '#fcd34d', background: '#fffbeb' },
  dragHandle:     { fontSize: '14px', color: '#d1d5db', cursor: 'grab', flexShrink: 0 },
  seqNum:         { width: '20px', height: '20px', borderRadius: '50%', background: '#f3f4f6', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  seqNumHP:       { background: '#fcd34d', color: '#92400e' },
  seqInfo:        { flex: 1, minWidth: 0 },
  seqName:        { fontSize: '12px', fontWeight: '600', color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  seqMeta:        { fontSize: '11px', color: '#9ca3af', margin: 0 },
  seqActions:     { display: 'flex', gap: '3px', flexShrink: 0 },
  arrowBtn:       { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '11px', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  priorityBtn:    { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  priorityBtnActive: { background: '#fef3c7', borderColor: '#fcd34d', color: '#d97706' },
  removeBtn:      { width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', fontSize: '10px', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },

  // Builder
  builderLayout:  { display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' },
  mapPane:        { flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' },
  mapLegend:      { position: 'absolute', bottom: '12px', left: '12px', zIndex: 1000, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  configPane:     { width: '300px', flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  configSection:  { padding: '16px', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '10px' },
  outletList:     { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' },
  outletRow:      { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #f3f4f6' },
  outletSeq:      { width: '20px', height: '20px', borderRadius: '50%', background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  warnBox:        { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#b91c1c' },

  successBlock:   { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', gap: '12px', flex: 1, justifyContent: 'center' },
  successIcon:    { width: '52px', height: '52px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700' },
  successTitle:   { fontSize: '16px', fontWeight: '700', color: '#111827', margin: 0 },
  successSub:     { fontSize: '13px', color: '#6b7280', textAlign: 'center', margin: 0 },

  toast:          { position: 'fixed', bottom: '24px', right: '24px', zIndex: 3000, padding: '12px 20px', borderRadius: '10px', border: '1px solid', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
}