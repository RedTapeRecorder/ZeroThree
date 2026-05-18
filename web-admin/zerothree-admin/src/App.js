import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Login'
import MapView from './MapView'
import RidersView from './RidersView'
import RoutesView from './RoutesView'
import PhotoReviewView from './PhotoReviewView'
import Dashboard from './Dashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"   element={<Login />} />
        <Route path="/outlets" element={<MapView />} />
        <Route path="/riders"  element={<RidersView />} />
        <Route path="/routes"  element={<RoutesView />} />
        <Route path="*"        element={<Navigate to="/login" />} />
        <Route path="/photos" element={<PhotoReviewView />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App