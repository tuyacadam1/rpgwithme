const API_URL = "https://script.google.com/macros/s/AKfycbxPN7yKyqOwyyxIarj2BTkIcuMOomlfc52zCo2vK4AcVWg8TRofqKaRR-kj1yKiLiENWA/exec";
const ASSETS_BASE_URL = "https://rpgwithme2.vercel.app/assets/";

const state = {
  teacherId: '',
  token: '',
  classes: [],
  students: [],
  assets: [],
  selectedClassId: '',
  pendingImageUrl: '',
  previewTimer: null
};

let cachedRecordMatrix = null;

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.style.background = isError ? '#ef4444' : '#10b981';
  t.style.color = isError ? '#fff' : '#000';
  t.style.display = 'block';
}

function hideToast() {
  document.getElementById('toast').style.display = 'none';
}

async function apiCall(payload) {
  showToast("Syncing with server...");
  try {
    const requestBody = payload.action === 'teacherLogin'
      ? payload
      : { ...payload, teacherId: state.teacherId, token: state.token };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(requestBody)
    });
    const json = await res.json();
    hideToast();
    if (json.status === 'error') throw new Error(json.message);
    return json.data;
  } catch (err) {
    hideToast();
    alert("Error: " + err.message);
    throw err;
  }
}

// --- LOGIN & CLASS MANAGEMENT ---
async function teacherLogin() {
  const teacherId = document.getElementById('teacher-id').value.trim();
  const password = document.getElementById('teacher-pass').value.trim();
  if (!teacherId || !password) return alert("Enter Teacher ID and Password.");

  const data = await apiCall({ action: 'teacherLogin', teacherId, password });
  state.teacherId = data.teacherId || teacherId;
  state.token = data.token || '';
  state.classes = data.classes || [];
  state.students = data.students || [];
  state.assets = data.assets || [];

  document.getElementById('teacher-name').innerText = data.name;
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('dashboard-view').classList.remove('hidden');

  renderClassDropdown();
  renderAssets();
}

function renderClassDropdown() {
  const sel = document.getElementById('class-select');
  if (state.classes.length === 0) {
    sel.innerHTML = '<option value="">No Classes Yet</option>';
    state.selectedClassId = '';
  } else {
    sel.innerHTML = state.classes
      .map(c => `<option value="${escHtml(c.classId)}">${escHtml(c.className)}</option>`)
      .join('');
    if (!state.selectedClassId || !state.classes.some(c => c.classId === state.selectedClassId)) {
      state.selectedClassId = state.classes[0].classId;
    }
    sel.value = state.selectedClassId;
  }
  renderClassStudents();
}

function onClassChange() {
  state.selectedClassId = document.getElementById('class-select').value;
  renderClassStudents();
  if (!document.getElementById('tab-history').classList.contains('hidden')) {
    loadHistory();
  }
}

async function createNewClass() {
  const className = prompt("Enter new Class / Section name (e.g., Grade 10 - Einstein):");
  if (!className || !className.trim()) return;

  const newCls = await apiCall({
    action: 'addClass',
    className: className.trim()
  });

  state.classes.push(newCls);
  state.selectedClassId = newCls.classId;
  renderClassDropdown();
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.remove('hidden');
  btn.classList.add('active');
}

