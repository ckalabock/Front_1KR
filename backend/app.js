const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const { Sequelize, DataTypes } = require("sequelize");
const mongoose = require("mongoose");

const PORT = Number(process.env.PORT) || 3000;
const SERVER_ID = process.env.SERVER_ID || `backend-${PORT}`;
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

const ACCESS_SECRET = process.env.ACCESS_SECRET || "front_1kr_access_secret";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "front_1kr_refresh_secret";
const ACCESS_EXPIRES_IN = process.env.ACCESS_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || "7d";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const POSTGRES_URL =
  process.env.POSTGRES_URL || "postgres://front_user:front_password@127.0.0.1:5432/front_1kr";
const MONGO_URL =
  process.env.MONGO_URL || "mongodb://admin:1234@127.0.0.1:27017/front_1kr?authSource=admin";

const USERS_CACHE_TTL = 60;
const PRODUCTS_CACHE_TTL = 600;

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("X-Server-Id", SERVER_ID);
  next();
});
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] ${SERVER_ID} ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

const runtime = {
  postgresReady: false,
  postgresConnecting: null,
  mongoReady: false,
  mongoConnecting: null,
  redisReady: false,
  redisConnecting: null,
  seedsReady: false,
  nextAuthUserId: 1,
  nextProductId: 1,
};

const authUsers = [];
const products = [];
const refreshTokens = new Set();

const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 1000,
    reconnectStrategy: () => false,
  },
});
redisClient.on("ready", () => {
  runtime.redisReady = true;
  console.log("Redis connected");
});
redisClient.on("end", () => {
  runtime.redisReady = false;
});
redisClient.on("error", (error) => {
  runtime.redisReady = false;
  console.error("Redis error:", error.message);
});

const sequelize = new Sequelize(POSTGRES_URL, {
  dialect: "postgres",
  logging: false,
});

const PostgresUser = sequelize.define(
  "PostgresUser",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    first_name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    last_name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    age: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    tableName: "users",
    timestamps: false,
    hooks: {
      beforeValidate(instance) {
        const now = Date.now();
        if (!instance.created_at) {
          instance.created_at = now;
        }
        instance.updated_at = now;
      },
    },
  }
);

const mongoCounterSchema = new mongoose.Schema(
  {
    _id: String,
    seq: {
      type: Number,
      default: 0,
    },
  },
  {
    versionKey: false,
    collection: "_counters",
  }
);

const mongoUserSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      required: true,
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 0,
    },
    created_at: {
      type: Number,
      required: true,
    },
    updated_at: {
      type: Number,
      required: true,
    },
  },
  {
    versionKey: false,
    collection: "users",
  }
);

const MongoCounter = mongoose.model("MongoCounter", mongoCounterSchema);
const MongoUser = mongoose.model("MongoUser", mongoUserSchema);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizePracticeUserPayload(body, options = {}) {
  const { partial = false } = options;
  const payload = {};

  if (!isPlainObject(body)) {
    throw createHttpError(400, "Тело запроса должно быть JSON-объектом");
  }

  if (Object.prototype.hasOwnProperty.call(body, "first_name")) {
    const firstName = String(body.first_name || "").trim();
    if (!firstName) {
      throw createHttpError(400, "Поле first_name обязательно");
    }
    payload.first_name = firstName;
  } else if (!partial) {
    throw createHttpError(400, "Поле first_name обязательно");
  }

  if (Object.prototype.hasOwnProperty.call(body, "last_name")) {
    const lastName = String(body.last_name || "").trim();
    if (!lastName) {
      throw createHttpError(400, "Поле last_name обязательно");
    }
    payload.last_name = lastName;
  } else if (!partial) {
    throw createHttpError(400, "Поле last_name обязательно");
  }

  if (Object.prototype.hasOwnProperty.call(body, "age")) {
    const age = Number(body.age);
    if (!Number.isInteger(age) || age < 0) {
      throw createHttpError(400, "Поле age должно быть целым числом не меньше 0");
    }
    payload.age = age;
  } else if (!partial) {
    throw createHttpError(400, "Поле age обязательно");
  }

  if (partial && !Object.keys(payload).length) {
    throw createHttpError(400, "Не передано ни одного поля для обновления");
  }

  return payload;
}

