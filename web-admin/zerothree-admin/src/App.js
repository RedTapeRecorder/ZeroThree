import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Login'

function App() {
  const token = localStorage.getItem('zt_token')

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Dashboard coming soon</div>} />
        <Route path="*" element={<Navigate to={token ? '/dashboard' : '/login'} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App