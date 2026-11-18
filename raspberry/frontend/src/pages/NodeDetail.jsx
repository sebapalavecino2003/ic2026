import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getNode, getNodeTelemetry, sendCommand } from '../api'
import { displayName } from '../localNames'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

// Variables que se grafican (las que publica el firmware control-luz)
const sensorConfig = {
  luz_aula: { label: 'Luz aula', unit: ' lx', color: '#f39c12', dataKey: 'luz_aula' },
  luz_ventana: { label: 'Luz ventana', unit: ' lx', color: '#e67e22', dataKey: 'luz_ventana' },
  temp_c: { label: 'Temperatura', unit: '°C', color: '#e74c3c', dataKey: 'temp_c' },
  humedad: { label: 'Humedad', unit: '%', color: '#3498db', dataKey: 'humedad' },
}

// Comandos que acepta el firmware (ver contrato MQTT en el README principal)
const comandos = [
  { cmd: 'RELE_ON', label: 'Prender luz', title: 'Modo manual: prende el relé' },
  { cmd: 'RELE_OFF', label: 'Apagar luz', title: 'Modo manual: apaga el relé' },
  { cmd: 'AUTO', label: 'Automático', title: 'Vuelve a la lógica automática' },
  { cmd: 'REBOOT', label: 'Reiniciar', title: 'Reinicia la placa' },
]

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
          <div className="card-title">Comandos</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {comandos.map(({ cmd, label, title }) => (
              <button key={cmd} className="btn-primary btn-sm" title={title}
                onClick={() => sendCommand(nodeId, cmd).then(fetch).catch(() => {})}>{label}</button>
            ))}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, margin: '16px 0' }}>
          {Object.entries(sensorConfig).map(([key, cfg]) => (
            <div className="card" key={key}>
              <div className="card-title">{cfg.label} en el tiempo</div>
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
