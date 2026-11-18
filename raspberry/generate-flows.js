const fs = require("fs");

let seq = 0;
const id = () => "n" + (++seq).toString(16).padStart(4, "0");

const DB = "db_main";
const BR = "br_main";

function node(type, opts) {
  return { id: id(), type, wires: [], ...opts };
}

function tab(label, name) {
  return node("tab", { label, z: name });
}

function inject(name, z, opts) {
  return node("inject", { z, name, props: [], repeat: "", crontab: "", once: false, onceDelay: 0.1, topic: "", payload: "", payloadType: "date", wires: [[]], ...opts });
}

const fnode = (name, code, z) =>
  node("function", { z, name, func: code, outputs: 1, noerr: 0, initialize: "", finalize: "", libs: [], wires: [[]] });

const sqln = (name, z) =>
  node("sqlite", { z, name, mydb: DB, sqlquery: "msg.topic", sql: "", wires: [[]] });
const sqlnBatch = (name, z) =>
  node("sqlite", { z, name, mydb: DB, sqlquery: "batch", sql: "", wires: [[]] });

const debugN = (name, z) =>
  node("debug", { z, name, active: true, tosidebar: true, console: false, tostatus: false, complete: "payload", targetType: "msg", statusVal: "", statusType: "auto", wires: [[]] });

function chain(list) {
  for (let i = 0; i < list.length - 1; i++) {
    list[i].wires = [[list[i + 1].id]];
  }
  return list;
}

const F = [];
const Z = {};

// ========== CONFIG NODES ==========
F.push(node("sqlitedb", { id: DB, name: "nodered.db", db: "/data/nodered.db", mode: "READ_WRITE_CREATE" }));
F.push(node("mqtt-broker", {
  id: BR, name: "Mosquitto local",
  broker: "mosquitto", port: "1883", clientid: "", usetls: false,
  compatmode: true, keepalive: "60", cleansession: true,
  birthTopic: "", birthQos: "0", birthPayload: "",
  closeTopic: "", closeQos: "0", closePayload: "",
  willTopic: "", willQos: "0", willPayload: "",
  credentials: false, username: "nodealert", password: "nodealert_secret"
}));

