const AUTH_STORAGE_KEY = "front_1kr_access_token";

const refs = {
  serverId: document.getElementById("server-id"),
  postgresStatus: document.getElementById("postgres-status"),
  mongoStatus: document.getElementById("mongo-status"),
  redisStatus: document.getElementById("redis-status"),
  statusOutput: document.getElementById("status-output"),
  rootOutput: document.getElementById("root-output"),
  appLog: document.getElementById("app-log"),
  postgresUsersBody: document.getElementById("postgres-users-body"),
  mongoUsersBody: document.getElementById("mongo-users-body"),
  profileOutput: document.getElementById("profile-output"),
  rbacUsersOutput: document.getElementById("rbac-users-output"),
  productsOutput: document.getElementById("products-output"),
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  void bootstrap();
});

function bindEvents() {
  document.getElementById("reload-status")?.addEventListener("click", () => void loadStatus());
  document.getElementById("check-root")?.addEventListener("click", () => void checkRoot());
  document.getElementById("check-root-5")?.addEventListener("click", () => void checkRootSeries());
  document.getElementById("refresh-postgres")?.addEventListener("click", () => void loadPostgresUsers());
  document.getElementById("refresh-mongo")?.addEventListener("click", () => void loadMongoUsers());
  document.getElementById("load-profile")?.addEventListener("click", () => void loadProfile());
  document.getElementById("load-rbac-users")?.addEventListener("click", () => void loadRbacUsers());
  document.getElementById("load-products")?.addEventListener("click", () => void loadProducts());
  document.getElementById("repeat-products")?.addEventListener("click", () => void loadProducts());
  document.getElementById("clear-log")?.addEventListener("click", () => {
    refs.appLog.textContent = "Журнал очищен.";
  });

  document.getElementById("postgres-create-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPracticeUser(event.currentTarget, "/api/postgres/users", loadPostgresUsers);
  });

  document.getElementById("mongo-create-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPracticeUser(event.currentTarget, "/api/mongo/users", loadMongoUsers);
  });

  document.getElementById("postgres-update-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void updatePracticeUser(event.currentTarget, "/api/postgres/users", loadPostgresUsers);
  });

  document.getElementById("mongo-update-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void updatePracticeUser(event.currentTarget, "/api/mongo/users", loadMongoUsers);
  });

  document.getElementById("login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void login(event.currentTarget);
  });

  document.getElementById("product-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void createProduct(event.currentTarget);
  });
}

async function bootstrap() {
  await loadStatus();
  await Promise.all([loadPostgresUsers(), loadMongoUsers()]);
}

