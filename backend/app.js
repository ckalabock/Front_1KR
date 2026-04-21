const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const express = require("express");
const cors = require("cors");
const webpush = require("web-push");
const { Server } = require("socket.io");

const HTTP_PORT = Number(process.env.PORT) || 3001;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");
const CERTS_DIR = path.join(__dirname, "certs");
const HTTPS_PFX_PATH = process.env.HTTPS_PFX_PATH || path.join(CERTS_DIR, "localhost.pfx");
const HTTPS_PFX_PASSPHRASE =
  process.env.HTTPS_PFX_PASSPHRASE ||
  (fs.existsSync(path.join(CERTS_DIR, "passphrase.txt"))
    ? fs.readFileSync(path.join(CERTS_DIR, "passphrase.txt"), "utf8").trim()
    : "");

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BLUVUZCxMj_PiRiFBKcDB_Jy_8qBLA_D7IYpqj_uCvEw2RzJyqx3VNP4Zd8m6UzPyRuaqN59pdea0h5NdQKYsoA";
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "c2eHQcrsH_5-2Cm7J3kFJo9MOMGB6TZrDCdmozgqnCA";
const VAPID_CONTACT = process.env.VAPID_CONTACT || "mailto:front1kr@example.com";
const REMINDER_SNOOZE_MS = 5 * 60 * 1000;

const app = express();

let subscriptions = [];
const reminders = new Map();
const ioServers = [];

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

function readHttpsOptions() {
  if (!fs.existsSync(HTTPS_PFX_PATH)) {
    return null;
  }

  return {
    pfx: fs.readFileSync(HTTPS_PFX_PATH),
    passphrase: HTTPS_PFX_PASSPHRASE,
  };
}

function broadcast(eventName, payload) {
  ioServers.forEach((io) => io.emit(eventName, payload));
}

function sanitizeTaskPayload(task, socketId) {
  const text = String(task?.text || "").trim();
  const reminderTime =
    task?.reminderTime === null || task?.reminderTime === undefined
      ? null
      : Number(task.reminderTime);

  if (!text) {
    return null;
  }

  return {
    id: Number(task?.id) || Date.now(),
    text,
    reminderTime: Number.isFinite(reminderTime) ? reminderTime : null,
    createdAt: Date.now(),
    socketId,
  };
}

function upsertSubscription(subscription) {
  if (!subscription?.endpoint) {
    return false;
  }

  const alreadyExists = subscriptions.some((item) => item.endpoint === subscription.endpoint);
  if (!alreadyExists) {
    subscriptions.push(subscription);
  }

  return true;
}

function removeSubscription(endpoint) {
  const before = subscriptions.length;
  subscriptions = subscriptions.filter((item) => item.endpoint !== endpoint);
  return before !== subscriptions.length;
}

async function sendPushToAll(payload) {
  if (!subscriptions.length) {
    return;
  }

  const serialized = JSON.stringify(payload);
  const invalidEndpoints = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, serialized);
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
          return;
        }

        console.error("Push delivery error:", error.message || error);
      }
    })
  );

  if (invalidEndpoints.length) {
    const expired = new Set(invalidEndpoints);
    subscriptions = subscriptions.filter((subscription) => !expired.has(subscription.endpoint));
  }
}

function clearReminder(reminderId) {
  const reminder = reminders.get(reminderId);
  if (!reminder) {
    return;
  }

  clearTimeout(reminder.timeoutId);
  reminders.delete(reminderId);
}

function scheduleReminder(reminderData) {
  const reminder = sanitizeTaskPayload(reminderData, reminderData?.socketId || null);
  if (!reminder) {
    return { ok: false, error: "Текст напоминания обязателен" };
  }

  if (!Number.isFinite(reminder.reminderTime)) {
    return { ok: false, error: "Напоминание должно содержать корректную дату" };
  }

  const delay = reminder.reminderTime - Date.now();
  if (delay <= 0) {
    return { ok: false, error: "Дата напоминания должна быть в будущем" };
  }

  clearReminder(reminder.id);

  const timeoutId = setTimeout(async () => {
    await sendPushToAll({
      title: "Напоминание",
      body: reminder.text,
      reminderId: reminder.id,
    });

    broadcast("reminderTriggered", {
      id: reminder.id,
      text: reminder.text,
      reminderTime: reminder.reminderTime,
    });

    reminders.delete(reminder.id);
  }, delay);

  reminders.set(reminder.id, {
    id: reminder.id,
    text: reminder.text,
    reminderTime: reminder.reminderTime,
    timeoutId,
  });

  return { ok: true, data: reminder };
}

