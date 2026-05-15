const NAV = [
  {
    section: 'Management',
    items: [
      { label: 'Riders',  icon: '👤', href: '/riders', key: 'riders' },
      { label: 'Routes',  icon: '🛵', href: '/routes', key: 'routes' },
      { label: 'Photo Review', icon: '📷', href: '/photos', key: 'photos' },
    ],
  },
  {
    section: 'Outlets',
    items: [
      { label: 'Outlets',   icon: '🗺', href: '/outlets', key: 'map'   },
    ],
  },

]

export default function Sidebar({ activePage }) {
  const current = window.location.pathname

  return (
    <nav style={s.nav}>
      {/* Brand */}
      <div style={s.brand}>
        <div style={s.logoMark}>Z3</div>
        <div>
          <p style={s.brandName}>ZeroThree</p>
          <p style={s.brandSub}>Admin Panel</p>
        </div>
      </div>

      {NAV.map(group => (
        <div key={group.section}>
          <div style={s.divider} />
          <p style={s.navSection}>{group.section}</p>
          <ul style={s.navList}>
            {group.items.map(item => {
              const isActive = activePage
                ? activePage === item.key
                : current === item.href && item.key === activePage

              return (
                <li key={item.key}>
                  <button
                    style={{ ...s.navItem, ...(activePage === item.key ? s.navItemActive : {}) }}
                    onClick={() => window.location.href = item.href}
                  >
                    <span style={s.navIcon}>{item.icon}</span>
                    <span style={s.navLabel}>{item.label}</span>
                    {activePage === item.key && <span style={s.navIndicator} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {/* Sign out */}
      <div style={{ marginTop: 'auto' }}>
        <div style={s.divider} />
        <button
          style={s.signOutBtn}
          onClick={() => { localStorage.clear(); window.location.href = '/login' }}
        >
          <span>⎋</span> Sign out
        </button>
      </div>
    </nav>
  )
}

const s = {
  nav:          { width: '150px', flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: 0, overflowY: 'auto', height: '100vh' },
  brand:        { display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 20px 16px' },
  logoMark:     { width: '36px', height: '36px', background: '#f97316', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: '#fff', flexShrink: 0 },
  brandName:    { fontSize: '15px', fontWeight: '700', color: '#111827', margin: 0 },
  brandSub:     { fontSize: '11px', color: '#9ca3af', margin: 0, marginTop: '1px' },
  divider:      { height: '1px', background: '#f3f4f6', margin: '4px 0' },
  navSection:   { fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '12px 20px 4px' },
  navList:      { listStyle: 'none', margin: 0, padding: '0 8px' },
  navItem:      { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 12px', borderRadius: '8px', border: 'none', background: 'none', fontSize: '13px', fontWeight: '500', color: '#374151', cursor: 'pointer', textAlign: 'left', position: 'relative' },
  navItemActive:{ background: '#fff7ed', color: '#c2410c', fontWeight: '600' },
  navIcon:      { fontSize: '15px', flexShrink: 0 },
  navLabel:     { flex: 1 },
  navIndicator: { width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', flexShrink: 0 },
  signOutBtn:   { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px 20px', border: 'none', background: 'none', fontSize: '13px', color: '#9ca3af', cursor: 'pointer', textAlign: 'left' },
}