function getAuthToken() {
  return localStorage.getItem(AUTH_STORAGE_KEY) || "";
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

async function request(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function log(message, data = null) {
  const stamp = new Date().toLocaleTimeString("ru-RU");
  const appendix = data ? `\n${JSON.stringify(data, null, 2)}` : "";
  refs.appLog.textContent = `[${stamp}] ${message}${appendix}\n\n${refs.appLog.textContent}`;
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function setServiceIndicator(ref, isReady) {
  ref.textContent = isReady ? "готов" : "недоступен";
  ref.dataset.state = isReady ? "ready" : "error";
}

async function loadStatus() {
  try {
    const data = await request("/api/status", { method: "GET" });
    refs.serverId.textContent = data.server;
    setServiceIndicator(refs.postgresStatus, Boolean(data.services?.postgres));
    setServiceIndicator(refs.mongoStatus, Boolean(data.services?.mongo));
    setServiceIndicator(refs.redisStatus, Boolean(data.services?.redis));
    refs.statusOutput.textContent = formatJson(data);
    log("Обновлён общий статус проекта", data);
  } catch (error) {
    refs.statusOutput.textContent = error.message;
    log(`Ошибка чтения /api/status: ${error.message}`);
  }
}

async function checkRoot() {
  try {
    const data = await request("/", { method: "GET" });
    refs.rootOutput.textContent = formatJson(data);
    refs.serverId.textContent = data.server || "неизвестно";
    log("Получен ответ GET /", data);
  } catch (error) {
    log(`Ошибка чтения GET /: ${error.message}`);
  }
}

async function checkRootSeries() {
  const results = [];

  for (let index = 0; index < 5; index += 1) {
    try {
      const data = await request("/", { method: "GET" });
      results.push(data);
    } catch (error) {
      results.push({ error: error.message });
    }
  }

  refs.rootOutput.textContent = formatJson(results);
  log("Выполнена серия из 5 запросов GET /", results);
}

function buildPracticeUserPayload(form) {
  const formData = new FormData(form);
  return {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim(),
    age: Number(formData.get("age")),
  };
}

async function submitPracticeUser(form, url, reloadFn) {
  try {
    const payload = buildPracticeUserPayload(form);
    const data = await request(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    await reloadFn();
    log(`Создан пользователь через ${url}`, data);
  } catch (error) {
    log(`Ошибка создания пользователя через ${url}: ${error.message}`);
  }
}

async function updatePracticeUser(form, baseUrl, reloadFn) {
  try {
    const formData = new FormData(form);
    const id = Number(formData.get("id"));
    const payload = buildPracticeUserPayload(form);
    const data = await request(`${baseUrl}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    form.reset();
    await reloadFn();
    log(`Обновлён пользователь ${id} через ${baseUrl}`, data);
  } catch (error) {
    log(`Ошибка обновления пользователя: ${error.message}`);
  }
}

async function deletePracticeUser(type, id) {
  const url = type === "postgres" ? `/api/postgres/users/${id}` : `/api/mongo/users/${id}`;

  try {
    const data = await request(url, { method: "DELETE" });
    if (type === "postgres") {
      await loadPostgresUsers();
    } else {
      await loadMongoUsers();
    }
    log(`Удалён пользователь ${id} из ${type}`, data);
  } catch (error) {
    log(`Ошибка удаления пользователя ${id}: ${error.message}`);
  }
}

function renderUsers(target, rows, type) {
  if (!rows.length) {
    target.innerHTML = `<tr><td colspan="5">Список пуст.</td></tr>`;
    return;
  }

  target.innerHTML = rows
    .map(
      (user) => `
        <tr>
          <td>${escapeHtml(user.id)}</td>
          <td>${escapeHtml(user.first_name)}</td>
          <td>${escapeHtml(user.last_name)}</td>
          <td>${escapeHtml(user.age)}</td>
          <td><button class="danger" type="button" data-action="delete-${type}" data-id="${escapeHtml(
            user.id
          )}">Удалить</button></td>
        </tr>
      `
    )
    .join("");
}

function bindDeleteButtons() {
  document.querySelectorAll("[data-action='delete-postgres']").forEach((button) => {
    button.addEventListener("click", () => {
      void deletePracticeUser("postgres", button.dataset.id);
    });
  });

  document.querySelectorAll("[data-action='delete-mongo']").forEach((button) => {
    button.addEventListener("click", () => {
      void deletePracticeUser("mongo", button.dataset.id);
    });
  });
}

async function loadPostgresUsers() {
  try {
    const data = await request("/api/postgres/users", { method: "GET" });
    renderUsers(refs.postgresUsersBody, data, "postgres");
    bindDeleteButtons();
    log("Загружен список пользователей PostgreSQL", data);
  } catch (error) {
    refs.postgresUsersBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    log(`Ошибка загрузки PostgreSQL пользователей: ${error.message}`);
  }
}

async function loadMongoUsers() {
  try {
    const data = await request("/api/mongo/users", { method: "GET" });
    renderUsers(refs.mongoUsersBody, data, "mongo");
    bindDeleteButtons();
    log("Загружен список пользователей MongoDB", data);
  } catch (error) {
    refs.mongoUsersBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    log(`Ошибка загрузки MongoDB пользователей: ${error.message}`);
  }
}

async function login(form) {
  try {
    const formData = new FormData(form);
    const payload = {
      username: String(formData.get("username") || "").trim(),
      password: String(formData.get("password") || ""),
    };
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setAuthToken(data.accessToken);
    refs.profileOutput.textContent = formatJson(data.user);
    log("Выполнен вход", data.user);
  } catch (error) {
    setAuthToken("");
    refs.profileOutput.textContent = error.message;
    log(`Ошибка входа: ${error.message}`);
  }
}

async function loadProfile() {
  try {
    const data = await request("/api/me", { method: "GET" });
    refs.profileOutput.textContent = formatJson(data.user);
    log("Загружен профиль", data.user);
  } catch (error) {
    refs.profileOutput.textContent = error.message;
    log(`Ошибка чтения профиля: ${error.message}`);
  }
}

async function loadRbacUsers() {
  try {
    const data = await request("/api/users", { method: "GET" });
    refs.rbacUsersOutput.textContent = formatJson(data);
    log("Загружены пользователи RBAC", data);
  } catch (error) {
    refs.rbacUsersOutput.textContent = error.message;
    log(`Ошибка чтения RBAC пользователей: ${error.message}`);
  }
}

async function loadProducts() {
  try {
    const data = await request("/api/products", { method: "GET" });
    refs.productsOutput.textContent = formatJson(data);
    log("Загружены товары", data);
  } catch (error) {
    refs.productsOutput.textContent = error.message;
    log(`Ошибка чтения товаров: ${error.message}`);
  }
}

async function createProduct(form) {
  try {
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      price: Number(formData.get("price")),
      description: String(formData.get("description") || "").trim(),
    };

    const data = await request("/api/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    form.reset();
    await loadProducts();
    log("Создан новый товар", data);
  } catch (error) {
    log(`Ошибка создания товара: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
