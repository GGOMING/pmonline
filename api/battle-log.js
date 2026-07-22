// ─── 전투 로그 CSV → Google Drive 업로드 Vercel Serverless Function ───
// 클라이언트에서 { userName, dayKey, battleId, csvContent } POST → Drive 폴더 트리에 CSV 생성
// 폴더 구조: {ROOT}/{userName}/{dayKey}/{battleId}.csv
//
// 환경변수 (Vercel Dashboard → Project Settings → Environment Variables):
//   GOOGLE_CLIENT_ID     — OAuth Client ID
//   GOOGLE_CLIENT_SECRET — OAuth Client Secret
//   GOOGLE_REFRESH_TOKEN — OAuth Playground 등으로 발급받은 refresh token
//   GOOGLE_DRIVE_ROOT_FOLDER_ID — Drive 에서 로그 저장할 루트 폴더 ID

const _folderCache = new Map();

module.exports = async function handler(req, res){
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let payload = req.body;
    if (typeof payload === 'string'){
      try { payload = JSON.parse(payload); } catch(e){ return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    if (!payload || typeof payload !== 'object'){
      const raw = await readRawBody(req);
      try { payload = JSON.parse(raw); } catch(e){ return res.status(400).json({ error: 'Missing body' }); }
    }
    const { userName, dayKey, battleId, csvContent } = payload;
    if (!userName || !dayKey || !battleId || !csvContent){
      return res.status(400).json({ error: 'Missing fields (userName, dayKey, battleId, csvContent)' });
    }
    const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootId) return res.status(500).json({ error: 'GOOGLE_DRIVE_ROOT_FOLDER_ID not configured' });

    const safeUser = sanitize(userName);
    const safeDay  = sanitize(dayKey);
    const safeId   = sanitize(battleId);

    const token = await getAccessToken();
    const userFolderId = await ensureFolder(token, safeUser, rootId);
    const dayFolderId  = await ensureFolder(token, safeDay, userFolderId);
    const fileId = await uploadFile(token, dayFolderId, safeId + '.csv', csvContent);
    return res.status(200).json({ ok: true, fileId: fileId });
  } catch(e){
    console.error('[battle-log]', e);
    return res.status(500).json({ error: e && e.message ? e.message : String(e) });
  }
};

function sanitize(s){
  return String(s).replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 128);
}

function readRawBody(req){
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', function(chunk){ data += chunk; });
    req.on('end', function(){ resolve(data); });
    req.on('error', reject);
  });
}

async function getAccessToken(){
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken){
    throw new Error('Google OAuth env vars not configured');
  }
  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  params.set('refresh_token', refreshToken);
  params.set('grant_type', 'refresh_token');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await r.json();
  if (!data.access_token){
    throw new Error('token exchange failed: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function ensureFolder(token, name, parentId){
  const cacheKey = parentId + '::' + name;
  if (_folderCache.has(cacheKey)) return _folderCache.get(cacheKey);

  const escapedName = name.replace(/'/g, "\\'");
  const q = "name='" + escapedName + "' and mimeType='application/vnd.google-apps.folder' and '" + parentId + "' in parents and trashed=false";
  const searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=1';
  const s = await fetch(searchUrl, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const sd = await s.json();
  if (sd.error) throw new Error('search: ' + JSON.stringify(sd.error));
  if (sd.files && sd.files.length){
    _folderCache.set(cacheKey, sd.files[0].id);
    return sd.files[0].id;
  }
  const c = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const cd = await c.json();
  if (!cd.id) throw new Error('folder create: ' + JSON.stringify(cd));
  _folderCache.set(cacheKey, cd.id);
  return cd.id;
}

async function uploadFile(token, folderId, name, content){
  const boundary = '----BATTLE_LOG_BOUNDARY_' + Date.now();
  const metadata = JSON.stringify({ name: name, parents: [folderId] });
  const body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    metadata + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: text/csv; charset=UTF-8\r\n\r\n' +
    content + '\r\n' +
    '--' + boundary + '--\r\n';

  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary,
    },
    body: body,
  });
  const d = await r.json();
  if (!d.id) throw new Error('upload: ' + JSON.stringify(d));
  return d.id;
}
