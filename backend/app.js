const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");
const swaggerUi = require("swagger-ui-express");

const app = express();
const port = Number(process.env.PORT) || 3000;

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "front_1kr_access_secret";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "front_1kr_refresh_secret";
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const REFRESH_COOKIE_NAME = "refreshToken";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOWED_ROLES = ["user", "moderator", "admin"];

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3001"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(cookieParser());
app.use(express.json());

function buildCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function passwordIsStrongEnough(password) {
  return typeof password === "string" && password.length >= 8;
}

let products = [];
let users = [];
let sessions = [];
let blacklistedAccessTokens = [];

function cleanupExpiredAuthState() {
  const now = Date.now();

  blacklistedAccessTokens = blacklistedAccessTokens.filter((entry) => entry.expiresAt > now);
  sessions = sessions.filter((session) => session.expiresAt > now);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    created_at: user.created_at,
  };
}

function sanitizeSession(session, currentSessionId) {
  return {
    id: session.id,
    user_id: session.userId,
    created_at: session.createdAt,
    last_used_at: session.lastUsedAt,
    expires_at: new Date(session.expiresAt).toISOString(),
    revoked_at: session.revokedAt,
    revocation_reason: session.revocationReason,
    user_agent: session.userAgent,
    is_current: session.id === currentSessionId,
  };
}

function getSessionById(sessionId) {
  return sessions.find((session) => session.id === sessionId) || null;
}

function getActiveSessionById(sessionId) {
  const session = getSessionById(sessionId);
  if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
    return null;
  }
  return session;
}

function revokeSession(session, reason) {
  if (!session || session.revokedAt) return;
  session.revokedAt = nowIso();
  session.revocationReason = reason;
}

function isAccessTokenBlacklisted(jti) {
  cleanupExpiredAuthState();
  return blacklistedAccessTokens.some((entry) => entry.jti === jti);
}

function blacklistAccessToken(payload, reason) {
  if (!payload?.jti || !payload?.exp) return;
  const expiresAt = payload.exp * 1000;
  if (expiresAt <= Date.now() || isAccessTokenBlacklisted(payload.jti)) return;

  blacklistedAccessTokens.push({
    jti: payload.jti,
    userId: payload.sub,
    sessionId: payload.sessionId,
    expiresAt,
    reason,
    createdAt: nowIso(),
  });
}

function signAccessToken(user, sessionId) {
  const jti = nanoid(18);
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      jti,
      type: "access",
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  return { token, jti };
}

