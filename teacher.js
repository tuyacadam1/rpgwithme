const API_URL = "https://script.google.com/macros/s/AKfycbxPN7yKyqOwyyxIarj2BTkIcuMOomlfc52zCo2vK4AcVWg8TRofqKaRR-kj1yKiLiENWA/exec";

let state = {
  teacherId: '', name: '', classes: [], students: [],
  activeClassId: '', history: [], assets: [], pendingImageBase64: ''
};

async function apiCall(payload) {
  const toast = document.getElementById('toast');
  toast.style.display = 'block';
  try {
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    const json = await res.json();
    if (json.status === 'error') throw new Error(json.message);
    return json.data;
  } catch (err) {
    alert("Error: " + err.message);
    throw err;
  } finally {
    toast.style.display = 'none';
  }
}

async function loginTeacher() {
  const teacherId = document.getElementById('t-id').value.trim();
  const password = document.getElementById('t-pass').value.trim();
  if (!teacherId || !password) return alert("Enter credentials");

  const data = await apiCall({ action: 'teacherLogin', teacherId, password });
  state.teacherId = teacherId;
  state.name = data.name;
  state.classes = data.classes;
  state.students = data.students;
  state.assets = data.assets || [];

  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('welcome-msg').innerText = `Hi, ${state.name}`;

  renderClasses();
  renderAssets();
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
  document.getElementById('tab-' + tabName).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tabName === 'history') loadHistory();
}

function renderClasses() {
  const select = document.getElementById('active-class-select');
  const list = document.getElementById('class-list');
  select.innerHTML = '';
  list.innerHTML = '';

  state.classes.forEach(c => {
    select.innerHTML += `<option value="${c.classId}">${c.className}</option>`;
    list.innerHTML += `<div style="padding:8px; border-bottom:1px solid #334155;"><b>${c.className}</b> <small style="color:var(--muted)">(${c.classId})</small></div>`;
  });

  if (state.classes.length > 0 && !state.activeClassId) state.activeClassId = state.classes[0].classId;
  select.value = state.activeClassId;
  onClassChange();
}

function onClassChange() {
  state.activeClassId = document.getElementById('active-class-select').value;
  const classStudents = state.students.filter(s => s.classId === state.activeClassId);
  
  document.getElementById('student-count').innerText = classStudents.length;
  document.getElementById('roster-list').innerHTML = classStudents.map(s => 
    `<div style="padding:6px 0; border-bottom:1px solid #334155; display:flex; justify-content:space-between;">
      <span>${s.name} <small style="color:var(--muted)">(${s.studentId})</small></span>
      <span>Floor ${s.floor} | Unspent: ${s.points}</span>
    </div>`
  ).join('');

  document.getElementById('student-checklist').innerHTML = classStudents.map(s => 
    `<label class="checklist-item">
      <input type="checkbox" class="stu-chk" value="${s.studentId}">
      <span>${s.name} (${s.studentId})</span>
    </label>`
  ).join('');
}

async function createClass() {
  const className = document.getElementById('new-class-name').value.trim();
  if (!className) return;
  const newClass = await apiCall({ action: 'addClass', teacherId: state.teacherId, className });
  state.classes.push(newClass);
  state.activeClassId = newClass.classId;
  document.getElementById('new-class-name').value = '';
  renderClasses();
}

async function bulkAddStudents() {
  if (!state.activeClassId) return alert("Select a class first.");
  const raw = document.getElementById('bulk-student-input').value.trim();
  if (!raw) return;

  const students = raw.split('\n').map(line => {
    const [id, ...nameParts] = line.split(',');
    return { id: id?.trim(), name: nameParts.join(',').trim() };
  }).filter(s => s.id && s.name);

  const res = await apiCall({ action: 'bulkAddStudents', classId: state.activeClassId, students });
  alert(`Added ${res.added} new students!`);
  students.forEach(s => {
    if (!state.students.some(ex => ex.studentId === s.id)) {
      state.students.push({ studentId: s.id, classId: state.activeClassId, name: s.name, points: 0, floor: 1 });
    }
  });
  document.getElementById('bulk-student-input').value = '';
  onClassChange();
}

function toggleAllCheckboxes() {
  const boxes = document.querySelectorAll('.stu-chk');
  const allChecked = Array.from(boxes).every(b => b.checked);
  boxes.forEach(b => b.checked = !allChecked);
}

async function submitBulkPoints() {
  const taskName = document.getElementById('task-name').value.trim();
  const points = Number(document.getElementById('task-points').value);
  const selectedIds = Array.from(document.querySelectorAll('.stu-chk:checked')).map(b => b.value);

  if (!taskName || !points || selectedIds.length === 0) return alert("Fill out task, points, and select students.");

  await apiCall({ action: 'bulkAddPoints', classId: state.activeClassId, taskName, points, studentIds: selectedIds });
  state.students.forEach(s => {
    if (selectedIds.includes(String(s.studentId))) s.points = Number(s.points) + points;
  });

  alert(`Credited ${points} pts for "${taskName}"!`);
  document.querySelectorAll('.stu-chk').forEach(b => b.checked = false);
  onClassChange();
}

