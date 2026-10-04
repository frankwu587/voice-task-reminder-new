const STORAGE_KEY = "voice-task-reminder-tasks";
const taskInput = document.querySelector("#task-input");
const addButton = document.querySelector("#add-button");
const voiceButton = document.querySelector("#voice-button");
const voiceStatus = document.querySelector("#voice-status");
const parsePreview = document.querySelector("#parse-preview");
let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

function chineseNumberToNumber(text) {
  const digits = { "零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  if (!text.includes("十")) return String(digits[text] ?? text);
  const parts = text.split("十");
  const tens = parts[0] ? digits[parts[0]] : 1;
  const ones = parts[1] ? (digits[parts[1]] || 0) : 0;
  return String(tens * 10 + ones);
}

function normalizeText(text) {
  return text.trim()
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/[，。！？、,.!?\s]/g, "")
    .replace(/[點鐘点時]/g, "點")
    .replace(/分(?!鐘)/g, "分鐘")
    .replace(/個小時|鐘頭/g, "小時")
    .replace(/[零〇一二兩三四五六七八九十]+/g, chineseNumberToNumber);
}

function nextWeekday(base, weekday, nextWeek) {
  const date = new Date(base); date.setHours(0, 0, 0, 0);
  const mondayIndex = (date.getDay() + 6) % 7;
  const offset = nextWeek ? 7 - mondayIndex + weekday : weekday - mondayIndex;
  date.setDate(date.getDate() + offset);
  return date;
}

function parseTask(raw) {
  const text = normalizeText(raw);
  const now = new Date();
  let date = null;
  let hasTime = false;
  const relative = (minutes) => { date = new Date(now.getTime() + minutes * 60000); hasTime = true; };
  let match;
  if (/等一下|待會/.test(text)) relative(10);
  else if (/晚1點/.test(text)) relative(60);
  else if ((match = text.match(/(\d+)分鐘後/))) relative(Number(match[1]));
  else if ((match = text.match(/(\d+)個?半小時後/))) relative(Number(match[1]) * 60 + 30);
  else if (/半小時後/.test(text)) relative(30);
  else if ((match = text.match(/(\d+)個?小時後/))) relative(Number(match[1]) * 60);
  else {
    if (/明天|明早|明晚/.test(text)) { date = new Date(now); date.setDate(date.getDate() + 1); }
    else if ((match = text.match(/下週([1-7])/))) date = nextWeekday(now, Number(match[1]) - 1, true);
    else if ((match = text.match(/這禮拜([1-7])/))) date = nextWeekday(now, Number(match[1]) - 1, false);
    else if (/今天/.test(text)) date = new Date(now);
    const period = text.match(/(早上|上午|下午|晚上|晚)/)?.[1];
    const clock = text.match(/(\d{1,2})點(半|(\d+)分鐘)?/);
    if (clock && date) {
      let hour = Number(clock[1]); let minute = clock[2] === "半" ? 30 : Number(clock[3] || 0);
      if ((period === "下午" || period === "晚上" || period === "晚") && hour < 12) hour += 12;
      date.setHours(hour, minute, 0, 0); hasTime = true;
    } else if (date && (/明早/.test(text) || /明晚/.test(text))) {
      date.setHours(/明晚/.test(text) ? 19 : 8, 0, 0, 0); hasTime = true;
    }
  }
  const name = text
    .replace(/(\d+)個?半小時後|(\d+)個?小時後|(\d+)分鐘後|半小時後|等一下|待會|晚1點/g, "")
    .replace(/今天|明天|明早|明晚|下週[1-7]|這禮拜[1-7]|早上|上午|下午|晚上|晚|睡前/g, "")
    .replace(/\d{1,2}點(半|\d+分鐘)?/g, "").replace(/提醒我/g, "").trim() || raw.trim();
  return { name, reminderAt: hasTime ? date.toISOString() : null };
}

function displayTime(iso) {
  if (!iso) return "提醒時間：未設定";
  return "提醒時間：" + new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function calendarDate(date) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}
