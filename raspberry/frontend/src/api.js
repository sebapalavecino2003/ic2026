import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 8000,
  headers: { 'Accept': 'application/json' }
})

export async function getHealth() {
  const { data } = await api.get('/health')
  return data
}

export async function getNodes() {
  const { data } = await api.get('/nodes')
  return data
}

export async function getNode(nodeId) {
  const { data } = await api.get(`/nodes/${encodeURIComponent(nodeId)}`)
  return data
}

export async function deleteNode(nodeId) {
  const { data } = await api.delete(`/nodes/${encodeURIComponent(nodeId)}`)
  return data
}

export async function createNode(nodeId, name) {
  const { data } = await api.post('/nodes', { node_id: nodeId, name })
  return data
}

export async function getLatestTelemetry() {
  const { data } = await api.get('/telemetry/latest')
  return data
}

export async function getNodeTelemetry(nodeId, limit = 50) {
  const { data } = await api.get(`/telemetry/${encodeURIComponent(nodeId)}`, { params: { limit } })
  return data
}

export async function getAverages() {
  const { data } = await api.get('/telemetry/averages')
  return data
}

export async function sendCommand(nodeId, command) {
  const { data } = await api.post(`/nodes/${encodeURIComponent(nodeId)}/command`, { command })
  return data
}

export async function getNodeConfig(nodeId) {
  const { data } = await api.get(`/nodes/${encodeURIComponent(nodeId)}/config`)
  return data
}

export async function updateConfig(nodeId, config) {
  const { data } = await api.post(`/nodes/${encodeURIComponent(nodeId)}/config`, config)
  return data
}
