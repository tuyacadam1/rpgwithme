const API_URL = "https://script.google.com/macros/s/AKfycbxPN7yKyqOwyyxIarj2BTkIcuMOomlfc52zCo2vK4AcVWg8TRofqKaRR-kj1yKiLiENWA/exec";
const ASSETS_BASE_URL = "https://rpgwithme2.vercel.app/assets/";

const state = {
  teacherId: '',
  classes: [],
  students: [],
  assets: [],
  selectedClassId: '',
  pendingImageUrl: '',
  previewTimer: null
};

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
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
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
  state.teacherId = teacherId;
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
    sel.innerHTML = state.classes.map(c => `<option value="${c.classId}">${c.className}</option>`).join('');
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
}

async function createNewClass() {
  const className = prompt("Enter new Class / Section name (e.g., Grade 10 - Einstein):");
  if (!className || !className.trim()) return;

  const newCls = await apiCall({
    action: 'addClass',
    teacherId: state.teacherId,
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
  const list = state.students.filter(s => String(s.classId) === String(state.selectedClassId));
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
        <input type="checkbox" class="pts-check" value="${s.studentId}" style="width:18px; height:18px; margin:0;">
        <div>
          <div style="font-weight:700; color:#f8fafc; font-size:14px;">${s.name}</div>
          <div style="font-size:11px; color:#94a3b8;">ID: ${s.studentId} • Floor ${s.floor || 1}</div>
        </div>
      </div>
      <span style="color:#f59e0b; font-weight:800; font-size:13px;">★ ${s.points || 0} Pts</span>
    </label>
  `).join('');

  rosterContainer.innerHTML = list.map(s => `
    <div class="student-row">
      <div>
        <div style="font-weight:700; font-size:14px;">${s.name}</div>
        <div style="font-size:11px; color:#94a3b8;">ID: ${s.studentId} • Floor ${s.floor || 1}</div>
      </div>
      <span style="color:#38bdf8; font-weight:700; font-size:13px;">★ ${s.points || 0} Pts</span>
    </div>
  `).join('');
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

// --- GAME ASSETS (ASSETS FOLDER / URL WORKFLOW) ---
function toggleAssetFields() {
  const type = document.getElementById('asset-type').value;
  document.getElementById('rarity-field').classList.toggle('hidden', type !== 'character');
  document.getElementById('floor-field').classList.toggle('hidden', type === 'character');
}

function resolveAssetUrl(rawInput) {
  const val = rawInput.trim();
  if (!val) return '';
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  const cleanFile = val.replace(/^\/?assets\//i, '');
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

  box.style.backgroundImage = `url(${state.pendingImageUrl})`;
  box.style.backgroundSize = rows > 1 ? `${cols * 100}% ${rows * 128}%` : `${cols * 100}% 100%`;

  if (state.previewTimer) clearInterval(state.previewTimer);
  let frame = 0;
  state.previewTimer = setInterval(() => {
    const xPct = cols > 1 ? (frame / (cols - 1)) * 100 : 0;
    const yPct = rows > 1 ? 6 : 0;
    box.style.backgroundPosition = `${xPct}% ${yPct}%`;
    frame = (frame + 1) % cols;
  }, 140);
}

async function uploadGameAsset() {
  const type = document.getElementById('asset-type').value;
  const rarity = type === 'character' ? document.getElementById('asset-rarity').value : 'Common';
  const floorRule = type !== 'character' ? (document.getElementById('asset-floor').value.trim() || 'all') : 'all';
  const name = document.getElementById('asset-name').value.trim();
  const cols = Number(document.getElementById('sprite-cols').value) || 1;
  const rows = Number(document.getElementById('sprite-rows').value) || 1;

  if (!name || !state.pendingImageUrl) {
    return alert("Enter a name and the sprite filename inside your assets/ folder (e.g., asta.png).");
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
    const cols = Math.max(1, a.meta?.cols || 1);
    const rows = Math.max(1, a.meta?.rows || 1);
    const bgSize = rows > 1 ? `${cols * 100}% ${rows * 128}%` : `${cols * 100}% 100%`;
    const bgPos = rows > 1 ? '0% 6%' : '0% 0%';
    const tag = a.type === 'character'
      ? `[CHARACTER • ${a.rarity}]`
      : `[${a.type.toUpperCase()} • Floor: ${a.meta?.floorRule || 'all'}]`;

    return `
      <div class="asset-item">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="asset-thumb" style="background-image:url(${a.imageData}); background-size:${bgSize}; background-position:${bgPos};"></div>
          <div>
            <div style="font-weight:800; font-size:14px;">${a.name} <span style="font-size:11px; color:#f59e0b;">${tag}</span></div>
            <div style="font-size:11px; color:#94a3b8;">Grid: ${cols} cols × ${rows} rows</div>
          </div>
        </div>
        <button class="btn btn-red" onclick="deleteGameAsset('${a.assetId}')">Delete</button>
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

// --- HISTORY ---
async function loadHistory() {
  if (!state.selectedClassId) return;
  const logs = await apiCall({ action: 'getHistory', classId: state.selectedClassId });
  const container = document.getElementById('history-list');

  if (!logs || logs.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:16px;">No points awarded yet in this class.</p>';
    return;
  }

  container.innerHTML = logs.slice().reverse().map(l => `
    <div class="student-row">
      <div>
        <div style="font-weight:700; font-size:13px;">${l.studentName} <span style="color:#94a3b8; font-weight:400;">(${l.studentId})</span></div>
        <div style="font-size:11px; color:#60a5fa;">${l.taskName} • ${l.date}</div>
      </div>
      <span style="color:#10b981; font-weight:800;">+${l.points} Pts</span>
    </div>
  `).join('');
}
