import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getNodes, getLatestTelemetry } from '../api'
import { getLocalName } from '../localNames'

export default function Dashboard() {
  const [nodes, setNodes] = useState([])
  const [latest, setLatest] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = () =>
    Promise.all([getNodes(), getLatestTelemetry()])
      .then(([n, t]) => { setNodes(n); setLatest(t) })
      .catch(() => {})
      .then(() => setLoading(false))

  useEffect(() => { fetch(); const iv = setInterval(fetch, 10000); return () => clearInterval(iv) }, [])

  const online = nodes.filter(n => n.is_online === 1).length
  const offline = nodes.filter(n => n.is_online === 0).length

  if (loading) return <div className="page-title">Loading dashboard...</div>

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="card-grid">
        <div className="card">
          <div className="card-title">Online Nodes</div>
          <div className="card-value" style={{ color: 'var(--success)' }}>{online}</div>
        </div>
        <div className="card">
          <div className="card-title">Offline Nodes</div>
          <div className="card-value" style={{ color: offline ? 'var(--danger)' : 'var(--text2)' }}>{offline}</div>
        </div>
        <div className="card">
          <div className="card-title">Total Nodes</div>
          <div className="card-value">{nodes.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Latest Readings</div>
        {latest.length === 0 && <div style={{ color: 'var(--text2)', fontSize: '.9rem' }}>No data yet</div>}
        {latest.map(t => (
          <div key={t.node_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <Link to={`/nodes/${t.node_id}`} style={{ fontWeight: 600 }}>{getLocalName(t.node_id) || t.name || t.node_id}</Link>
            <span style={{ color: 'var(--text2)', fontSize: '.85rem' }}>
              {t.temperature != null && `${t.temperature}°C`}
              {t.gas != null && ` · ${t.gas}ppm`}
              {t.presencia != null && ` · Presencia ${t.presencia ? 'sí' : 'no'}`}
              {t.luz_ventana != null && ` · Ventana ${t.luz_ventana}lx`}
              {t.rele != null && ` · Relé ${t.rele ? 'ON' : 'off'}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