function parseNumericId(value, fieldName = "id") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `Некорректный ${fieldName}`);
  }
  return parsed;
}

function sanitizeRegistration(body) {
  if (!isPlainObject(body)) {
    throw createHttpError(400, "Тело запроса должно быть JSON-объектом");
  }

  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "user").trim().toLowerCase();
  const allowedRoles = new Set(["admin", "manager", "user"]);

  if (!username || username.length < 3) {
    throw createHttpError(400, "Имя пользователя должно содержать минимум 3 символа");
  }

  if (password.length < 4) {
    throw createHttpError(400, "Пароль должен содержать минимум 4 символа");
  }

  if (!allowedRoles.has(role)) {
    throw createHttpError(400, "Недопустимая роль");
  }

  return {
    username,
    password,
    role,
  };
}

function sanitizeProductPayload(body, options = {}) {
  const { partial = false } = options;
  if (!isPlainObject(body)) {
    throw createHttpError(400, "Тело запроса должно быть JSON-объектом");
  }

  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = String(body.name || "").trim();
    if (!name) {
      throw createHttpError(400, "Поле name обязательно");
    }
    payload.name = name;
  } else if (!partial) {
    throw createHttpError(400, "Поле name обязательно");
  }

  if (Object.prototype.hasOwnProperty.call(body, "price")) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      throw createHttpError(400, "Поле price должно быть числом не меньше 0");
    }
    payload.price = Number(price.toFixed(2));
  } else if (!partial) {
    throw createHttpError(400, "Поле price обязательно");
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    payload.description = String(body.description || "").trim();
  } else if (!partial) {
    payload.description = "";
  }

  if (partial && !Object.keys(payload).length) {
    throw createHttpError(400, "Не передано ни одного поля для обновления");
  }

  return payload;
}

function makePublicAuthUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    blocked: user.blocked,
    createdAt: user.createdAt,
  };
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    ACCESS_SECRET,
    {
      expiresIn: ACCESS_EXPIRES_IN,
    }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    REFRESH_SECRET,
    {
      expiresIn: REFRESH_EXPIRES_IN,
    }
  );
}

async function ensureSeedData() {
  if (runtime.seedsReady) {
    return;
  }

  const initialUsers = [
    { username: "admin", password: "admin123", role: "admin" },
    { username: "manager", password: "manager123", role: "manager" },
    { username: "user", password: "user123", role: "user" },
  ];

  for (const item of initialUsers) {
    const passwordHash = await bcrypt.hash(item.password, 10);
    authUsers.push({
      id: String(runtime.nextAuthUserId++),
      username: item.username,
      passwordHash,
      role: item.role,
      blocked: false,
      createdAt: Date.now(),
    });
  }

  const initialProducts = [
    {
      name: "Ноутбук",
      price: 75000,
      description: "Игровой ноутбук для проверки кэша товаров.",
    },
    {
      name: "Монитор",
      price: 18990,
      description: "24-дюймовый монитор для практики 21.",
    },
    {
      name: "Клавиатура",
      price: 4290,
      description: "Механическая клавиатура с простым описанием.",
    },
  ];

  initialProducts.forEach((item) => {
    products.push({
      id: String(runtime.nextProductId++),
      name: item.name,
      price: item.price,
      description: item.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  runtime.seedsReady = true;
}

async function ensureRedisReady() {
  if (runtime.redisReady && redisClient.isOpen) {
    return true;
  }

  if (runtime.redisConnecting) {
    return runtime.redisConnecting;
  }

  runtime.redisConnecting = (async () => {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
      runtime.redisReady = true;
      return true;
    } catch (error) {
      runtime.redisReady = false;
      console.error("Redis connection failed:", error.message);
      return false;
    } finally {
      runtime.redisConnecting = null;
    }
  })();

  return runtime.redisConnecting;
}

async function ensurePostgresReady() {
  if (runtime.postgresReady) {
    return true;
  }

  if (runtime.postgresConnecting) {
    return runtime.postgresConnecting;
  }

  runtime.postgresConnecting = (async () => {
    try {
      await sequelize.authenticate();
      await PostgresUser.sync();
      runtime.postgresReady = true;
      console.log("PostgreSQL connected");
      return true;
    } catch (error) {
      runtime.postgresReady = false;
      console.error("PostgreSQL connection failed:", error.message);
      return false;
    } finally {
      runtime.postgresConnecting = null;
    }
  })();

  return runtime.postgresConnecting;
}

async function ensureMongoReady() {
  if (runtime.mongoReady && mongoose.connection.readyState === 1) {
    return true;
  }

  if (runtime.mongoConnecting) {
    return runtime.mongoConnecting;
  }

  runtime.mongoConnecting = (async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(MONGO_URL, {
          serverSelectionTimeoutMS: 3000,
        });
      }
      runtime.mongoReady = true;
      console.log("MongoDB connected");
      return true;
    } catch (error) {
      runtime.mongoReady = false;
      console.error("MongoDB connection failed:", error.message);
      return false;
    } finally {
      runtime.mongoConnecting = null;
    }
  })();

  return runtime.mongoConnecting;
}