function signRefreshToken(user, sessionId) {
  const tokenId = nanoid(24);
  const token = jwt.sign(
    {
      sub: user.id,
      sessionId,
      tokenId,
      type: "refresh",
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  return { token, tokenId };
}

function parseBearerToken(headerValue) {
  const header = String(headerValue || "");
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

function getUserByEmail(email) {
  return users.find((user) => user.email === normalizeEmail(email)) || null;
}

function getUserById(id) {
  return users.find((user) => user.id === id) || null;
}

function findProductById(id) {
  return products.find((product) => product.id === id) || null;
}

function validateRegisterPayload(payload) {
  const email = normalizeEmail(payload?.email);
  const first_name = String(payload?.first_name || "").trim();
  const last_name = String(payload?.last_name || "").trim();
  const password = payload?.password;

  if (!email || !first_name || !last_name || !password) {
    return { error: "email, first_name, last_name и password обязательны" };
  }
  if (!email.includes("@")) {
    return { error: "email должен быть валидным" };
  }
  if (!passwordIsStrongEnough(password)) {
    return { error: "password должен содержать минимум 8 символов" };
  }
  if (getUserByEmail(email)) {
    return { error: "Пользователь с таким email уже существует" };
  }

  return {
    data: {
      email,
      first_name,
      last_name,
      password,
      role: "user",
    },
  };
}

function validateLoginPayload(payload) {
  const email = normalizeEmail(payload?.email);
  const password = payload?.password;

  if (!email || !password) {
    return { error: "email и password обязательны" };
  }

  return { data: { email, password } };
}

function validateCreateProduct(payload) {
  const title = String(payload?.title || payload?.name || "").trim();
  const category = String(payload?.category || "").trim();
  const description = String(payload?.description || "").trim();
  const price = toNumber(payload?.price);
  const stock = toNumber(payload?.stock);
  const rating = toNumber(payload?.rating);
  const imageUrl = String(payload?.imageUrl || "").trim();

  if (!title || !category || !description) {
    return { error: "title, category и description обязательны" };
  }
  if (price === undefined || Number.isNaN(price) || price < 0) {
    return { error: "price должен быть числом >= 0" };
  }
  if (stock === undefined || Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
    return { error: "stock должен быть целым числом >= 0" };
  }
  if (rating !== undefined && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
    return { error: "rating должен быть числом от 0 до 5" };
  }

  return {
    data: {
      title,
      category,
      description,
      price,
      stock,
      ...(rating !== undefined ? { rating } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
  };
}

function validateUpdateProduct(payload) {
  const updates = {};

  if (payload?.title !== undefined || payload?.name !== undefined) {
    const title = String(payload.title ?? payload.name).trim();
    if (!title) return { error: "title не может быть пустым" };
    updates.title = title;
  }
  if (payload?.category !== undefined) {
    const category = String(payload.category).trim();
    if (!category) return { error: "category не может быть пустой" };
    updates.category = category;
  }
  if (payload?.description !== undefined) {
    const description = String(payload.description).trim();
    if (!description) return { error: "description не может быть пустым" };
    updates.description = description;
  }
  if (payload?.price !== undefined) {
    const price = toNumber(payload.price);
    if (Number.isNaN(price) || price < 0) {
      return { error: "price должен быть числом >= 0" };
    }
    updates.price = price;
  }
  if (payload?.stock !== undefined) {
    const stock = toNumber(payload.stock);
    if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      return { error: "stock должен быть целым числом >= 0" };
    }
    updates.stock = stock;
  }
  if (payload?.rating !== undefined) {
    const rating = toNumber(payload.rating);
    if (Number.isNaN(rating) || rating < 0 || rating > 5) {
      return { error: "rating должен быть числом от 0 до 5" };
    }
    updates.rating = rating;
  }
  if (payload?.imageUrl !== undefined) {
    updates.imageUrl = String(payload.imageUrl).trim();
  }

  if (Object.keys(updates).length === 0) {
    return { error: "Нет полей для обновления" };
  }

  return { data: updates };
}

function createSeedProducts() {
  return [
    {
      id: nanoid(8),
      title: "Игровая мышь HyperStrike M1",
      category: "Периферия",
      description: "Проводная мышь с сенсором 12000 DPI и RGB-подсветкой.",
      price: 3490,
      stock: 25,
      rating: 4.7,
      imageUrl: "https://images.unsplash.com/photo-1527814050087-3793815479db",
    },
    {
      id: nanoid(8),
      title: "Механическая клавиатура IronKeys K87",
      category: "Периферия",
      description: "Компактная TKL-клавиатура с hot-swap переключателями.",
      price: 6990,
      stock: 14,
      rating: 4.8,
      imageUrl: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae",
    },
    {
      id: nanoid(8),
      title: "Наушники WaveSound Pro",
      category: "Аудио",
      description: "Закрытые наушники с микрофоном и виртуальным 7.1 звуком.",
      price: 5290,
      stock: 31,
      rating: 4.5,
      imageUrl: "https://images.unsplash.com/photo-1484704849700-f032a568e944",
    },
    {
      id: nanoid(8),
      title: "Монитор Vision 27Q",
      category: "Мониторы",
      description: "27 дюймов, IPS, 2560x1440, 165 Гц, HDR.",
      price: 24990,
      stock: 9,
      rating: 4.9,
      imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf",
    },
    {
      id: nanoid(8),
      title: "Веб-камера StreamCam X",
      category: "Стриминг",
      description: "Камера 1080p60 с автофокусом и шумоподавлением.",
      price: 4590,
      stock: 20,
      rating: 4.4,
      imageUrl: "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04",
    },
    {
      id: nanoid(8),
      title: "Микрофон VoiceBox USB",
      category: "Стриминг",
      description: "Конденсаторный USB-микрофон с кардиоидной диаграммой.",
      price: 5990,
      stock: 17,
      rating: 4.6,
      imageUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc",
    },
    {
      id: nanoid(8),
      title: "Коврик Control XL",
      category: "Периферия",
      description: "Увеличенный тканевый коврик с нескользящей основой.",
      price: 1290,
      stock: 52,
      rating: 4.3,
      imageUrl: "https://images.unsplash.com/photo-1617471346061-5d329ab9c574",
    },
    {
      id: nanoid(8),
      title: "SSD FlashDrive 1TB",
      category: "Накопители",
      description: "NVMe SSD 1 ТБ, скорость чтения до 5000 МБ/с.",
      price: 8490,
      stock: 19,
      rating: 4.8,
      imageUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704",
    },
    {
      id: nanoid(8),
      title: "Ноутбук DevBook 15",
      category: "Ноутбуки",
      description: "Ryzen 7, 16GB RAM, 512GB SSD, экран 2.5K.",
      price: 87990,
      stock: 6,
      rating: 4.7,
      imageUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853",
    },
    {
      id: nanoid(8),
      title: "Рюкзак TechPack",
      category: "Аксессуары",
      description: "Влагозащищенный рюкзак для ноутбука до 16 дюймов.",
      price: 3990,
      stock: 28,
      rating: 4.4,
      imageUrl: "https://images.unsplash.com/photo-1622560480654-d96214fdc887",
    },
  ];
}

function createSeedUsers() {
  return [
    {
      id: nanoid(8),
      email: "admin@1kr.local",
      first_name: "Анна",
      last_name: "Администратор",
      role: "admin",
      passwordHash: bcrypt.hashSync("Admin123!", 10),
      created_at: nowIso(),
    },
    {
      id: nanoid(8),
      email: "moderator@1kr.local",
      first_name: "Максим",
      last_name: "Модератор",
      role: "moderator",
      passwordHash: bcrypt.hashSync("Moderator123!", 10),
      created_at: nowIso(),
    },
    {
      id: nanoid(8),
      email: "user@1kr.local",
      first_name: "Юлия",
      last_name: "Пользователь",
      role: "user",
      passwordHash: bcrypt.hashSync("User12345!", 10),
      created_at: nowIso(),
    },
  ];
}

products = createSeedProducts();
users = createSeedUsers();

function authenticateAccessToken(req, res, next) {
  cleanupExpiredAuthState();

  const rawToken = parseBearerToken(req.headers.authorization);
  if (!rawToken) {
    return res.status(401).json({ error: "Требуется Bearer access token" });
  }

  try {
    const payload = jwt.verify(rawToken, ACCESS_TOKEN_SECRET);
    if (payload.type !== "access") {
      return res.status(401).json({ error: "Неверный тип токена" });
    }
    if (isAccessTokenBlacklisted(payload.jti)) {
      return res.status(401).json({ error: "Токен был отозван" });
    }

    const user = getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Пользователь не найден" });
    }

    const session = getActiveSessionById(payload.sessionId);
    if (!session || session.userId !== user.id) {
      return res.status(401).json({ error: "Сессия недействительна" });
    }

    req.auth = { token: payload, rawToken, user, session };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Неверный или просроченный access token" });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth?.user) {
      return res.status(401).json({ error: "Требуется авторизация" });
    }
    if (!roles.includes(req.auth.user.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    next();
  };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, buildCookieOptions());
}

function issueTokensForUser(user, req, res, existingSession) {
  const session =
    existingSession ||
    {
      id: nanoid(12),
      userId: user.id,
      userAgent: String(req.headers["user-agent"] || "Unknown client").slice(0, 180),
      createdAt: nowIso(),
      lastUsedAt: nowIso(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revokedAt: null,
      revocationReason: null,
      currentRefreshTokenId: null,
    };

  const access = signAccessToken(user, session.id);
  const refresh = signRefreshToken(user, session.id);

  session.lastUsedAt = nowIso();
  session.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  session.currentRefreshTokenId = refresh.tokenId;
  session.revokedAt = null;
  session.revocationReason = null;

  if (!existingSession) {
    sessions.push(session);
  }

  setRefreshCookie(res, refresh.token);

  return {
    accessToken: access.token,
    user: sanitizeUser(user),
    session: sanitizeSession(session, session.id),
  };
}

app.use((req, res, next) => {
  cleanupExpiredAuthState();
  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`
    );
  });
  next();
});

app.get("/", (req, res) => {
  res.json({
    message: "API для практик 7-12 работает",
    docs: `http://localhost:${port}/api-docs`,
    demo_users: [
      { email: "admin@1kr.local", password: "Admin123!", role: "admin" },
      { email: "moderator@1kr.local", password: "Moderator123!", role: "moderator" },
      { email: "user@1kr.local", password: "User12345!", role: "user" },
    ],
    resources: [
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/me",
      "/api/auth/refresh",
      "/api/auth/sessions",
      "/api/products",
      "/api/admin/overview",
      "/api/moderation/overview",
    ],
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { data, error } = validateRegisterPayload(req.body);
  if (error) return res.status(400).json({ error });

  const user = {
    id: nanoid(8),
    email: data.email,
    first_name: data.first_name,
    last_name: data.last_name,
    role: data.role,
    passwordHash: await bcrypt.hash(data.password, 10),
    created_at: nowIso(),
  };

  users.push(user);
  res.status(201).json(sanitizeUser(user));
});

app.post("/api/auth/login", async (req, res) => {
  const { data, error } = validateLoginPayload(req.body);
  if (error) return res.status(400).json({ error });

  const user = getUserByEmail(data.email);
  if (!user) {
    return res.status(401).json({ error: "Неверные учетные данные" });
  }

  const matches = await bcrypt.compare(data.password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: "Неверные учетные данные" });
  }

  res.json(issueTokensForUser(user, req, res));
});

app.post("/api/auth/refresh", (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh cookie отсутствует" });
  }

  try {
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (payload.type !== "refresh") {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Неверный тип refresh token" });
    }

    const session = getActiveSessionById(payload.sessionId);
    if (!session || session.userId !== payload.sub) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Сессия refresh token недействительна" });
    }

    if (session.currentRefreshTokenId !== payload.tokenId) {
      revokeSession(session, "refresh token replay detected");
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Refresh token уже был заменен" });
    }

    const user = getUserById(payload.sub);
    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Пользователь не найден" });
    }

    res.json(issueTokensForUser(user, req, res, session));
  } catch (error) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Неверный или просроченный refresh token" });
  }
});

