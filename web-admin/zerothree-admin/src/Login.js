import { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await axios.post(`${API_URL}/api/v1/auth/manager/login`, {
        email,
        password,
      })

      localStorage.setItem('zt_token', res.data.token)
      localStorage.setItem('zt_manager', JSON.stringify(res.data.manager))
      navigate('/dashboard')
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Invalid email or password.')
      } else {
        setError('Could not reach the server. Check your connection.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.left}>
        <div style={styles.brandBlock}>
          <div style={styles.logoMark}>Z3</div>
          <p style={styles.tagline}>
            LPG Delivery Route<br />Management System
          </p>
          <div style={styles.divider} />
          <p style={styles.branch}>San Juan City Branch</p>
        </div>
      </div>

      <div style={styles.right}>
        <form onSubmit={handleLogin} style={styles.form}>
          <h1 style={styles.heading}>Manager sign in</h1>
          <p style={styles.subheading}>Enter your credentials to access the admin panel.</p>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@branch.com"
              required
              autoComplete="email"
              style={styles.input}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={styles.input}
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p style={styles.hint}>
            Account access is managed by your system administrator.
          </p>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },

  // ── Left panel ──────────────────────────────
  left: {
    width: '420px',
    flexShrink: 0,
    background: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
  },
  brandBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  logoMark: {
    width: '56px',
    height: '56px',
    background: '#F97316',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    fontWeight: '700',
    color: '#fff',
    letterSpacing: '-1px',
  },
  tagline: {
    color: '#F9FAFB',
    fontSize: '22px',
    fontWeight: '600',
    lineHeight: '1.4',
    margin: 0,
  },
  divider: {
    width: '40px',
    height: '2px',
    background: '#F97316',
    borderRadius: '2px',
  },
  branch: {
    color: '#6B7280',
    fontSize: '13px',
    margin: 0,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },

  // ── Right panel ─────────────────────────────
  right: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F9FAFB',
    padding: '48px',
  },
  form: {
    width: '100%',
    maxWidth: '380px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  heading: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#111827',
    margin: 0,
  },
  subheading: {
    fontSize: '14px',
    color: '#6B7280',
    margin: 0,
    marginTop: '-8px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
    letterSpacing: '0.02em',
  },
  input: {
    padding: '10px 14px',
    fontSize: '15px',
    border: '1.5px solid #D1D5DB',
    borderRadius: '8px',
    outline: 'none',
    background: '#fff',
    color: '#111827',
    transition: 'border-color 0.15s',
  },
  errorBox: {
    padding: '10px 14px',
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '8px',
    color: '#B91C1C',
    fontSize: '13px',
  },
  button: {
    padding: '12px',
    background: '#F97316',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'background 0.15s',
  },
  hint: {
    fontSize: '12px',
    color: '#9CA3AF',
    textAlign: 'center',
    margin: 0,
  },
}