function icsEscape(value) { return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n"); }
function addCalendarButtons(container, task) {
  const start = new Date(task.reminderAt); const end = new Date(start.getTime() + 30 * 60000);
  const google = document.createElement("button"); google.textContent = "加入 Google Calendar";
  google.onclick = () => { const url = new URL("https://calendar.google.com/calendar/render?action=TEMPLATE"); url.searchParams.set("text", task.name); url.searchParams.set("dates", `${calendarDate(start)}/${calendarDate(end)}`); url.searchParams.set("details", `原始輸入：${task.original}`); window.open(url, "_blank", "noopener"); };
  const apple = document.createElement("button"); apple.textContent = "加入 Apple 行事曆";
  apple.onclick = () => { const content = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:${icsEscape(task.name)}\r\nDTSTART:${calendarDate(start)}\r\nDTEND:${calendarDate(end)}\r\nDESCRIPTION:${icsEscape("原始輸入：" + task.original)}\r\nEND:VEVENT\r\nEND:VCALENDAR`; const blob = new Blob([content], { type: "text/calendar;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${task.name}.ics`; link.click(); URL.revokeObjectURL(link.href); };
  container.append(google, apple);
}
function renderTasks() {
  const lists = { overdue: document.querySelector("#overdue-list"), today: document.querySelector("#today-list"), upcoming: document.querySelector("#upcoming-list"), done: document.querySelector("#done-list") };
  Object.values(lists).forEach(list => list.replaceChildren());
  const now = new Date(); const todayEnd = new Date(now); todayEnd.setHours(24, 0, 0, 0); const counts = { overdue: 0, today: 0, upcoming: 0, done: 0 };
  [...tasks].sort((a, b) => (a.reminderAt || "9999").localeCompare(b.reminderAt || "9999")).forEach(task => {
    let group = "upcoming"; if (task.completed) group = "done"; else if (task.reminderAt && new Date(task.reminderAt) <= now) group = "overdue"; else if (task.reminderAt && new Date(task.reminderAt) < todayEnd) group = "today";
    counts[group]++;
    const card = document.querySelector("#task-template").content.cloneNode(true); const article = card.querySelector("article");
    article.classList.toggle("completed", task.completed); card.querySelector("h3").textContent = task.name; card.querySelector(".reminder").textContent = displayTime(task.reminderAt); card.querySelector(".original").textContent = `原始輸入：${task.original}`;
    const toggle = card.querySelector(".complete-toggle"); toggle.checked = task.completed; toggle.onchange = () => { task.completed = toggle.checked; saveTasks(); renderTasks(); };
    card.querySelector(".delete-button").onclick = () => { tasks = tasks.filter(item => item.id !== task.id); saveTasks(); renderTasks(); };
    if (task.reminderAt) addCalendarButtons(card.querySelector(".calendar-actions"), task); lists[group].append(card);
  });
  Object.entries(counts).forEach(([key, value]) => document.querySelector(`#${key}-count`).textContent = value);
}
function addTask() { const raw = taskInput.value.trim(); if (!raw) { parsePreview.textContent = "請先輸入待辦事項。"; return; } const parsed = parseTask(raw); tasks.unshift({ id: Date.now(), original: raw, ...parsed, completed: false }); saveTasks(); taskInput.value = ""; parsePreview.textContent = parsed.reminderAt ? `已解析：${displayTime(parsed.reminderAt)}` : "找不到明確時間，已建立為未設定提醒的任務。"; renderTasks(); }
taskInput.addEventListener("input", () => { const raw = taskInput.value.trim(); if (!raw) return parsePreview.textContent = ""; const parsed = parseTask(raw); parsePreview.textContent = parsed.reminderAt ? `預計：${displayTime(parsed.reminderAt)}` : "尚未辨識到明確提醒時間。"; });
addButton.onclick = addTask; taskInput.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") addTask(); });
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) { voiceButton.disabled = true; voiceStatus.textContent = "此瀏覽器不支援語音輸入，請改用打字"; } else {
  const recognition = new Recognition(); recognition.lang = "zh-TW"; recognition.interimResults = false;
  voiceButton.onclick = () => { recognition.start(); };
  recognition.onstart = () => { voiceButton.textContent = "聆聽中..."; voiceButton.disabled = true; voiceStatus.textContent = "請開始說話。"; };
  recognition.onresult = event => { taskInput.value = event.results[0][0].transcript; taskInput.dispatchEvent(new Event("input")); };
  recognition.onerror = () => { voiceStatus.textContent = "語音輸入失敗，請再試一次或改用打字。"; };
  recognition.onend = () => { voiceButton.textContent = "語音輸入"; voiceButton.disabled = false; };
}
renderTasks();