app.get("/api/auth/me", authenticateAccessToken, (req, res) => {
  res.json({
    user: sanitizeUser(req.auth.user),
    session: sanitizeSession(req.auth.session, req.auth.session.id),
  });
});

app.get("/api/auth/sessions", authenticateAccessToken, (req, res) => {
  const userSessions = sessions
    .filter((session) => session.userId === req.auth.user.id)
    .map((session) => sanitizeSession(session, req.auth.session.id));

  res.json(userSessions);
});

app.post("/api/auth/logout", authenticateAccessToken, (req, res) => {
  blacklistAccessToken(req.auth.token, "logout");
  revokeSession(req.auth.session, "logout");
  clearRefreshCookie(res);
  res.json({ ok: true, message: "Текущая сессия завершена" });
});

app.post("/api/auth/logout-all", authenticateAccessToken, (req, res) => {
  sessions
    .filter((session) => session.userId === req.auth.user.id)
    .forEach((session) => revokeSession(session, "logout-all"));

  blacklistAccessToken(req.auth.token, "logout-all");
  clearRefreshCookie(res);
  res.json({ ok: true, message: "Все сессии пользователя завершены" });
});

app.post("/api/auth/blacklist", authenticateAccessToken, requireRoles("admin"), (req, res) => {
  const token = String(req.body?.token || "");
  if (!token) {
    return res.status(400).json({ error: "Нужно передать token в body" });
  }

  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (payload.type !== "access") {
      return res.status(400).json({ error: "Можно отзывать только access token" });
    }

    blacklistAccessToken(payload, "admin blacklist");
    const session = getSessionById(payload.sessionId);
    if (session) {
      revokeSession(session, "admin blacklist");
    }

    res.json({ ok: true, blacklisted_jti: payload.jti, session_id: payload.sessionId });
  } catch (error) {
    res.status(400).json({ error: "Не удалось провалидировать token" });
  }
});

