const STORAGE_KEY = 'nodealert_local_names'

export function getLocalName(nodeId) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  return all[nodeId] || null
}

export function setLocalName(nodeId, name) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  if (name) {
    all[nodeId] = name
  } else {
    delete all[nodeId]
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function displayName(node) {
  return getLocalName(node.node_id) || node.name || node.node_id
}
