const express = require("express");
const cors = require("cors");
const { nanoid } = require("nanoid");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const app = express();
const port = 3000;

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3001"],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`
    );
  });
  next();
});

let products = [
  {
    id: nanoid(8),
    name: "Игровая мышь HyperStrike M1",
    category: "Периферия",
    description: "Проводная мышь с сенсором 12000 DPI и RGB-подсветкой.",
    price: 3490,
    stock: 25,
    rating: 4.7,
    imageUrl: "https://images.unsplash.com/photo-1527814050087-3793815479db",
  },
  {
    id: nanoid(8),
    name: "Механическая клавиатура IronKeys K87",
    category: "Периферия",
    description: "Компактная TKL-клавиатура с hot-swap переключателями.",
    price: 6990,
    stock: 14,
    rating: 4.8,
    imageUrl: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae",
  },
  {
    id: nanoid(8),
    name: "Наушники WaveSound Pro",
    category: "Аудио",
    description: "Закрытые наушники с микрофоном и виртуальным 7.1 звуком.",
    price: 5290,
    stock: 31,
    rating: 4.5,
    imageUrl: "https://images.unsplash.com/photo-1484704849700-f032a568e944",
  },
  {
    id: nanoid(8),
    name: "Монитор Vision 27Q",
    category: "Мониторы",
    description: "27 дюймов, IPS, 2560x1440, 165 Гц, HDR.",
    price: 24990,
    stock: 9,
    rating: 4.9,
    imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf",
  },
  {
    id: nanoid(8),
    name: "Веб-камера StreamCam X",
    category: "Стриминг",
    description: "Камера 1080p60 с автофокусом и шумоподавлением.",
    price: 4590,
    stock: 20,
    rating: 4.4,
    imageUrl: "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04",
  },
  {
    id: nanoid(8),
    name: "Микрофон VoiceBox USB",
    category: "Стриминг",
    description: "Конденсаторный USB-микрофон с кардиоидной диаграммой.",
    price: 5990,
    stock: 17,
    rating: 4.6,
    imageUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc",
  },
  {
    id: nanoid(8),
    name: "Коврик Control XL",
    category: "Периферия",
    description: "Увеличенный тканевый коврик с нескользящей основой.",
    price: 1290,
    stock: 52,
    rating: 4.3,
    imageUrl: "https://images.unsplash.com/photo-1617471346061-5d329ab9c574",
  },
  {
    id: nanoid(8),
    name: "SSD FlashDrive 1TB",
    category: "Накопители",
    description: "NVMe SSD 1 ТБ, скорость чтения до 5000 МБ/с.",
    price: 8490,
    stock: 19,
    rating: 4.8,
    imageUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704",
  },
  {
    id: nanoid(8),
    name: "Ноутбук DevBook 15",
    category: "Ноутбуки",
    description: "Ryzen 7, 16GB RAM, 512GB SSD, экран 2.5K.",
    price: 87990,
    stock: 6,
    rating: 4.7,
    imageUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853",
  },
  {
    id: nanoid(8),
    name: "Рюкзак TechPack",
    category: "Аксессуары",
    description: "Влагозащищенный рюкзак для ноутбука до 16 дюймов.",
    price: 3990,
    stock: 28,
    rating: 4.4,
    imageUrl: "https://images.unsplash.com/photo-1622560480654-d96214fdc887",
  },
];

let users = [
  { id: nanoid(6), name: "Петр", age: 16 },
  { id: nanoid(6), name: "Иван", age: 18 },
  { id: nanoid(6), name: "Дарья", age: 20 },
];

function toNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function validateCreateProduct(payload) {
  const name = payload?.name?.trim();
  const category = payload?.category?.trim();
  const description = payload?.description?.trim();
  const price = toNumber(payload?.price);
  const stock = toNumber(payload?.stock);
  const rating = toNumber(payload?.rating);
  const imageUrl = payload?.imageUrl?.trim();

  if (!name || !category || !description) {
    return { error: "name, category и description обязательны" };
  }
  if (Number.isNaN(price) || price === undefined || price < 0) {
    return { error: "price должен быть числом >= 0" };
  }
  if (Number.isNaN(stock) || stock === undefined || stock < 0 || !Number.isInteger(stock)) {
    return { error: "stock должен быть целым числом >= 0" };
  }
  if (rating !== undefined && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
    return { error: "rating должен быть числом от 0 до 5" };
  }

  return {
    data: {
      name,
      category,
      description,
      price,
      stock,
      ...(rating !== undefined ? { rating } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
  };
}

function validatePatchProduct(payload) {
  const updates = {};

  if (payload?.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) return { error: "name не может быть пустым" };
    updates.name = name;
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
    if (Number.isNaN(price) || price < 0) return { error: "price должен быть числом >= 0" };
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
    const imageUrl = String(payload.imageUrl).trim();
    updates.imageUrl = imageUrl;
  }

  if (Object.keys(updates).length === 0) {
    return { error: "Нет полей для обновления" };
  }

  return { data: updates };
}

function findProductOr404(id, res) {
  const product = products.find((p) => p.id === id);
  if (!product) {
    res.status(404).json({ error: "Товар не найден" });
    return null;
  }
  return product;
}

function findUserOr404(id, res) {
  const user = users.find((u) => u.id === id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  return user;
}

app.get("/", (req, res) => {
  res.json({
    message: "API работает",
    docs: "http://localhost:3000/api-docs",
    resources: ["/api/products", "/api/users"],
  });
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - category
 *         - description
 *         - price
 *         - stock
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         category:
 *           type: string
 *         description:
 *           type: string
 *         price:
 *           type: number
 *         stock:
 *           type: integer
 *         rating:
 *           type: number
 *         imageUrl:
 *           type: string
 *       example:
 *         id: "AbCd1234"
 *         name: "Игровая мышь"
 *         category: "Периферия"
 *         description: "Мышь с высоким DPI"
 *         price: 3490
 *         stock: 12
 *         rating: 4.6
 *         imageUrl: "https://example.com/mouse.jpg"
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - age
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         age:
 *           type: integer
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Получить список всех товаров
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Список товаров
 */
app.get("/api/products", (req, res) => {
  res.json(products);
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Получить товар по ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Товар найден
 *       404:
 *         description: Товар не найден
 */
app.get("/api/products/:id", (req, res) => {
  const product = findProductOr404(req.params.id, res);
  if (!product) return;
  res.json(product);
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Создать новый товар
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Товар создан
 *       400:
 *         description: Ошибка валидации
 */
app.post("/api/products", (req, res) => {
  const { data, error } = validateCreateProduct(req.body);
  if (error) return res.status(400).json({ error });

  const created = { id: nanoid(8), ...data };
  products.push(created);
  res.status(201).json(created);
});

/**
 * @swagger
 * /api/products/{id}:
 *   patch:
 *     summary: Частично обновить товар
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Товар обновлен
 *       400:
 *         description: Ошибка валидации
 *       404:
 *         description: Товар не найден
 */
app.patch("/api/products/:id", (req, res) => {
  const product = findProductOr404(req.params.id, res);
  if (!product) return;

  const { data, error } = validatePatchProduct(req.body);
  if (error) return res.status(400).json({ error });

  Object.assign(product, data);
  res.json(product);
});

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Удалить товар
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Товар удален
 *       404:
 *         description: Товар не найден
 */
app.delete("/api/products/:id", (req, res) => {
  const exists = products.some((p) => p.id === req.params.id);
  if (!exists) return res.status(404).json({ error: "Товар не найден" });

  products = products.filter((p) => p.id !== req.params.id);
  res.status(204).send();
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Получить список пользователей
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: OK
 */
app.get("/api/users", (req, res) => {
  res.json(users);
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Получить пользователя по ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 */
app.get("/api/users/:id", (req, res) => {
  const user = findUserOr404(req.params.id, res);
  if (!user) return;
  res.json(user);
});

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Создать пользователя
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: Created
 */
app.post("/api/users", (req, res) => {
  const name = req.body?.name?.trim();
  const age = Number(req.body?.age);

  if (!name || !Number.isFinite(age) || age < 0 || age > 150) {
    return res.status(400).json({ error: "Name and age are required" });
  }

  const user = { id: nanoid(6), name, age };
  users.push(user);
  res.status(201).json(user);
});

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Обновить пользователя
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
app.patch("/api/users/:id", (req, res) => {
  const user = findUserOr404(req.params.id, res);
  if (!user) return;

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: "Name cannot be empty" });
    user.name = name;
  }
  if (req.body?.age !== undefined) {
    const age = Number(req.body.age);
    if (!Number.isFinite(age) || age < 0 || age > 150) {
      return res.status(400).json({ error: "Age must be between 0 and 150" });
    }
    user.age = age;
  }

  res.json(user);
});

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Удалить пользователя
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 */
app.delete("/api/users/:id", (req, res) => {
  const exists = users.some((u) => u.id === req.params.id);
  if (!exists) return res.status(404).json({ error: "User not found" });

  users = users.filter((u) => u.id !== req.params.id);
  res.status(204).send();
});

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Online Store API",
      version: "1.0.0",
      description: "CRUD API для товаров и пользователей",
    },
    servers: [{ url: `http://localhost:${port}` }],
  },
  apis: ["./app.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error", err);
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