async function warmupServices() {
  await Promise.all([ensureSeedData(), ensurePostgresReady(), ensureMongoReady(), ensureRedisReady()]);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Требуется access token" });
  }

  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    const user = authUsers.find((item) => item.id === String(payload.sub));

    if (!user || user.blocked) {
      return res.status(401).json({ error: "Пользователь не найден или заблокирован" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Недействительный access token" });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }
    return next();
  };
}

function cacheMiddleware(keyBuilder, ttl) {
  return async (req, res, next) => {
    try {
      const redisAvailable = await ensureRedisReady();
      if (!redisAvailable) {
        return next();
      }

      const key = keyBuilder(req);
      const cachedData = await redisClient.get(key);

      if (cachedData) {
        return res.json({
          source: "cache",
          cacheKey: key,
          server: SERVER_ID,
          data: JSON.parse(cachedData),
        });
      }

      req.cacheKey = key;
      req.cacheTTL = ttl;
      return next();
    } catch (error) {
      console.error("Cache read error:", error.message);
      return next();
    }
  };
}

async function saveToCache(key, data, ttl) {
  const redisAvailable = await ensureRedisReady();
  if (!redisAvailable) {
    return false;
  }

  try {
    await redisClient.set(key, JSON.stringify(data), {
      EX: ttl,
    });
    return true;
  } catch (error) {
    console.error("Cache save error:", error.message);
    return false;
  }
}

async function sendServerPayload(req, res, data, status = 200) {
  if (req.cacheKey && req.cacheTTL) {
    await saveToCache(req.cacheKey, data, req.cacheTTL);
  }

  return res.status(status).json({
    source: "server",
    cacheKey: req.cacheKey || null,
    server: SERVER_ID,
    data,
  });
}

async function invalidateCacheKeys(keys) {
  const redisAvailable = await ensureRedisReady();
  if (!redisAvailable) {
    return;
  }

  const filteredKeys = keys.filter(Boolean);
  if (!filteredKeys.length) {
    return;
  }

  try {
    await redisClient.del(filteredKeys);
  } catch (error) {
    console.error("Cache invalidate error:", error.message);
  }
}

async function invalidateUsersCache(userId) {
  await invalidateCacheKeys(["rbac:users:all", userId ? `rbac:users:${userId}` : null]);
}

async function invalidateProductsCache(productId) {
  await invalidateCacheKeys(["rbac:products:all", productId ? `rbac:products:${productId}` : null]);
}

function getServiceStatus() {
  return {
    postgres: runtime.postgresReady,
    mongo: runtime.mongoReady && mongoose.connection.readyState === 1,
    redis: runtime.redisReady && redisClient.isOpen,
  };
}

async function getNextMongoSequence(sequenceName) {
  const counter = await MongoCounter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return counter.seq;
}

app.get("/", (req, res) => {
  res.json({
    message: "Load balancing backend is working",
    server: SERVER_ID,
    timestamp: new Date().toISOString(),
    appUrl: "/app",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    server: SERVER_ID,
    timestamp: new Date().toISOString(),
    services: getServiceStatus(),
  });
});

app.get("/api/status", async (req, res) => {
  await warmupServices();
  res.json({
    server: SERVER_ID,
    timestamp: new Date().toISOString(),
    services: getServiceStatus(),
    redisUrl: REDIS_URL,
    postgresUrl: POSTGRES_URL,
    mongoUrl: MONGO_URL,
    seededUsers: authUsers.length,
    seededProducts: products.length,
  });
});

app.post("/api/postgres/users", async (req, res, next) => {
  try {
    const ready = await ensurePostgresReady();
    if (!ready) {
      throw createHttpError(503, "PostgreSQL недоступен");
    }

    const payload = sanitizePracticeUserPayload(req.body);
    const user = await PostgresUser.create(payload);

    res.status(201).json(user.toJSON());
  } catch (error) {
    next(error);
  }
});

app.get("/api/postgres/users", async (req, res, next) => {
  try {
    const ready = await ensurePostgresReady();
    if (!ready) {
      throw createHttpError(503, "PostgreSQL недоступен");
    }

    const users = await PostgresUser.findAll({
      order: [["id", "ASC"]],
    });

    res.json(users.map((user) => user.toJSON()));
  } catch (error) {
    next(error);
  }
});

app.get("/api/postgres/users/:id", async (req, res, next) => {
  try {
    const ready = await ensurePostgresReady();
    if (!ready) {
      throw createHttpError(503, "PostgreSQL недоступен");
    }

    const id = parseNumericId(req.params.id);
    const user = await PostgresUser.findByPk(id);
    if (!user) {
      throw createHttpError(404, "Пользователь PostgreSQL не найден");
    }

    res.json(user.toJSON());
  } catch (error) {
    next(error);
  }
});

app.patch("/api/postgres/users/:id", async (req, res, next) => {
  try {
    const ready = await ensurePostgresReady();
    if (!ready) {
      throw createHttpError(503, "PostgreSQL недоступен");
    }

    const id = parseNumericId(req.params.id);
    const payload = sanitizePracticeUserPayload(req.body, { partial: true });
    const user = await PostgresUser.findByPk(id);
    if (!user) {
      throw createHttpError(404, "Пользователь PostgreSQL не найден");
    }

    await user.update(payload);
    res.json(user.toJSON());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/postgres/users/:id", async (req, res, next) => {
  try {
    const ready = await ensurePostgresReady();
    if (!ready) {
      throw createHttpError(503, "PostgreSQL недоступен");
    }

    const id = parseNumericId(req.params.id);
    const user = await PostgresUser.findByPk(id);
    if (!user) {
      throw createHttpError(404, "Пользователь PostgreSQL не найден");
    }

    await user.destroy();
    res.json({
      message: "Пользователь удалён из PostgreSQL",
      id,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/mongo/users", async (req, res, next) => {
  try {
    const ready = await ensureMongoReady();
    if (!ready) {
      throw createHttpError(503, "MongoDB недоступен");
    }

    const payload = sanitizePracticeUserPayload(req.body);
    const now = Date.now();
    const user = await MongoUser.create({
      id: await getNextMongoSequence("mongo_users"),
      ...payload,
      created_at: now,
      updated_at: now,
    });

    res.status(201).json(user.toObject());
  } catch (error) {
    next(error);
  }
});

app.get("/api/mongo/users", async (req, res, next) => {
  try {
    const ready = await ensureMongoReady();
    if (!ready) {
      throw createHttpError(503, "MongoDB недоступен");
    }

    const users = await MongoUser.find().sort({ id: 1 }).lean();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

app.get("/api/mongo/users/:id", async (req, res, next) => {
  try {
    const ready = await ensureMongoReady();
    if (!ready) {
      throw createHttpError(503, "MongoDB недоступен");
    }

    const id = parseNumericId(req.params.id);
    const user = await MongoUser.findOne({ id }).lean();
    if (!user) {
      throw createHttpError(404, "Пользователь MongoDB не найден");
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/mongo/users/:id", async (req, res, next) => {
  try {
    const ready = await ensureMongoReady();
    if (!ready) {
      throw createHttpError(503, "MongoDB недоступен");
    }

    const id = parseNumericId(req.params.id);
    const payload = sanitizePracticeUserPayload(req.body, { partial: true });
    payload.updated_at = Date.now();

    const user = await MongoUser.findOneAndUpdate({ id }, payload, {
      new: true,
      runValidators: true,
      lean: true,
    });

    if (!user) {
      throw createHttpError(404, "Пользователь MongoDB не найден");
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/mongo/users/:id", async (req, res, next) => {
  try {
    const ready = await ensureMongoReady();
    if (!ready) {
      throw createHttpError(503, "MongoDB недоступен");
    }

    const id = parseNumericId(req.params.id);
    const user = await MongoUser.findOneAndDelete({ id }).lean();
    if (!user) {
      throw createHttpError(404, "Пользователь MongoDB не найден");
    }

    res.json({
      message: "Пользователь удалён из MongoDB",
      id,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    await ensureSeedData();
    const payload = sanitizeRegistration(req.body);
    const exists = authUsers.some((user) => user.username === payload.username);

    if (exists) {
      throw createHttpError(409, "Пользователь с таким username уже существует");
    }

    const user = {
      id: String(runtime.nextAuthUserId++),
      username: payload.username,
      passwordHash: await bcrypt.hash(payload.password, 10),
      role: payload.role,
      blocked: false,
      createdAt: Date.now(),
    };

    authUsers.push(user);
    await invalidateUsersCache(user.id);

    res.status(201).json({
      message: "Пользователь зарегистрирован",
      user: makePublicAuthUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    await ensureSeedData();
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = authUsers.find((item) => item.username === username);

    if (!user) {
      throw createHttpError(401, "Неверный логин или пароль");
    }

    if (user.blocked) {
      throw createHttpError(403, "Пользователь заблокирован");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw createHttpError(401, "Неверный логин или пароль");
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    refreshTokens.add(refreshToken);

    res.json({
      accessToken,
      refreshToken,
      user: makePublicAuthUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/refresh", async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "");
    if (!refreshToken || !refreshTokens.has(refreshToken)) {
      throw createHttpError(401, "Refresh token отсутствует или отозван");
    }

    const payload = jwt.verify(refreshToken, REFRESH_SECRET);
    const user = authUsers.find((item) => item.id === String(payload.sub));
    if (!user || user.blocked) {
      throw createHttpError(401, "Пользователь недоступен");
    }

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "");
    refreshTokens.delete(refreshToken);
    res.json({ message: "Сессия завершена" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    user: makePublicAuthUser(req.user),
  });
});

app.get(
  "/api/users",
  requireAuth,
  requireRole(["admin"]),
  cacheMiddleware(() => "rbac:users:all", USERS_CACHE_TTL),
  async (req, res, next) => {
    try {
      const data = authUsers.map(makePublicAuthUser);
      await sendServerPayload(req, res, data);
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/users/:id",
  requireAuth,
  requireRole(["admin"]),
  cacheMiddleware((req) => `rbac:users:${req.params.id}`, USERS_CACHE_TTL),
  async (req, res, next) => {
    try {
      const user = authUsers.find((item) => item.id === String(req.params.id));
      if (!user) {
        throw createHttpError(404, "Пользователь RBAC не найден");
      }

      await sendServerPayload(req, res, makePublicAuthUser(user));
    } catch (error) {
      next(error);
    }
  }
);

app.patch("/api/users/:id", requireAuth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const user = authUsers.find((item) => item.id === String(req.params.id));
    if (!user) {
      throw createHttpError(404, "Пользователь RBAC не найден");
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "blocked")) {
      user.blocked = Boolean(req.body.blocked);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "role")) {
      const nextRole = String(req.body.role || "").trim().toLowerCase();
      if (!["admin", "manager", "user"].includes(nextRole)) {
        throw createHttpError(400, "Недопустимая роль");
      }
      user.role = nextRole;
    }

    await invalidateUsersCache(user.id);

    res.json({
      message: "Пользователь обновлён",
      user: makePublicAuthUser(user),
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/products",
  requireAuth,
  cacheMiddleware(() => "rbac:products:all", PRODUCTS_CACHE_TTL),
  async (req, res, next) => {
    try {
      await sendServerPayload(req, res, products);
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/products/:id",
  requireAuth,
  cacheMiddleware((req) => `rbac:products:${req.params.id}`, PRODUCTS_CACHE_TTL),
  async (req, res, next) => {
    try {
      const product = products.find((item) => item.id === String(req.params.id));
      if (!product) {
        throw createHttpError(404, "Товар не найден");
      }

      await sendServerPayload(req, res, product);
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/products", requireAuth, requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const payload = sanitizeProductPayload(req.body);
    const product = {
      id: String(runtime.nextProductId++),
      ...payload,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    products.push(product);
    await invalidateProductsCache(product.id);

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

app.put("/api/products/:id", requireAuth, requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const product = products.find((item) => item.id === String(req.params.id));
    if (!product) {
      throw createHttpError(404, "Товар не найден");
    }

    const payload = sanitizeProductPayload(req.body);
    Object.assign(product, payload, { updatedAt: Date.now() });
    await invalidateProductsCache(product.id);

    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/:id", requireAuth, requireRole(["admin", "manager"]), async (req, res, next) => {
  try {
    const index = products.findIndex((item) => item.id === String(req.params.id));
    if (index === -1) {
      throw createHttpError(404, "Товар не найден");
    }

    const [removed] = products.splice(index, 1);
    await invalidateProductsCache(removed.id);

    res.json({
      message: "Товар удалён",
      id: removed.id,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/app", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});
app.use(
  "/app",
  express.static(FRONTEND_DIR, {
    redirect: false,
  })
);

app.use((req, res) => {
  res.status(404).json({
    error: "Маршрут не найден",
    server: SERVER_ID,
  });
});

app.use((error, req, res, next) => {
  if (error?.name === "SequelizeValidationError") {
    return res.status(400).json({ error: error.errors.map((item) => item.message).join("; ") });
  }

  if (error?.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({ error: "Нарушено ограничение уникальности PostgreSQL" });
  }

  if (error?.name === "MongoServerError" && error?.code === 11000) {
    return res.status(409).json({ error: "Нарушено ограничение уникальности MongoDB" });
  }

  if (error?.name === "ValidationError") {
    return res.status(400).json({ error: error.message });
  }

  const status = error?.status || 500;
  if (status >= 500) {
    console.error("Unhandled server error:", error);
  }

  return res.status(status).json({
    error: error?.message || "Внутренняя ошибка сервера",
    server: SERVER_ID,
  });
});

let reconnectTimer = null;

async function startServer() {
  await ensureSeedData();
  void warmupServices();

  if (!reconnectTimer) {
    reconnectTimer = setInterval(() => {
      void warmupServices();
    }, 30000);
    reconnectTimer.unref();
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Server ${SERVER_ID} started on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  startServer,
  ensurePostgresReady,
  ensureMongoReady,
  ensureRedisReady,
};
