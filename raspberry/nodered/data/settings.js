module.exports = {
  uiPort: 1880,
  mqttReconnectTime: 15000,
  serialReconnectTime: 15000,
  flowFile: 'flows.json',
  credentialSecret: false,
  httpAdminRoot: '/',
  httpNodeRoot: '/',
  userDir: '/data',
  nodesDir: '/data/nodes',
  logging: { console: { level: "info", metrics: false, audit: false } }
}
