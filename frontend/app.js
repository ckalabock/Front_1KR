const STORAGE_KEY = "notes";
const CONTENT_PATH = "/content";

const state = {
  activePage: "home",
  config: null,
  serviceWorkerRegistration: null,
  socket: null,
  socketId: "",
};

const refs = {
  contentHost: document.getElementById("app-content"),
  homeButton: document.getElementById("home-btn"),
  aboutButton: document.getElementById("about-btn"),
  enablePushButton: document.getElementById("enable-push"),
  disablePushButton: document.getElementById("disable-push"),
  swStatus: document.getElementById("sw-status"),
  socketStatus: document.getElementById("socket-status"),
  pushStatus: document.getElementById("push-status"),
  toastStack: document.getElementById("toast-stack"),
};

document.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});

async function initializeApp() {
  bindShellEvents();
  initSocket();
  registerConnectionHints();
  await loadAppConfig();
  await registerServiceWorker();
  await syncPushControls();
  await loadContent("home");
}

function bindShellEvents() {
  refs.homeButton?.addEventListener("click", () => {
    void loadContent("home");
  });

  refs.aboutButton?.addEventListener("click", () => {
    void loadContent("about");
  });

  refs.enablePushButton?.addEventListener("click", () => {
    void handleEnablePush();
  });

  refs.disablePushButton?.addEventListener("click", () => {
    void handleDisablePush();
  });
}

function registerConnectionHints() {
  window.addEventListener("online", () => {
    showToast("Соединение восстановлено. Сеть снова доступна.", "success");
  });

  window.addEventListener("offline", () => {
    showToast("Вы офлайн. Интерфейс продолжит работать из кэша.", "warn");
  });
}

async function loadAppConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error(`Config request failed: ${response.status}`);
    }

    state.config = await response.json();
  } catch (error) {
    console.error(error);
    showToast("Не удалось получить конфигурацию сервера. Push-функции могут быть недоступны.", "warn");
  }
}

async function loadContent(page) {
  try {
    const response = await fetch(`${CONTENT_PATH}/${page}.html`);
    if (!response.ok) {
      throw new Error(`Failed to load ${page}: ${response.status}`);
    }

    refs.contentHost.innerHTML = await response.text();
    state.activePage = page;
    syncActiveTab();

    if (page === "home") {
      initNotesPage();
    }
  } catch (error) {
    console.error(error);
    refs.contentHost.innerHTML = `
      <section class="panel">
        <h2>Страница временно недоступна</h2>
        <p>Если вы уже открывали приложение раньше, попробуйте обновить вкладку после подключения к сети.</p>
      </section>
    `;
  }
}

function syncActiveTab() {
  refs.homeButton?.classList.toggle("active", state.activePage === "home");
  refs.aboutButton?.classList.toggle("active", state.activePage === "about");
}

function initSocket() {
  if (typeof window.io !== "function") {
    refs.socketStatus.textContent = "скрипт не загружен";
    return;
  }

  const socket = window.io();
  state.socket = socket;

  socket.on("connect", () => {
    state.socketId = socket.id;
    refs.socketStatus.textContent = "подключен";
  });

  socket.on("disconnect", () => {
    refs.socketStatus.textContent = "отключен";
  });

  socket.on("taskAdded", (payload) => {
    if (payload?.socketId === state.socketId) {
      return;
    }

    showToast(`Во второй вкладке появилась заметка: ${payload.text}`, "info");
  });

  socket.on("reminderScheduled", (payload) => {
    if (payload?.socketId === state.socketId) {
      return;
    }

    const when = formatReminder(payload.reminderTime);
    showToast(`Запланировано напоминание: ${payload.text} (${when})`, "success");
  });

  socket.on("reminderTriggered", (payload) => {
    showToast(`Сработало напоминание: ${payload.text}`, "warn");
  });

  socket.on("taskError", (payload) => {
    showToast(payload?.message || "Сервер отклонил заметку.", "error");
  });

  socket.on("reminderError", (payload) => {
    showToast(payload?.message || "Сервер отклонил напоминание.", "error");
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    refs.swStatus.textContent = "не поддерживается";
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js");
    const registration = await navigator.serviceWorker.ready;
    state.serviceWorkerRegistration = registration;
    refs.swStatus.textContent = "активен";
  } catch (error) {
    console.error(error);
    refs.swStatus.textContent = "ошибка";
    showToast("Service Worker не удалось зарегистрировать.", "error");
  }
}

function canUsePush() {
  return (
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Boolean(state.serviceWorkerRegistration)
  );
}

async function persistSubscription(subscription) {
  const response = await fetch("/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });

  if (!response.ok) {
    throw new Error(`Subscribe request failed: ${response.status}`);
  }
}

async function syncPushControls() {
  const pushUnsupported = !canUsePush();

  if (pushUnsupported) {
    refs.pushStatus.textContent = "не поддерживается";
    refs.enablePushButton.disabled = true;
    refs.disablePushButton.disabled = true;
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    refs.pushStatus.textContent = "активирован";
    refs.enablePushButton.hidden = true;
    refs.disablePushButton.hidden = false;
  } else {
    refs.pushStatus.textContent =
      Notification.permission === "denied" ? "запрещен браузером" : "не активирован";
    refs.enablePushButton.hidden = false;
    refs.disablePushButton.hidden = true;
  }
}

async function handleEnablePush() {
  if (!canUsePush()) {
    showToast("Push-уведомления доступны только в secure context: откройте сайт через HTTPS или localhost.", "error");
    await syncPushControls();
    return;
  }

  if (!state.config?.publicVapidKey) {
    showToast("Сервер не вернул публичный VAPID-ключ.", "error");
    return;
  }

  if (Notification.permission === "denied") {
    showToast("Уведомления запрещены в браузере. Разрешите их вручную в настройках.", "error");
    return;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("Для push-уведомлений нужно разрешить уведомления браузера.", "warn");
      return;
    }
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.config.publicVapidKey),
      });
    }

    await persistSubscription(subscription);

    showToast("Push-уведомления включены.", "success");
    await syncPushControls();
  } catch (error) {
    console.error(error);
    showToast("Не удалось включить push-уведомления.", "error");
  }
}