// ========== TAB 0: Init DB ==========
Z.init = "z_init";
F.push(tab("Init DB", Z.init));
chain([
  inject("Init DB", Z.init, { once: true }),
  fnode("Create tables", `msg.topic = \`
CREATE TABLE IF NOT EXISTS nodes (node_id TEXT PRIMARY KEY,name TEXT,is_online INTEGER DEFAULT 0,last_seen DATETIME,hidden INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY AUTOINCREMENT,node_id TEXT,temperature REAL,gas INTEGER,flame INTEGER,temp_status TEXT,gas_status TEXT,flame_status TEXT,presencia INTEGER,luz_ventana REAL,luz_aula REAL,temp_c REAL,humedad REAL,rele INTEGER,timestamp DATETIME);
CREATE INDEX IF NOT EXISTS idx_telemetry_node_ts ON telemetry(node_id, timestamp);
CREATE TABLE IF NOT EXISTS node_config (node_id TEXT PRIMARY KEY,temperature_critical REAL DEFAULT 50,gas_warning INTEGER DEFAULT 3000,gas_critical INTEGER DEFAULT 4000,buzzer_enabled INTEGER DEFAULT 1,flame_critical_value REAL DEFAULT 500,flame_critical_severity TEXT DEFAULT 'critical',flame_critical_message TEXT DEFAULT 'Llama detectada',gas_critical_value REAL DEFAULT 2000,gas_critical_severity TEXT DEFAULT 'high',gas_critical_message TEXT DEFAULT 'Nivel de gas peligroso',temp_critical_value REAL DEFAULT 50,temp_critical_severity TEXT DEFAULT 'high',temp_critical_message TEXT DEFAULT 'Temperatura peligrosa',updated_at DATETIME);
\`;return msg;`, Z.init),
  sqlnBatch("Execute init", Z.init),
  fnode("Migrate schema", `msg.topic="SELECT COUNT(*) as cnt FROM pragma_table_info('nodes') WHERE name='hidden'";return msg;`, Z.init),
  sqln("Check if hidden col exists", Z.init),
  fnode("Add hidden if missing", `var exists=(msg.payload||[])[0];msg.topic=exists&&exists.cnt>0?"SELECT 1":"ALTER TABLE nodes ADD COLUMN hidden INTEGER DEFAULT 0";return msg;`, Z.init),
  sqlnBatch("Alter or skip", Z.init),
  fnode("Set hidden default", `msg.topic="UPDATE nodes SET hidden=0 WHERE hidden IS NULL";return msg;`, Z.init),
  sqlnBatch("Update hidden", Z.init),
  fnode("Migrate telemetry schema", `msg.topic="SELECT COUNT(*) as cnt FROM pragma_table_info('telemetry') WHERE name='temp_status'";return msg;`, Z.init),
  sqln("Check if status cols exist", Z.init),
  fnode("Add status cols if missing", `var exists=(msg.payload||[])[0];if(exists&&exists.cnt>0)msg.topic="SELECT 1";else msg.topic="ALTER TABLE telemetry ADD COLUMN temp_status TEXT;ALTER TABLE telemetry ADD COLUMN gas_status TEXT;ALTER TABLE telemetry ADD COLUMN flame_status TEXT";return msg;`, Z.init),
  sqlnBatch("Alter or skip telemetry", Z.init),
  fnode("Migrate lighting schema", `msg.topic="SELECT COUNT(*) as cnt FROM pragma_table_info('telemetry') WHERE name='rele'";return msg;`, Z.init),
  sqln("Check if lighting cols exist", Z.init),
  fnode("Add lighting cols if missing", `var exists=(msg.payload||[])[0];if(exists&&exists.cnt>0)msg.topic="SELECT 1";else msg.topic="ALTER TABLE telemetry ADD COLUMN luz_ventana REAL;ALTER TABLE telemetry ADD COLUMN luz_aula REAL;ALTER TABLE telemetry ADD COLUMN temp_c REAL;ALTER TABLE telemetry ADD COLUMN humedad REAL;ALTER TABLE telemetry ADD COLUMN rele INTEGER";return msg;`, Z.init),
  sqlnBatch("Alter or skip lighting", Z.init),
  debugN("DB init result", Z.init)
].map(n => { F.push(n); return n; }));

// ========== TAB 1: Telemetry ==========
Z.tele = "z_tele";
F.push(tab("Telemetry", Z.tele));
const t1 = node("mqtt in", { z: Z.tele, name: "Telemetry MQTT", topic: "nodealert/+/telemetry", qos: "2", datatype: "json", broker: BR, wires: [[]] });
const t2 = fnode("Process telemetry", `
var p = msg.payload, nid = msg.topic.split('/')[1], now = new Date().toISOString().replace('T',' ').split('.')[0], nm = p.device_id||nid;
var ts=(p.temp_status||''),gs=(p.gas_status||''),fs=(p.flame_status||'');
function V(x){return (x==null)?'NULL':x;}
var temp=V(p.temperature),gas=V(p.gas_ppm),flame=V(p.flame);
var pres=V(p.presencia),lv=V(p.luz_ventana_lx),la=V(p.luz_aula_lx),tc=V(p.temp_c),hu=V(p.humedad_pct),rl=V(p.rele_canal1);
msg.topic="INSERT INTO nodes(node_id,name,is_online,last_seen)SELECT'"+nid+"','"+nm+"',1,'"+now+"'WHERE NOT EXISTS(SELECT 1 FROM nodes WHERE node_id='"+nid+"');UPDATE nodes SET is_online=1,last_seen='"+now+"',name=COALESCE(NULLIF(name,''),'"+nm+"')WHERE node_id='"+nid+"'AND hidden=0;INSERT INTO telemetry(node_id,temperature,gas,flame,temp_status,gas_status,flame_status,presencia,luz_ventana,luz_aula,temp_c,humedad,rele,timestamp)SELECT'"+nid+"',"+temp+","+gas+","+flame+",'"+ts.replace(/'/g,"''")+"','"+gs.replace(/'/g,"''")+"','"+fs.replace(/'/g,"''")+"',"+pres+","+lv+","+la+","+tc+","+hu+","+rl+",'"+now+"'WHERE(SELECT hidden FROM nodes WHERE node_id='"+nid+"')=0;";
return msg;`, Z.tele);
const t3 = sqlnBatch("Insert telemetry", Z.tele);
const t4 = debugN("Telemetry ingested", Z.tele);
[t1, t2, t3, t4].forEach(n => F.push(n));
t1.wires = [[t2.id]]; t2.wires = [[t3.id]]; t3.wires = [[t4.id]];