// --- ROSTER & POINTS ---
function renderClassStudents() {
  const list = state.students
    .filter(s => String(s.classId) === String(state.selectedClassId))
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  document.getElementById('roster-count').innerText = list.length;

  const pointsContainer = document.getElementById('points-student-list');
  const rosterContainer = document.getElementById('roster-list');

  if (list.length === 0) {
    pointsContainer.innerHTML = '<p style="text-align:center; padding:16px;">No students in this class yet. Add them in the Class Roster tab.</p>';
    rosterContainer.innerHTML = '<p style="text-align:center; padding:16px;">No students enrolled.</p>';
    return;
  }

  pointsContainer.innerHTML = list.map(s => `
    <label class="student-row" style="cursor:pointer;">
      <div style="display:flex; align-items:center; gap:10px;">
        <input type="checkbox" class="pts-check" value="${escHtml(s.studentId)}" style="width:18px; height:18px; margin:0;">
        <div>
          <div style="font-weight:700; color:#f8fafc; font-size:14px;">${escHtml(s.name)}</div>
          <div style="font-size:11px; color:#94a3b8;">ID: ${escHtml(s.studentId)} • Floor ${Number(s.floor) || 1}</div>
        </div>
      </div>
      <span style="color:#f59e0b; font-weight:800; font-size:13px;">★ ${Number(s.points) || 0} Pts</span>
    </label>
  `).join('');

  rosterContainer.innerHTML = list.map(s => `
    <div class="student-row">
      <div>
        <div style="font-weight:700; font-size:14px;">${escHtml(s.name)}</div>
        <div style="font-size:11px; color:#94a3b8;">
          ID: ${escHtml(s.studentId)} • Floor ${Number(s.floor) || 1} • 
          PIN: <strong style="color:${s.pin ? '#4ade80' : '#f87171'};">${s.pin ? escHtml(s.pin) : 'Not Set'}</strong>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="color:#38bdf8; font-weight:700; font-size:13px;">★ ${Number(s.points) || 0} Pts</span>
        <button class="btn btn-outline" style="padding:5px 10px; font-size:11px; border-color:#f59e0b; color:#f59e0b;" 
          onclick="resetStudentPin('${escHtml(s.studentId)}', '${escHtml(s.name)}')">
          🔑 Reset PIN
        </button>
      </div>
    </div>
  `).join('');
}
async function resetStudentPin(studentId, studentName) {
  const newPin = prompt(
    `Reset PIN for ${studentName} (${studentId}):\n\n` +
    `• Enter a new 4+ digit PIN (e.g., 1234), OR\n` +
    `• Leave BLANK and click OK to let the student set their own new PIN on next login:`
  );
  if (newPin === null) return; // Teacher clicked Cancel

  const cleanPin = newPin.trim();
  await apiCall({
    action: 'resetStudentPin',
    studentId: studentId,
    pin: cleanPin
  });

  const target = state.students.find(s => String(s.studentId) === String(studentId));
  if (target) target.pin = cleanPin;
  renderClassStudents();

  alert(cleanPin
    ? `✅ PIN for ${studentName} reset to: ${cleanPin}`
    : `✅ PIN cleared! ${studentName} will set a new PIN on their next login.`
  );
}
function toggleSelectAll(checked) {
  document.querySelectorAll('.pts-check').forEach(cb => { cb.checked = checked; });
}

async function submitBulkPoints() {
  if (!state.selectedClassId) return alert("Create or select a class first.");
  const taskName = document.getElementById('task-name').value.trim();
  const points = Number(document.getElementById('task-points').value);
  const selectedIds = Array.from(document.querySelectorAll('.pts-check:checked')).map(cb => cb.value);

  if (!taskName) return alert("Enter a Task / Activity Name.");
  if (!points || points <= 0) return alert("Enter valid points.");
  if (selectedIds.length === 0) return alert("Select at least one student.");

  const res = await apiCall({
    action: 'bulkAddPoints',
    classId: state.selectedClassId,
    studentIds: selectedIds,
    taskName,
    points
  });

  state.students.forEach(s => {
    if (selectedIds.includes(String(s.studentId))) {
      s.points = (Number(s.points) || 0) + points;
    }
  });

  document.getElementById('task-name').value = '';
  toggleSelectAll(false);
  renderClassStudents();
  alert(`✅ Credited +${points} points to ${res.creditedCount} students!`);
}

async function bulkAddStudents() {
  if (!state.selectedClassId) return alert("Create or select a class first.");
  const raw = document.getElementById('bulk-students-text').value.trim();
  if (!raw) return alert("Paste at least one student.");

  const parsed = raw.split('\n').map(line => {
    const idx = line.indexOf(',');
    if (idx === -1) return null;
    const id = line.slice(0, idx).trim();
    const name = line.slice(idx + 1).trim();
    return id && name ? { id, name } : null;
  }).filter(Boolean);

  if (parsed.length === 0) return alert("Invalid format. Use: StudentID, Full Name");

  const res = await apiCall({
    action: 'bulkAddStudents',
    classId: state.selectedClassId,
    students: parsed
  });

  parsed.forEach(p => {
    if (!state.students.some(s => String(s.studentId) === String(p.id))) {
      state.students.push({
        studentId: p.id,
        classId: state.selectedClassId,
        name: p.name,
        points: 0,
        floor: 1
      });
    }
  });

  document.getElementById('bulk-students-text').value = '';
  renderClassStudents();
  alert(`✅ Added ${res.added} new students!`);
}

