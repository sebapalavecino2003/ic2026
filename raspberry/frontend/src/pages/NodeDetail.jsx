import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getNode, getNodeTelemetry, sendCommand } from '../api'
import { displayName } from '../localNames'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const sensorConfig = {
  flame: { label: 'Flame', unit: '', color: '#f39c12', dataKey: 'flame' },
  temperature: { label: 'Temperature', unit: '°C', color: '#e74c3c', dataKey: 'temperature' },
  gas: { label: 'Gas (ppm)', unit: 'ppm', color: '#e67e22', dataKey: 'gas' },
}

const statusColors = {
  'Óptima': '#27ae60',
  'Advertencia': '#f39c12',
  'Peligro': '#e74c3c',
}

const statusKey = {
  temperature: 'temp_status',
  gas: 'gas_status',
  flame: 'flame_status',
}

function formatTime(ts) {
  const d = new Date(ts + 'Z')
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function NodeDetail() {
  const { nodeId } = useParams()
  const [node, setNode] = useState(null)
  const [telemetry, setTelemetry] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = () =>
    Promise.all([getNode(nodeId), getNodeTelemetry(nodeId, 50)])
      .then(([n, t]) => { setNode(n); setTelemetry(t) })
      .catch(() => {})
      .then(() => setLoading(false))

  useEffect(() => { fetch(); const iv = setInterval(fetch, 10000); return () => clearInterval(iv) }, [nodeId])

  if (loading) return <div className="page-title">Loading node...</div>
  if (!node) return <div className="page-title">Node not found</div>

  const last = telemetry[0]
  const chartData = [...telemetry].reverse()

  return (
    <div>
      <div className="page-title">
        <Link to="/nodes" style={{ color: 'var(--text2)', fontWeight: 400 }}>Nodes</Link>
        <span style={{ color: 'var(--text2)', margin: '0 8px' }}>/</span>
        {displayName(node)}
      </div>

      <div className="detail-grid">
        <div className="card">
          <div className="card-title">Status</div>
          <span className={`badge ${node.is_online === 1 ? 'badge-online' : 'badge-offline'}`}>
            {node.is_online === 1 ? 'Online' : 'Offline'}
          </span>
          <div style={{ marginTop: 8, fontSize: '.85rem', color: 'var(--text2)' }}>
            Last seen: {node.last_seen ? new Date(node.last_seen + 'Z').toLocaleString() : '—'}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Send Command</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['REBOOT', 'BUZZER_ON', 'BUZZER_OFF'].map(c => (
              <button key={c} className="btn-primary btn-sm" onClick={() => sendCommand(nodeId, c)}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {last && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {Object.entries(sensorConfig).map(([key, cfg]) => {
            const value = last[key]
            return (
              <div className="card" key={key}>
                <div className="card-title">{cfg.label}</div>
                <div className="card-value" style={{ color: cfg.color }}>
                  {value != null ? `${value}${cfg.unit}` : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="detail-grid">
        <div className="card full">
          <div className="card-title">Estado actual por sensor</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {Object.entries(sensorConfig).map(([key, cfg]) => {
              const value = last?.[key]
              const status = last?.[statusKey[key]]
              return (
                <div key={key} className="card" style={{ padding: 12 }}>
                  <div className="card-title" style={{ color: cfg.color, marginBottom: 8 }}>{cfg.label}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                    {value != null ? `${value}${cfg.unit}` : '—'}
                  </div>
                  {status && (
                    <span style={{
                      display: 'inline-block', marginTop: 6, padding: '2px 10px', borderRadius: 12,
                      fontSize: '.8rem', fontWeight: 600, color: '#fff', backgroundColor: statusColors[status] || '#999'
                    }}>
                      {status}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {last && (last.presencia != null || last.luz_ventana != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { key: 'presencia', label: 'Presencia', fmt: v => v ? 'sí' : 'no', color: '#27ae60' },
            { key: 'luz_ventana', label: 'Luz ventana', fmt: v => `${v} lx`, color: '#f39c12' },
            { key: 'luz_aula', label: 'Luz aula', fmt: v => `${v} lx`, color: '#f39c12' },
            { key: 'temp_c', label: 'Temperatura', fmt: v => `${v}°C`, color: '#e74c3c' },
            { key: 'humedad', label: 'Humedad', fmt: v => `${v}%`, color: '#3498db' },
            { key: 'rele', label: 'Relé', fmt: v => v ? 'ON' : 'off', color: '#9b59b6' },
          ].map(({ key, label, fmt, color }) => (
            last[key] != null && (
              <div className="card" key={key}>
                <div className="card-title">{label}</div>
                <div className="card-value" style={{ color }}>{fmt(last[key])}</div>
              </div>
            )
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, margin: '16px 0' }}>
          {Object.entries(sensorConfig).map(([key, cfg]) => (
            <div className="card" key={key}>
              <div className="card-title">{cfg.label} over time</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTime} fontSize={11} stroke="var(--text2)" />
                  <YAxis fontSize={11} stroke="var(--text2)" />
                  <Tooltip
                    labelFormatter={l => new Date(l + 'Z').toLocaleString()}
                    formatter={v => [`${v}${cfg.unit}`, cfg.label]}
                  />
                  <Line type="monotone" dataKey={cfg.dataKey} stroke={cfg.color} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
