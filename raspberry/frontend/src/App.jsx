import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Nodes from './pages/Nodes'
import NodeDetail from './pages/NodeDetail'
import './App.css'

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/nodes', label: 'Nodes' },
]

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">NodeAlert IoT</div>
        <nav className="sidebar-nav">
          {nav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href="http://localhost:1880" target="_blank" rel="noreferrer">Node-RED Editor</a>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nodes" element={<Nodes />} />
          <Route path="/nodes/:nodeId" element={<NodeDetail />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