// --- E-CLASS RECORD SPREADSHEET ---
async function loadHistory() {
  if (!state.activeClassId) return;
  state.history = await apiCall({ action: 'getHistory', classId: state.activeClassId });
  renderEClassRecord();
}

function renderEClassRecord() {
  const container = document.getElementById('ecr-container');
  const query = (document.getElementById('ecr-search')?.value || '').toLowerCase();
  const classStudents = state.students.filter(s =>
    s.classId === state.activeClassId &&
    (s.name.toLowerCase().includes(query) || s.studentId.toLowerCase().includes(query))
  );

  if (classStudents.length === 0) {
    container.innerHTML = '<p style="padding:12px; color:var(--muted);">No matching students in this class.</p>';
    return;
  }

  const uniqueTasks = [...new Set(state.history.map(h => h.taskName))];
  const scoreMap = {};
  state.history.forEach(h => {
    if (!scoreMap[h.studentId]) scoreMap[h.studentId] = {};
    scoreMap[h.studentId][h.taskName] = (scoreMap[h.studentId][h.taskName] || 0) + Number(h.points);
  });

  let html = `<table class="ecr-table"><thead><tr>
    <th class="sticky-col">Student Name</th>
    <th>ID</th>
    ${uniqueTasks.map(t => `<th>${t}</th>`).join('')}
    <th style="color:#4ade80;">TOTAL</th>
  </tr></thead><tbody>`;

  classStudents.forEach(stu => {
    let total = 0;
    const cells = uniqueTasks.map(task => {
      const val = scoreMap[stu.studentId]?.[task];
      if (val !== undefined) {
        total += val;
        return `<td class="cell-credited">${val}</td>`;
      }
      return `<td class="cell-missing">—</td>`;
    }).join('');

    html += `<tr>
      <td class="sticky-col">${stu.name}</td>
      <td style="color:var(--muted)">${stu.studentId}</td>
      ${cells}
      <td style="font-weight:800; color:var(--gold);">${total}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// --- FILE UPLOAD & CLIENT-SIDE SPRITE COMPRESSION ---
function toggleAssetFields() {
  const type = document.getElementById('asset-type').value;
  document.getElementById('asset-gender-wrap').classList.toggle('hidden', type !== 'character');
  document.getElementById('asset-floor-wrap').classList.toggle('hidden', type === 'character');
}

function previewCompressedImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Resize to 220x220 max so sprites load in milliseconds for 50+ students
      const canvas = document.createElement('canvas');
      const maxDim = 220;
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } }
      else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // WebP preserves transparency at a fraction of PNG file size
      state.pendingImageBase64 = canvas.toDataURL('image/webp', 0.8);
      document.getElementById('upload-preview-img').src = state.pendingImageBase64;
      document.getElementById('upload-preview-box').classList.remove('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function uploadGameAsset() {
  const type = document.getElementById('asset-type').value;
  const gender = type === 'character' ? document.getElementById('asset-gender').value : 'Any';
  const floorRule = type !== 'character' ? (document.getElementById('asset-floor').value.trim() || 'all') : 'all';
  const name = document.getElementById('asset-name').value.trim();

  if (!name || !state.pendingImageBase64) return alert("Enter a name and select an image file.");

  const newAsset = await apiCall({
    action: 'addGameAsset', type, gender, floorRule, name, imageData: state.pendingImageBase64
  });

  state.assets.push(newAsset);
  state.pendingImageBase64 = '';
  document.getElementById('asset-name').value = '';
  document.getElementById('asset-file').value = '';
  document.getElementById('upload-preview-box').classList.add('hidden');
  renderAssets();
}

async function deleteAsset(assetId) {
  await apiCall({ action: 'deleteGameAsset', assetId });
  state.assets = state.assets.filter(a => a.assetId !== assetId);
  renderAssets();
}

function renderAssets() {
  document.getElementById('asset-count').innerText = state.assets.length;
  document.getElementById('asset-list').innerHTML = state.assets.map(a => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #334155;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${a.imageData}" class="asset-thumb">
        <div>
          <b>${a.name}</b> <span style="font-size:11px; color:var(--gold);">[${a.type.toUpperCase()}]</span>
          <div style="font-size:11px; color:var(--muted);">${a.type === 'character' ? 'Gender: ' + a.gender : 'Floor: ' + a.floorRule}</div>
        </div>
      </div>
      <button class="btn btn-sm" style="background:#ef4444;" onclick="deleteAsset('${a.assetId}')">Delete</button>
    </div>
  `).join('') || '<p style="font-size:12px; color:var(--muted);">No custom sprites uploaded yet.</p>';
}