async function handleDisablePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await fetch("/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      await subscription.unsubscribe();
    }

    showToast("Push-уведомления отключены.", "info");
    await syncPushControls();
  } catch (error) {
    console.error(error);
    showToast("Не удалось отключить push-уведомления.", "error");
  }
}

function initNotesPage() {
  const quickForm = document.getElementById("note-form");
  const quickInput = document.getElementById("note-input");
  const reminderForm = document.getElementById("reminder-form");
  const reminderText = document.getElementById("reminder-text");
  const reminderTime = document.getElementById("reminder-time");
  const notesList = document.getElementById("notes-list");
  const notesCount = document.getElementById("notes-count");

  if (!quickForm || !quickInput || !reminderForm || !reminderText || !reminderTime || !notesList) {
    return;
  }

  reminderTime.min = toDateTimeLocalValue(Date.now() + 60 * 1000);

  quickForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = quickInput.value.trim();
    if (!text) {
      return;
    }

    addNote(text, null);
    quickInput.value = "";
    renderNotes(notesList, notesCount);
  });

  reminderForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = reminderText.value.trim();
    const selectedDate = reminderTime.value;
    if (!text || !selectedDate) {
      return;
    }

    const timestamp = new Date(selectedDate).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      showToast("Дата напоминания должна быть в будущем.", "error");
      return;
    }

    addNote(text, timestamp);
    reminderText.value = "";
    reminderTime.value = "";
    reminderTime.min = toDateTimeLocalValue(Date.now() + 60 * 1000);
    renderNotes(notesList, notesCount);
  });

  renderNotes(notesList, notesCount);
}

function createNoteId() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function readNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const baseTimestamp = Date.now();
    const normalized = raw
      .map((item, index) => normalizeStoredNote(item, baseTimestamp + index))
      .filter(Boolean);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.error(error);
    localStorage.setItem(STORAGE_KEY, "[]");
    return [];
  }
}

function normalizeStoredNote(item, fallbackId) {
  if (typeof item === "string") {
    return {
      id: fallbackId,
      text: item,
      reminder: null,
      createdAt: fallbackId,
    };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const text = String(item.text || "").trim();
  if (!text) {
    return null;
  }

  const reminder = item.reminder === null || item.reminder === undefined ? null : Number(item.reminder);

  return {
    id: Number(item.id) || fallbackId,
    text,
    reminder: Number.isFinite(reminder) ? reminder : null,
    createdAt: Number(item.createdAt) || fallbackId,
  };
}

function writeNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function addNote(text, reminderTimestamp) {
  const notes = readNotes();
  const note = {
    id: createNoteId(),
    text,
    reminder: reminderTimestamp,
    createdAt: Date.now(),
  };

  notes.push(note);
  writeNotes(notes);

  if (reminderTimestamp && state.socket) {
    state.socket.emit("newReminder", {
      id: note.id,
      text: note.text,
      reminderTime: reminderTimestamp,
    });
    showToast(`Напоминание сохранено на ${formatReminder(reminderTimestamp)}.`, "success");
  } else {
    state.socket?.emit("newTask", { id: note.id, text: note.text });
    showToast("Заметка сохранена локально и отправлена в realtime-канал.", "info");
  }
}

function renderNotes(notesList, notesCount) {
  const notes = readNotes().sort((left, right) => right.createdAt - left.createdAt);

  if (notesCount) {
    notesCount.textContent = `${notes.length}`;
  }

  if (!notes.length) {
    notesList.innerHTML = `
      <li class="empty-state">
        <strong>Пока здесь пусто.</strong>
        <p>Добавьте обычную заметку или создайте напоминание с датой и временем.</p>
      </li>
    `;
    return;
  }

  notesList.innerHTML = notes
    .map((note) => {
      const reminder = note.reminder
        ? `<span class="note-tag reminder">Напоминание: ${escapeHtml(formatReminder(note.reminder))}</span>`
        : `<span class="note-tag">Без напоминания</span>`;

      return `
        <li class="note-card ${note.reminder ? "note-card--reminder" : ""}">
          <div class="note-copy">
            <p>${escapeHtml(note.text)}</p>
            <div class="note-meta">
              <span class="note-tag subtle">Создано: ${escapeHtml(
                new Date(note.createdAt).toLocaleString("ru-RU")
              )}</span>
              ${reminder}
            </div>
          </div>
        </li>
      `;
    })
    .join("");
}

function showToast(message, tone = "info") {
  if (!refs.toastStack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  refs.toastStack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => {
      toast.remove();
    }, 240);
  }, 4200);
}

function formatReminder(timestamp) {
  return new Date(timestamp).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function toDateTimeLocalValue(timestamp) {
  const offset = new Date().getTimezoneOffset();
  return new Date(timestamp - offset * 60 * 1000).toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