// ========== TAB 2: Offline Detector ==========

Z.off = "z_off";
F.push(tab("Offline Detector", Z.off));
const o1 = inject("Check offline every 30s", Z.off, { repeat: "30" });
const o2 = fnode("Find offline", `msg.topic="SELECT node_id FROM nodes WHERE is_online=1 AND hidden=0 AND last_seen<datetime('now','-60 seconds')";return msg;`, Z.off);
const o3 = sqln("Select offline nodes", Z.off);
const o4 = fnode("Split & mark offline", `
var rows=msg.payload||[],now=new Date().toISOString().replace('T',' ').split('.')[0];
return rows.map(function(r){return{topic:"UPDATE nodes SET is_online=0 WHERE node_id='"+r.node_id+"'"};});`, Z.off);
const o5 = sqlnBatch("Update & log offline", Z.off);
[o1, o2, o3, o4, o5].forEach(n => F.push(n));
o1.wires = [[o2.id]]; o2.wires = [[o3.id]]; o3.wires = [[o4.id]]; o4.wires = [[o5.id]];

// ========== TAB 4: Cleanup ==========
Z.cln = "z_cln";
F.push(tab("Cleanup", Z.cln));
chain([
  inject("Daily cleanup", Z.cln, { repeat: "86400" }),
  fnode("Cleanup SQL", `msg.topic="DELETE FROM telemetry WHERE timestamp<datetime('now','-30 days')";return msg;`, Z.cln),
  sqlnBatch("Delete old data", Z.cln),
  debugN("Cleanup result", Z.cln)
].map(n => { F.push(n); return n; }));

// ========== TAB 5: API ==========
Z.api = "z_api";
F.push(tab("API", Z.api));

function addApi(method, url, fnCode, db) {
  const hin = node("http in", { z: Z.api, name: `${method} ${url}`, url, method: method.toLowerCase(), upload: false, swaggerDoc: "", wires: [[]] });
  const fn = fnode(url.replace(/[\/:]/g, "_"), fnCode, Z.api);
  F.push(hin, fn);
  let last = fn;
  if (db) {
    const sql = (method.toUpperCase()==="GET") ? sqln(url.replace(/[\/:]/g, "_"), Z.api) : sqlnBatch(url.replace(/[\/:]/g, "_"), Z.api);
    F.push(sql);
    last.wires = [[sql.id]];
    last = sql;
  }
  const hres = node("http response", { z: Z.api, name: "", statusCode: "", headers: {}, wires: [[]] });
  F.push(hres);
  last.wires = [[hres.id]];
  hin.wires = [[fn.id]];
}