// --- GAME ASSETS (ASSETS FOLDER / URL WORKFLOW WITH AUTO-.PNG & VERIFIER) ---
function toggleAssetFields() {
  const type = document.getElementById('asset-type').value;
  document.getElementById('rarity-field').classList.toggle('hidden', type !== 'character');
  document.getElementById('floor-field').classList.toggle('hidden', type === 'character');
}

function resolveAssetUrl(rawInput) {
  const val = rawInput.trim();
  if (!val) return '';
  if (val.startsWith('http://') || val.startsWith('https://')) return val;

  let cleanFile = val.replace(/^\/?assets\//i, '');
  if (!/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(cleanFile)) {
    cleanFile += '.png';
  }
  return ASSETS_BASE_URL + cleanFile;
}

function handleAssetPathInput() {
  const raw = document.getElementById('asset-filename').value;
  const fullUrl = resolveAssetUrl(raw);
  if (!fullUrl) {
    state.pendingImageUrl = '';
    document.getElementById('upload-preview-box').classList.add('hidden');
    return;
  }
  state.pendingImageUrl = fullUrl;
  document.getElementById('upload-preview-box').classList.remove('hidden');
  updateAnimatedPreview();
}

function updateAnimatedPreview() {
  if (!state.pendingImageUrl) return;
  const cols = Math.max(1, Number(document.getElementById('sprite-cols').value) || 1);
  const rows = Math.max(1, Number(document.getElementById('sprite-rows').value) || 1);
  const box = document.getElementById('animated-sprite-preview');

  const testImg = new Image();
  testImg.onload = () => {
    box.innerText = '';
    box.style.backgroundImage = `url("${encodeURI(state.pendingImageUrl)}")`;
    box.style.backgroundSize = rows > 1 ? `${cols * 100}% ${rows * 128}%` : `${cols * 100}% 100%`;

    if (state.previewTimer) clearInterval(state.previewTimer);
    let frame = 0;
    state.previewTimer = setInterval(() => {
      const xPct = cols > 1 ? (frame / (cols - 1)) * 100 : 0;
      const yPct = rows > 1 ? 6 : 0;
      box.style.backgroundPosition = `${xPct}% ${yPct}%`;
      frame = (frame + 1) % cols;
    }, 180);
  };
  testImg.onerror = () => {
    if (state.previewTimer) clearInterval(state.previewTimer);
    box.style.backgroundImage = 'none';
    box.innerHTML = `<div style="color:#f87171; font-size:11px; padding-top:26px;">❌ File not found:<br><span style="color:#94a3b8;">${escHtml(state.pendingImageUrl.split('/').pop())}</span></div>`;
  };
  testImg.src = state.pendingImageUrl;
}

async function uploadGameAsset() {
  const type = document.getElementById('asset-type').value;
  const rarity = type === 'character' ? document.getElementById('asset-rarity').value : 'Common';
  const floorRule = type !== 'character' ? (document.getElementById('asset-floor').value.trim() || 'all') : 'all';
  const name = document.getElementById('asset-name').value.trim();
  const cols = Number(document.getElementById('sprite-cols').value) || 1;
  const rows = Number(document.getElementById('sprite-rows').value) || 1;

  if (!name || !state.pendingImageUrl) {
    return alert("Enter a name and the sprite filename inside your assets/ folder (e.g., light.png).");
  }

  const newAsset = await apiCall({
    action: 'addGameAsset',
    type,
    rarity,
    floorRule,
    name,
    cols,
    rows,
    imageData: state.pendingImageUrl
  });

  state.assets.push(newAsset);
  state.pendingImageUrl = '';
  document.getElementById('asset-name').value = '';
  document.getElementById('asset-filename').value = '';
  document.getElementById('upload-preview-box').classList.add('hidden');
  renderAssets();
}

function renderAssets() {
  document.getElementById('asset-count').innerText = state.assets.length;
  const container = document.getElementById('assets-list');

  if (state.assets.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:16px;">No assets added yet.</p>';
    return;
  }

  container.innerHTML = state.assets.map(a => {
    const cols = Math.max(1, Number(a.meta?.cols) || 1);
    const rows = Math.max(1, Number(a.meta?.rows) || 1);
    const bgSize = rows > 1 ? `${cols * 100}% ${rows * 128}%` : `${cols * 100}% 100%`;
    const bgPos = rows > 1 ? '0% 6%' : '0% 0%';
    const safeUrl = /^https?:\/\//i.test(String(a.imageData || '')) ? encodeURI(a.imageData) : '';
    const tag = a.type === 'character'
      ? `[CHARACTER • ${escHtml(a.rarity)}]`
      : `[${escHtml(String(a.type).toUpperCase())} • Floor: ${escHtml(a.meta?.floorRule || 'all')}]`;

    return `
      <div class="asset-item">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="asset-thumb" style="background-image:url('${escHtml(safeUrl)}'); background-size:${bgSize}; background-position:${bgPos};"></div>
          <div>
            <div style="font-weight:800; font-size:14px;">${escHtml(a.name)} <span style="font-size:11px; color:#f59e0b;">${tag}</span></div>
            <div style="font-size:11px; color:#94a3b8;">Grid: ${cols} cols × ${rows} rows</div>
          </div>
        </div>
        <button class="btn btn-red" onclick="deleteGameAsset('${escHtml(a.assetId)}')">Delete</button>
      </div>
    `;
  }).join('');
}

async function deleteGameAsset(assetId) {
  if (!confirm("Delete this character/monster from the game?")) return;
  await apiCall({ action: 'deleteGameAsset', assetId });
  state.assets = state.assets.filter(a => a.assetId !== assetId);
  renderAssets();
}

// --- E-CLASS RECORD MATRIX & CSV EXPORT ---
async function loadHistory() {
  if (!state.selectedClassId) return;
  const container = document.getElementById('history-list');
  const summaryBox = document.getElementById('history-summary');
  container.innerHTML = '<p style="text-align:center; padding:20px;">Building E-Class Record...</p>';

  const logs = await apiCall({ action: 'getHistory', classId: state.selectedClassId });
  const roster = state.students
    .filter(s => String(s.classId) === String(state.selectedClassId))
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  if (roster.length === 0) {
    summaryBox.innerHTML = '';
    container.innerHTML = '<p style="text-align:center; padding:20px;">No students in this class yet.</p>';
    return;
  }

  const taskMap = new Map();
  (logs || []).forEach(l => {
    const tName = String(l.taskName || '').trim();
    if (!tName || tName.toLowerCase() === 'enrolled') return;
    if (!taskMap.has(tName)) {
      taskMap.set(tName, { taskName: tName, maxPts: Number(l.points) || 0, date: l.date });
    }
  });

  const tasks = Array.from(taskMap.values());

  const studentScores = {};
  (logs || []).forEach(l => {
    const sId = String(l.studentId);
    const tName = String(l.taskName || '').trim();
    if (!tName || tName.toLowerCase() === 'enrolled') return;
    if (!studentScores[sId]) studentScores[sId] = {};
    studentScores[sId][tName] = (studentScores[sId][tName] || 0) + (Number(l.points) || 0);
  });

  cachedRecordMatrix = { roster, tasks, studentScores };

  if (tasks.length === 0) {
    summaryBox.innerHTML = '';
    container.innerHTML = '<p style="text-align:center; padding:20px;">No tasks recorded yet. Award points in the ⭐ Award Points tab to generate task columns.</p>';
    return;
  }

  let totalMissingCount = 0;
  roster.forEach(s => {
    tasks.forEach(t => {
      if (!studentScores[String(s.studentId)]?.[t.taskName]) totalMissingCount++;
    });
  });

  summaryBox.innerHTML = `
    <div style="background:#090d16; border:1px solid #1e293b; padding:8px 14px; border-radius:8px; font-size:12px;">
      👥 Students: <strong style="color:#38bdf8;">${roster.length}</strong>
    </div>
    <div style="background:#090d16; border:1px solid #1e293b; padding:8px 14px; border-radius:8px; font-size:12px;">
      📝 Total Tasks: <strong style="color:#f59e0b;">${tasks.length}</strong>
    </div>
    <div style="background:#090d16; border:1px solid #7f1d1d; padding:8px 14px; border-radius:8px; font-size:12px;">
      ⚠️ Missing Entries: <strong style="color:#f87171;">${totalMissingCount}</strong>
    </div>
  `;

  const thStyle = 'padding:10px 12px; text-align:left; background:#090d16; color:#f59e0b; font-size:12px; border-bottom:1px solid #334155; white-space:nowrap;';
  const tdStyle = 'padding:9px 12px; border-bottom:1px solid #1e293b; font-size:12px; white-space:nowrap;';

  const headerHtml = `
    <tr>
      <th style="${thStyle} position:sticky; left:0; z-index:2;">Student Name (ID)</th>
      ${tasks.map(t => `<th style="${thStyle} text-align:center;">${escHtml(t.taskName)}<br><span style="font-size:10px; color:#94a3b8; font-weight:400;">(${Number(t.maxPts) || 0} Pts)</span></th>`).join('')}
      <th style="${thStyle} text-align:center;">Missing</th>
      <th style="${thStyle} text-align:right;">Total Pts</th>
    </tr>
  `;

  const rowsHtml = roster.map(s => {
    const sId = String(s.studentId);
    const scores = studentScores[sId] || {};
    let missingCount = 0;
    let taskSum = 0;

    const cells = tasks.map(t => {
      const earned = scores[t.taskName];
      if (earned !== undefined) {
        taskSum += earned;
        return `<td style="${tdStyle} text-align:center; color:#4ade80; font-weight:700;">✓ +${earned}</td>`;
      } else {
        missingCount++;
        return `<td style="${tdStyle} text-align:center;"><span style="background:rgba(239,68,68,0.18); color:#f87171; border:1px solid #991b1b; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:800;">MISSING</span></td>`;
      }
    }).join('');

    return `
      <tr style="background:${missingCount > 0 ? 'rgba(127,29,29,0.08)' : 'transparent'};">
        <td style="${tdStyle} position:sticky; left:0; background:#131b2e; font-weight:700;">
          ${escHtml(s.name)} <span style="color:#94a3b8; font-weight:400;">(${escHtml(sId)})</span>
        </td>
        ${cells}
        <td style="${tdStyle} text-align:center; font-weight:800; color:${missingCount > 0 ? '#f87171' : '#4ade80'};">
          ${missingCount > 0 ? `${missingCount} Missing` : 'Complete'}
        </td>
        <td style="${tdStyle} text-align:right; font-weight:800; color:#f59e0b;">${taskSum} Pts</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>${headerHtml}</thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function exportClassRecordCSV() {
  if (!cachedRecordMatrix || cachedRecordMatrix.tasks.length === 0) {
    return alert("No E-Class Record data to export yet.");
  }
  const { roster, tasks, studentScores } = cachedRecordMatrix;
  const headers = ['Student ID', 'Student Name', ...tasks.map(t => `${t.taskName} (${t.maxPts} Pts)`), 'Missing Count', 'Total Task Pts'];
  const rows = [headers.join(',')];

  roster.forEach(s => {
    const sId = String(s.studentId);
    const scores = studentScores[sId] || {};
    let missing = 0;
    let total = 0;
    const vals = tasks.map(t => {
      if (scores[t.taskName] !== undefined) {
        total += scores[t.taskName];
        return scores[t.taskName];
      } else {
        missing++;
        return 'MISSING';
      }
    });
    rows.push([`"${sId.replace(/"/g, '""')}"`, `"${String(s.name).replace(/"/g, '""')}"`, ...vals, missing, total].join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `EClass_Record_${state.selectedClassId}.csv`;
  link.click();
}
