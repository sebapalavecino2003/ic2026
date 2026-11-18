import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getNodes, createNode, deleteNode, sendCommand } from '../api'
import { setLocalName, displayName } from '../localNames'

export default function Nodes() {
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [creating, setCreating] = useState(false)
  const [createId, setCreateId] = useState('')
  const [createName, setCreateName] = useState('')

  const fetch = () => getNodes().then(setNodes).catch(() => {}).then(() => setLoading(false))
  useEffect(() => { fetch(); const iv = setInterval(fetch, 15000); return () => clearInterval(iv) }, [])

  const handleRename = (nodeId) => {
    if (!renameVal.trim()) return
    setLocalName(nodeId, renameVal.trim())
    setRenaming(null)
  }

  const handleDelete = async (nodeId) => {
    if (!confirm(`Delete node ${nodeId} and all its data?`)) return
    setNodes(prev => prev.filter(n => n.node_id !== nodeId))
    await deleteNode(nodeId).catch(() => {})
  }

  const handleCreate = async () => {
    if (!createId.trim()) return
    await createNode(createId.trim(), createName.trim() || undefined)
    setCreating(false); setCreateId(''); setCreateName('')
    fetch()
  }

  const handleCommand = async (nodeId, cmd) => {
    await sendCommand(nodeId, cmd)
  }

  if (loading) return <div className="page-title">Loading nodes...</div>

  return (
    <div>
      <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Nodes
        <button className="btn-primary btn-sm" onClick={() => setCreating(true)}>+ New Node</button>
      </h1>

      {creating && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Create Node</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '.75rem', color: 'var(--text2)', display: 'block', marginBottom: 2 }}>Node ID *</label>
              <input value={createId} onChange={e => setCreateId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="e.g. esp32-01" />
            </div>
            <div>
              <label style={{ fontSize: '.75rem', color: 'var(--text2)', display: 'block', marginBottom: 2 }}>Name</label>
              <input value={createName} onChange={e => setCreateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder="optional" />
            </div>
            <button className="btn-primary btn-sm" onClick={handleCreate}>Create</button>
            <button className="btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Node ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {nodes.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)' }}>No nodes registered</td></tr>
            )}
            {nodes.map(n => (
              <tr key={n.node_id}>
                <td><Link to={`/nodes/${n.node_id}`} style={{ fontFamily: 'monospace' }}>{n.node_id}</Link></td>
                <td>
                  {renaming === n.node_id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleRename(n.node_id)}
                        autoFocus size={14} />
                      <button className="btn-primary btn-sm" onClick={() => handleRename(n.node_id)}>OK</button>
                      <button className="btn-ghost btn-sm" onClick={() => setRenaming(null)}>X</button>
                    </div>
                  ) : (
                    <span>{displayName(n)}</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${n.is_online === 1 ? 'badge-online' : 'badge-offline'}`}>
                    {n.is_online === 1 ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td style={{ fontSize: '.8rem', color: 'var(--text2)' }}>
                  {n.last_seen ? new Date(n.last_seen + 'Z').toLocaleString() : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn-ghost btn-sm" onClick={() => { setRenaming(n.node_id); setRenameVal(displayName(n)) }}>Rename</button>
                    <button className="btn-ghost btn-sm" onClick={() => handleCommand(n.node_id, 'RELE_ON')}>Luz ON</button>
                    <button className="btn-ghost btn-sm" onClick={() => handleCommand(n.node_id, 'RELE_OFF')}>Luz OFF</button>
                    <button className="btn-ghost btn-sm" onClick={() => handleCommand(n.node_id, 'AUTO')}>Auto</button>
                    <button className="btn-ghost btn-sm" onClick={() => handleCommand(n.node_id, 'REBOOT')}>Reboot</button>
                    <button className="btn-danger btn-sm" onClick={() => handleDelete(n.node_id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