addApi("GET", "/api/health", `msg.payload={status:"ok",timestamp:new Date().toISOString()};msg.statusCode=200;return msg;`);
addApi("GET", "/api/nodes", `msg.topic="SELECT * FROM nodes WHERE hidden=0 ORDER BY last_seen DESC";return msg;`, true);
addApi("GET", "/api/nodes/:node_id", `var id=msg.req.params.node_id;msg.topic="SELECT n.*,t.temperature,t.gas,t.flame,t.temp_status,t.gas_status,t.flame_status,t.presencia,t.luz_ventana,t.luz_aula,t.temp_c,t.humedad,t.rele,t.timestamp as last_telemetry_ts FROM nodes n LEFT JOIN telemetry t ON t.id=(SELECT id FROM telemetry WHERE node_id='"+id+"'ORDER BY timestamp DESC LIMIT 1)WHERE n.node_id='"+id+"'AND n.hidden=0";return msg;`, true);
addApi("POST", "/api/nodes", `var b=msg.req.body,nid=b.node_id;if(!nid){msg.statusCode=400;msg.payload={error:"node_id is required"};return msg;}var nm=(b.name||nid).replace(/'/g,"''");msg.topic="INSERT OR REPLACE INTO nodes(node_id,name,is_online,last_seen,hidden)VALUES('"+nid+"','"+nm+"',0,datetime('now'),0);INSERT OR IGNORE INTO node_config(node_id)VALUES('"+nid+"')";return msg;`, true);
addApi("DELETE", "/api/nodes/:node_id", `var id=msg.req.params.node_id;msg.topic="UPDATE nodes SET hidden=1 WHERE node_id='"+id+"'";return msg;`, true);
addApi("GET", "/api/telemetry/latest", `msg.topic="SELECT t.*,n.name FROM telemetry t INNER JOIN(SELECT node_id,MAX(timestamp)as max_ts FROM telemetry GROUP BY node_id)latest ON t.node_id=latest.node_id AND t.timestamp=latest.max_ts LEFT JOIN nodes n ON n.node_id=t.node_id ORDER BY t.timestamp DESC";return msg;`, true);
addApi("GET", "/api/telemetry/:node_id", `var id=msg.req.params.node_id,lim=msg.req.query.limit||50;msg.topic="SELECT * FROM telemetry WHERE node_id='"+id+"'ORDER BY timestamp DESC LIMIT "+lim;return msg;`, true);
addApi("GET", "/api/telemetry/averages", `msg.topic="SELECT node_id,ROUND(AVG(temperature),1)as avg_temperature,ROUND(AVG(gas),0)as avg_gas,COUNT(*)as samples FROM telemetry WHERE timestamp>datetime('now','-1 hour')GROUP BY node_id";return msg;`, true);
addApi("GET", "/api/nodes/:node_id/config", `var id=msg.req.params.node_id;msg.topic="SELECT * FROM node_config WHERE node_id='"+id+"'";return msg;`, true);

// POST /api/nodes/:node_id/config — saves to DB only (read thresholds from firmware)
{
  const hin = node("http in", { z: Z.api, name: "POST /api/nodes/:node_id/config", url: "/api/nodes/:node_id/config", method: "post", upload: false, swaggerDoc: "", wires: [[]] });
  const fn = fnode("config_save", `
msg.statusCode=405;msg.payload={error:"Los umbrales son fijos en el firmware. Use GET para visualizarlos."};return msg;`, Z.api);
  const hres = node("http response", { z: Z.api, name: "", statusCode: "", headers: {}, wires: [[]] });
  [hin, fn, hres].forEach(n => F.push(n));
  hin.wires = [[fn.id]];
  fn.wires = [[hres.id]];
}

// POST /api/nodes/:node_id/command — publishes raw command to MQTT
{
  const hin = node("http in", { z: Z.api, name: "POST /api/nodes/:node_id/command", url: "/api/nodes/:node_id/command", method: "post", upload: false, swaggerDoc: "", wires: [[]] });
  const fn = fnode("command_publish", `
var nid=msg.req.params.node_id,cmd=msg.req.body.command;
if(!cmd){msg.statusCode=400;msg.payload={error:"command is required (REBOOT, BUZZER_ON, BUZZER_OFF, AUTO)"};return msg;}
msg.topic="nodealert/"+nid+"/commands";
msg.payload=cmd;
msg.retain=false;
return msg;`, Z.api);
  const mqtt = node("mqtt out", { z: Z.api, name: "Send command", topic: "", qos: "", retain: "false", broker: BR, wires: [[]] });
  const hres = node("http response", { z: Z.api, name: "", statusCode: "", headers: {}, wires: [[]] });
  [hin, fn, mqtt, hres].forEach(n => F.push(n));
  hin.wires = [[fn.id]];
  fn.wires = [[mqtt.id]];
  mqtt.wires = [[hres.id]];
}

fs.writeFileSync(__dirname + "/nodered/data/flows.json", JSON.stringify(F, null, 2));
console.log("OK —", F.length, "nodes generated in", Object.keys(Z).length, "flows");
