import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Login'
import MapView from './MapView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/outlets" element={<MapView />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App