app.get("/api/products", (req, res) => {
  res.json(products);
});

app.get("/api/products/:id", authenticateAccessToken, (req, res) => {
  const product = findProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: "Товар не найден" });
  }
  res.json(product);
});

app.post("/api/products", authenticateAccessToken, requireRoles("admin", "moderator"), (req, res) => {
  const { data, error } = validateCreateProduct(req.body);
  if (error) return res.status(400).json({ error });

  const product = {
    id: nanoid(8),
    ...data,
    createdBy: req.auth.user.email,
    createdAt: nowIso(),
  };

  products.unshift(product);
  res.status(201).json(product);
});

function updateProductHandler(req, res) {
  const product = findProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: "Товар не найден" });
  }

  const { data, error } = validateUpdateProduct(req.body);
  if (error) return res.status(400).json({ error });

  Object.assign(product, data, {
    updatedAt: nowIso(),
    updatedBy: req.auth.user.email,
  });

  res.json(product);
}

app.put("/api/products/:id", authenticateAccessToken, requireRoles("admin", "moderator"), updateProductHandler);
app.patch("/api/products/:id", authenticateAccessToken, requireRoles("admin", "moderator"), updateProductHandler);

app.delete("/api/products/:id", authenticateAccessToken, requireRoles("admin"), (req, res) => {
  const product = findProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: "Товар не найден" });
  }

  products = products.filter((item) => item.id !== req.params.id);
  res.status(204).send();
});

