const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";

let state = {
  teacherId: '',
  name: '',
  classes: [],
  students: [],
  activeClassId: '',
  history: []
};

async function apiCall(payload) {
  const toast = document.getElementById('toast');
  toast.style.display = 'block';
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
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

  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('welcome-msg').innerText = `Hi, ${state.name}`;

  renderClasses();
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
    list.innerHTML += `<div style="padding:8px; border-bottom:1px solid #334155;"><b>${c.className}</b> <span style="color:var(--muted); font-size:12px;">(${c.classId})</span></div>`;
  });

  if (state.classes.length > 0 && !state.activeClassId) {
    state.activeClassId = state.classes[0].classId;
  }
  select.value = state.activeClassId;
  onClassChange();
}

function onClassChange() {
  state.activeClassId = document.getElementById('active-class-select').value;
  const classStudents = state.students.filter(s => s.classId === state.activeClassId);
  
  document.getElementById('student-count').innerText = classStudents.length;
  
  // Render Roster
  document.getElementById('roster-list').innerHTML = classStudents.map(s => 
    `<div style="padding:6px 0; border-bottom:1px solid #334155; display:flex; justify-content:space-between;">
      <span>${s.name} <small style="color:var(--muted)">(${s.studentId})</small></span>
      <span>Floor ${s.floor} | Pts: ${s.points}</span>
    </div>`
  ).join('');

  // Render Points Checklist
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
  if (!state.activeClassId) return alert("Create/Select a class first.");
  const raw = document.getElementById('bulk-student-input').value.trim();
  if (!raw) return;

  const students = raw.split('\n').map(line => {
    const [id, ...nameParts] = line.split(',');
    return { id: id?.trim(), name: nameParts.join(',').trim() };
  }).filter(s => s.id && s.name);

  const res = await apiCall({ action: 'bulkAddStudents', classId: state.activeClassId, students });
  alert(`Successfully added ${res.added} new students!`);
  
  // Update local cache immediately
  students.forEach(s => {
    if (!state.students.some(existing => existing.studentId === s.id)) {
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

  if (!taskName || !points || selectedIds.length === 0) {
    return alert("Enter task name, points, and select at least 1 student.");
  }

  await apiCall({
    action: 'bulkAddPoints',
    classId: state.activeClassId,
    taskName,
    points,
    studentIds: selectedIds
  });

  // Update local state
  state.students.forEach(s => {
    if (selectedIds.includes(String(s.studentId))) s.points = Number(s.points) + points;
  });

  alert(`Credited ${points} pts for "${taskName}" to ${selectedIds.length} students!`);
  document.querySelectorAll('.stu-chk').forEach(b => b.checked = false);
  onClassChange();
}

async function loadHistory() {
  if (!state.activeClassId) return;
  state.history = await apiCall({ action: 'getHistory', classId: state.activeClassId });
  renderHistory();
}

function renderHistory() {
  const filter = document.getElementById('filter-task').value.toLowerCase().trim();
  const classStudents = state.students.filter(s => s.classId === state.activeClassId);
  const output = document.getElementById('history-output');

  if (filter) {
    // Show who HAS and HAS NOT completed the filtered task
    const matchedLogs = state.history.filter(h => h.taskName.toLowerCase().includes(filter));
    const creditedIds = new Set(matchedLogs.map(h => String(h.studentId)));
    const uncredited = classStudents.filter(s => !creditedIds.has(String(s.studentId)));

    output.innerHTML = `
      <h4 style="color:#f87171; margin:10px 0 5px;">❌ Not Yet Credited (${uncredited.length})</h4>
      ${uncredited.map(s => `<div style="font-size:13px; padding:4px 0;">• ${s.name} (${s.studentId})</div>`).join('') || '<small>Everyone credited!</small>'}
      <h4 style="color:#4ade80; margin:12px 0 5px;">✅ Credited (${matchedLogs.length})</h4>
      ${matchedLogs.map(l => `<div style="font-size:13px; padding:4px 0;">• ${l.studentName} - <b>${l.taskName}</b> (+${l.points})</div>`).join('')}
    `;
  } else {
    output.innerHTML = state.history.slice().reverse().map(h => 
      `<div style="padding:8px 0; border-bottom:1px solid #334155; font-size:13px;">
        <b>${h.studentName}</b> earned <span style="color:var(--gold)">+${h.points} pts</span> for <i>${h.taskName}</i> <small style="color:var(--muted)">(${h.date})</small>
      </div>`
    ).join('') || '<p style="color:var(--muted)">No records yet.</p>';
  }
}