function snoozeReminder(reminderId) {
  const reminder = reminders.get(reminderId);
  if (!reminder) {
    return null;
  }

  clearTimeout(reminder.timeoutId);

  const nextReminderTime = Date.now() + REMINDER_SNOOZE_MS;
  const timeoutId = setTimeout(async () => {
    await sendPushToAll({
      title: "Напоминание отложено",
      body: reminder.text,
      reminderId,
    });

    broadcast("reminderTriggered", {
      id: reminderId,
      text: reminder.text,
      reminderTime: nextReminderTime,
      snoozed: true,
    });

    reminders.delete(reminderId);
  }, REMINDER_SNOOZE_MS);

  const nextReminder = {
    ...reminder,
    reminderTime: nextReminderTime,
    timeoutId,
  };

  reminders.set(reminderId, nextReminder);
  return nextReminder;
}

function attachSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
    },
  });

  ioServers.push(io);

  io.on("connection", (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    socket.emit("realtimeState", {
      subscriptions: subscriptions.length,
      reminders: reminders.size,
      socketId: socket.id,
    });

    socket.on("newTask", async (task) => {
      const payload = sanitizeTaskPayload(task, socket.id);
      if (!payload) {
        socket.emit("taskError", { message: "Пустую заметку отправить нельзя" });
        return;
      }

      broadcast("taskAdded", payload);
      await sendPushToAll({
        title: "Новая заметка",
        body: payload.text,
      });
    });

    socket.on("newReminder", (reminder) => {
      const result = scheduleReminder({ ...reminder, socketId: socket.id });
      if (!result.ok) {
        socket.emit("reminderError", { message: result.error });
        return;
      }

      broadcast("reminderScheduled", result.data);
    });

    socket.on("disconnect", () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });

  return io;
}

app.get("/api/config", (req, res) => {
  res.json({
    appName: "Front_1KR Notes PWA",
    publicVapidKey: VAPID_PUBLIC_KEY,
    httpUrl: `http://localhost:${HTTP_PORT}`,
    httpsUrl: readHttpsOptions() ? `https://localhost:${HTTPS_PORT}` : null,
    httpsEnabled: Boolean(readHttpsOptions()),
    subscriptions: subscriptions.length,
    reminders: reminders.size,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    subscriptions: subscriptions.length,
    reminders: reminders.size,
  });
});

app.post("/subscribe", (req, res) => {
  if (!upsertSubscription(req.body)) {
    return res.status(400).json({ error: "Некорректная push-подписка" });
  }

  return res.status(201).json({
    message: "Подписка сохранена",
    subscriptions: subscriptions.length,
  });
});

app.post("/unsubscribe", (req, res) => {
  const endpoint = String(req.body?.endpoint || "").trim();
  if (!endpoint) {
    return res.status(400).json({ error: "endpoint обязателен" });
  }

  const removed = removeSubscription(endpoint);
  return res.json({
    message: removed ? "Подписка удалена" : "Подписка не найдена",
    subscriptions: subscriptions.length,
  });
});

app.post("/snooze", (req, res) => {
  const reminderId = Number(req.query.reminderId || req.body?.reminderId);
  if (!Number.isFinite(reminderId)) {
    return res.status(400).json({ error: "Некорректный reminderId" });
  }

  const reminder = snoozeReminder(reminderId);
  if (!reminder) {
    return res.status(404).json({ error: "Напоминание не найдено" });
  }

  return res.json({
    message: "Напоминание отложено на 5 минут",
    reminderId,
    reminderTime: reminder.reminderTime,
  });
});

app.use(express.static(FRONTEND_DIR));

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

function startServer() {
  const httpServer = http.createServer(app);
  attachSocketServer(httpServer);

  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server: http://localhost:${HTTP_PORT}`);
  });

  const httpsOptions = readHttpsOptions();
  let httpsServer = null;

  if (httpsOptions) {
    httpsServer = https.createServer(httpsOptions, app);
    attachSocketServer(httpsServer);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`HTTPS server: https://localhost:${HTTPS_PORT}`);
    });
  } else {
    console.log(
      "HTTPS disabled. Run `npm run cert:windows --workspace backend` to create a trusted local certificate."
    );
  }

  return { httpServer, httpsServer };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  scheduleReminder,
  sendPushToAll,
};