app.get("/api/admin/overview", authenticateAccessToken, requireRoles("admin"), (req, res) => {
  res.json({
    users_total: users.length,
    sessions_total: sessions.length,
    active_sessions: sessions.filter((session) => !session.revokedAt).length,
    blacklisted_access_tokens: blacklistedAccessTokens.length,
    products_total: products.length,
  });
});

app.get("/api/moderation/overview", authenticateAccessToken, requireRoles("admin", "moderator"), (req, res) => {
  res.json({
    products_total: products.length,
    low_stock_products: products.filter((product) => product.stock <= 10),
    last_revoked_sessions: sessions
      .filter((session) => session.revokedAt)
      .slice(-5)
      .map((session) => sanitizeSession(session, req.auth.session.id)),
  });
});

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Front_1KR Auth + Products API",
    version: "2.0.0",
    description:
      "API для практических занятий 7-12: bcrypt, JWT access/refresh, HttpOnly cookie, сессии, RBAC, blacklist и CRUD товаров.",
  },
  servers: [{ url: `http://localhost:${port}` }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: REFRESH_COOKIE_NAME },
    },
    schemas: {
      UserProfile: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          role: { type: "string", enum: ALLOWED_ROLES },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Session: {
        type: "object",
        properties: {
          id: { type: "string" },
          user_id: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          last_used_at: { type: "string", format: "date-time" },
          expires_at: { type: "string", format: "date-time" },
          revoked_at: { type: "string", nullable: true, format: "date-time" },
          revocation_reason: { type: "string", nullable: true },
          user_agent: { type: "string" },
          is_current: { type: "boolean" },
        },
      },
      AuthTokens: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          user: { $ref: "#/components/schemas/UserProfile" },
          session: { $ref: "#/components/schemas/Session" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["email", "first_name", "last_name", "password"],
        properties: {
          email: { type: "string", example: "student@example.com" },
          first_name: { type: "string", example: "Иван" },
          last_name: { type: "string", example: "Иванов" },
          password: { type: "string", example: "StrongPass123!" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", example: "admin@1kr.local" },
          password: { type: "string", example: "Admin123!" },
        },
      },
      Product: {
        type: "object",
        required: ["title", "category", "description", "price", "stock"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          category: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
          stock: { type: "integer" },
          rating: { type: "number" },
          imageUrl: { type: "string" },
          createdBy: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      BlacklistRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/api/auth/register": { post: { summary: "Регистрация", tags: ["Auth"] } },
    "/api/auth/login": { post: { summary: "Вход и получение access token", tags: ["Auth"] } },
    "/api/auth/refresh": {
      post: {
        summary: "Обновление access token",
        tags: ["Auth"],
        security: [{ refreshCookie: [] }],
      },
    },
    "/api/auth/me": {
      get: { summary: "Текущий пользователь", tags: ["Auth"], security: [{ bearerAuth: [] }] },
    },
    "/api/auth/sessions": {
      get: { summary: "Список сессий", tags: ["Auth"], security: [{ bearerAuth: [] }] },
    },
    "/api/auth/logout": {
      post: { summary: "Logout текущей сессии", tags: ["Auth"], security: [{ bearerAuth: [] }] },
    },
    "/api/auth/logout-all": {
      post: { summary: "Logout всех сессий", tags: ["Auth"], security: [{ bearerAuth: [] }] },
    },
    "/api/auth/blacklist": {
      post: {
        summary: "Отозвать access token",
        tags: ["Auth", "Admin"],
        security: [{ bearerAuth: [] }],
      },
    },
    "/api/products": {
      get: { summary: "Список товаров", tags: ["Products"] },
      post: { summary: "Создать товар", tags: ["Products"], security: [{ bearerAuth: [] }] },
    },
    "/api/products/{id}": {
      get: { summary: "Товар по id", tags: ["Products"], security: [{ bearerAuth: [] }] },
      put: { summary: "Обновить товар", tags: ["Products"], security: [{ bearerAuth: [] }] },
      patch: { summary: "Частично обновить товар", tags: ["Products"], security: [{ bearerAuth: [] }] },
      delete: { summary: "Удалить товар", tags: ["Products"], security: [{ bearerAuth: [] }] },
    },
    "/api/admin/overview": {
      get: { summary: "Статистика администратора", tags: ["Admin"], security: [{ bearerAuth: [] }] },
    },
    "/api/moderation/overview": {
      get: { summary: "Сводка модерации", tags: ["Moderation"], security: [{ bearerAuth: [] }] },
    },
  },
};

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error", error);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

function startServer() {
  return app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
    console.log(`Swagger UI: http://localhost:${port}/api-docs`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
