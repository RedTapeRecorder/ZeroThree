import { useState, useEffect } from 'react'
import axios from 'axios'
import Sidebar from './Sidebar'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'

// ── Helpers ──────────────────────────────────
function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function OutcomeBadge({ outcome }) {
  const style = {
    delivered: { bg: '#dcfce7', text: '#15803d' },
    no_stock:  { bg: '#fff7ed', text: '#c2410c' },
    no_stop:   { bg: '#f3f4f6', text: '#6b7280' },
  }[outcome] ?? { bg: '#f3f4f6', text: '#6b7280' }

  return (
    <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600', background: style.bg, color: style.text }}>
      {outcome ?? '—'}
    </span>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={s.statCard}>
      <p style={s.statLabel}>{label}</p>
      <p style={{ ...s.statValue, color: color ?? '#111827' }}>{value}</p>
      {sub && <p style={s.statSub}>{sub}</p>}
    </div>
  )
}

// ────────────────────────────────────────────
export default function Dashboard() {
  const [visits, setVisits]         = useState([])
  const [unvisited, setUnvisited]   = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [today, setToday]           = useState('')

  const token = localStorage.getItem('zt_token')
  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    setError('')
    try {
      const [visitsRes, unvisitedRes, photosRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/admin/visits/today`, { headers }),
        axios.get(`${API_URL}/api/v1/admin/outlets/unvisited`, { headers }),
        axios.get(`${API_URL}/api/v1/admin/photos/pending`, { headers }),
      ])

      setVisits(visitsRes.data.visits ?? [])
      setToday(visitsRes.data.date ?? '')
      setUnvisited(unvisitedRes.data ?? [])
      setPendingCount(photosRes.data.count ?? 0)
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  // ── Derived stats ─────────────────────────
  const delivered  = visits.filter(v => v.outcome === 'delivered').length
  const noStock    = visits.filter(v => v.outcome === 'no_stock').length
  const noStop     = visits.filter(v => v.outcome === 'no_stop').length
  const totalUnits = visits.reduce((sum, v) => sum + (v.units_refilled ?? 0) + (v.units_sold_new ?? 0), 0)

  // ────────────────────────────────────────────
  return (
    <div style={s.page}>
      <Sidebar activePage="dashboard" />

      <div style={s.content}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <h1 style={s.pageTitle}>Dashboard</h1>
            <p style={s.pageSubtitle}>
              {today ? `Today — ${new Date(today).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` : 'Loading…'}
            </p>
          </div>
          <button style={s.refreshBtn} onClick={fetchAll} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {error && <div style={s.errorBanner}>{error}</div>}

        {/* ── Stat cards ── */}
        <div style={s.statRow}>
          <StatCard label="Visits today"    value={visits.length}   sub="all outcomes" />
          <StatCard label="Delivered"       value={delivered}        sub="with units logged" color="#15803d" />
          <StatCard label="No stock"        value={noStock}          sub="owner had no empties" color="#c2410c" />
          <StatCard label="No stop"         value={noStop}           sub="passed through" color="#6b7280" />
          <StatCard label="Units moved"     value={totalUnits}       sub="refills + new cans" color="#1d4ed8" />
          <StatCard
            label="Pending photos"
            value={pendingCount}
            sub={pendingCount > 0 ? 'awaiting review' : 'all clear'}
            color={pendingCount > 0 ? '#c2410c' : '#15803d'}
          />
          <StatCard
            label="Unvisited outlets"
            value={unvisited.length}
            sub="7+ days no visit"
            color={unvisited.length > 0 ? '#b45309' : '#15803d'}
          />
        </div>

        {/* ── Main content: visits + unvisited ── */}
        <div style={s.mainGrid}>

          {/* Today's visits table */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <p style={s.cardTitle}>Today's visit activity</p>
              <span style={s.cardCount}>{visits.length} visits</span>
            </div>

            {visits.length === 0 && !loading ? (
              <div style={s.emptyState}>No visits recorded today yet.</div>
            ) : (
              <div style={s.tableWrapper}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Outlet','Rider','Outcome','Arrived','Departed','Duration','Units'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map(visit => (
                      <tr key={visit.id} style={s.tr}>
                        <td style={s.td}>
                          <p style={s.outletName}>{visit.outlet?.name ?? '—'}</p>
                          <p style={s.outletMeta}>{visit.outlet?.barangay ?? ''}</p>
                        </td>
                        <td style={s.td}>{visit.rider?.name ?? '—'}</td>
                        <td style={s.td}><OutcomeBadge outcome={visit.outcome} /></td>
                        <td style={s.td}>{fmt(visit.arrived_at)}</td>
                        <td style={s.td}>{fmt(visit.departed_at)}</td>
                        <td style={s.td}>
                          {visit.duration_minutes != null
                            ? `${visit.duration_minutes} min`
                            : '—'}
                        </td>
                        <td style={s.td}>
                          {visit.outcome === 'delivered'
                            ? `${(visit.units_refilled ?? 0) + (visit.units_sold_new ?? 0)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right column */}
          <div style={s.rightCol}>

            {/* Pending photos alert */}
            {pendingCount > 0 && (
              <div style={s.alertCard}>
                <div style={s.alertIcon}>📷</div>
                <div style={s.alertBody}>
                  <p style={s.alertTitle}>{pendingCount} photo{pendingCount !== 1 ? 's' : ''} awaiting review</p>
                  <p style={s.alertSub}>Rider-submitted photos need your approval before they go live.</p>
                </div>
                <button style={s.alertBtn}
                  onClick={() => window.location.href = '/photos'}>
                  Review →
                </button>
              </div>
            )}

            {/* Unvisited outlets */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <p style={s.cardTitle}>Unvisited outlets</p>
                <span style={{
                  ...s.cardCount,
                  ...(unvisited.length > 0 ? s.cardCountWarn : {}),
                }}>
                  {unvisited.length} outlets
                </span>
              </div>

              {unvisited.length === 0 ? (
                <div style={s.emptyState}>
                  All active outlets have been visited in the last 7 days. ✓
                </div>
              ) : (
                <div style={s.unvisitedList}>
                  {unvisited.map(outlet => (
                    <div key={outlet.id} style={s.unvisitedRow}>
                      <div style={s.unvisitedInfo}>
                        <p style={s.outletName}>{outlet.outlet_name}</p>
                        <p style={s.outletMeta}>
                          {outlet.outlet_barangay ?? outlet.outlet_formaladdress ?? '—'}
                        </p>
                      </div>
                      <span style={s.unvisitedBadge}>7+ days</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────
const s = {
  page:         { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#f9fafb' },
  content:      { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', boxSizing: 'border-box', overflow: 'hidden', gap: '16px' },

  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  pageTitle:    { fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 },
  pageSubtitle: { fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' },
  refreshBtn:   { padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' },
  errorBanner:  { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c' },

  // Stat cards
  statRow:      { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  statCard:     { flex: '1 1 120px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px' },
  statLabel:    { fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' },
  statValue:    { fontSize: '26px', fontWeight: '700', color: '#111827', margin: 0, lineHeight: 1 },
  statSub:      { fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' },

  // Main grid
  mainGrid:     { display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' },

  // Card
  card:         { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 },
  cardHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  cardTitle:    { fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 },
  cardCount:    { fontSize: '12px', fontWeight: '600', color: '#9ca3af', background: '#f3f4f6', borderRadius: '99px', padding: '2px 10px' },
  cardCountWarn:{ color: '#b45309', background: '#fffbeb' },
  emptyState:   { padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' },

  // Visits table
  tableWrapper: { flex: 1, overflowY: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 },
  tr:           { borderBottom: '1px solid #f3f4f6' },
  td:           { padding: '9px 14px', color: '#111827', verticalAlign: 'middle' },
  outletName:   { fontSize: '13px', fontWeight: '500', color: '#111827', margin: 0 },
  outletMeta:   { fontSize: '11px', color: '#9ca3af', margin: '1px 0 0' },

  // Right column
  rightCol:     { width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' },

  // Alert card
  alertCard:    { background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' },
  alertIcon:    { fontSize: '22px', flexShrink: 0 },
  alertBody:    { flex: 1, minWidth: 0 },
  alertTitle:   { fontSize: '13px', fontWeight: '600', color: '#92400e', margin: 0 },
  alertSub:     { fontSize: '12px', color: '#b45309', margin: '2px 0 0' },
  alertBtn:     { padding: '6px 12px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 },

  // Unvisited list
  unvisitedList:  { overflowY: 'auto', flex: 1 },
  unvisitedRow:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid #f3f4f6', gap: '12px' },
  unvisitedInfo:  { flex: 1, minWidth: 0 },
  unvisitedBadge: { fontSize: '11px', fontWeight: '600', color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '99px', padding: '2px 8px', flexShrink: 0 },
}
