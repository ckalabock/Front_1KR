import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";
import "./App.css";

const emptyAuthForm = {
  email: "",
  first_name: "",
  last_name: "",
  password: "",
};

const emptyProductForm = {
  title: "",
  category: "",
  description: "",
  price: "",
  stock: "",
  rating: "",
  imageUrl: "",
};

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || fallback;
}

export default function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [currentUser, setCurrentUser] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [tokenPreview, setTokenPreview] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingId, setEditingId] = useState(null);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [productActionError, setProductActionError] = useState("");

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [adminOverview, setAdminOverview] = useState(null);
  const [moderationOverview, setModerationOverview] = useState(null);
  const [blacklistToken, setBlacklistToken] = useState("");
  const [blacklistStatus, setBlacklistStatus] = useState("");

  const canManageProducts = currentUser && ["admin", "moderator"].includes(currentUser.role);
  const canDeleteProducts = currentUser?.role === "admin";

  const filteredProducts = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) return products;

    return products.filter((product) =>
      [product.title, product.category, product.description].join(" ").toLowerCase().includes(normalized)
    );
  }, [deferredQuery, products]);

  function updateAuthField(field, value) {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateProductField(field, value) {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetAuthState() {
    setCurrentUser(null);
    setCurrentSession(null);
    setSessions([]);
    setTokenPreview("");
    setAdminOverview(null);
    setModerationOverview(null);
    setBlacklistToken("");
    setBlacklistStatus("");
  }

  function resetProductForm() {
    setEditingId(null);
    setProductForm(emptyProductForm);
  }

  function applyAuthPayload(payload) {
    setCurrentUser(payload.user);
    setCurrentSession(payload.session);
    setTokenPreview(api.getAccessToken());
  }

  async function loadProducts() {
    try {
      setLoadingProducts(true);
      setProductsError("");
      const data = await api.getProducts();
      startTransition(() => {
        setProducts(data);
      });
    } catch (error) {
      setProductsError(getErrorMessage(error, "Не удалось загрузить каталог"));
    } finally {
      setLoadingProducts(false);
    }
  }

  async function refreshPrivateData({ silent = false } = {}) {
    if (!silent) {
      setDashboardLoading(true);
    }

    try {
      setDashboardError("");
      const [meData, userSessions] = await Promise.all([api.getCurrentUser(), api.getSessions()]);

      setCurrentUser(meData.user);
      setCurrentSession(meData.session);
      setSessions(userSessions);
      setTokenPreview(api.getAccessToken());

      if (meData.user.role === "admin") {
        const [adminData, moderationData] = await Promise.all([
          api.getAdminOverview(),
          api.getModerationOverview(),
        ]);
        setAdminOverview(adminData);
        setModerationOverview(moderationData);
      } else if (meData.user.role === "moderator") {
        setAdminOverview(null);
        setModerationOverview(await api.getModerationOverview());
      } else {
        setAdminOverview(null);
        setModerationOverview(null);
      }
    } catch (error) {
      resetAuthState();
      if (error?.response?.status !== 401) {
        setDashboardError(getErrorMessage(error, "Не удалось обновить защищенные данные"));
      }
    } finally {
      if (!silent) {
        setDashboardLoading(false);
      }
    }
  }

  useEffect(() => {
    loadProducts();

    (async () => {
      try {
        const bootstrap = await api.bootstrapSession();
        applyAuthPayload(bootstrap.me);
        setSessions(bootstrap.sessions);
        const user = bootstrap.me.user;

        if (user.role === "admin") {
          const [adminData, moderationData] = await Promise.all([
            api.getAdminOverview(),
            api.getModerationOverview(),
          ]);
          setAdminOverview(adminData);
          setModerationOverview(moderationData);
        } else if (user.role === "moderator") {
          setAdminOverview(null);
          setModerationOverview(await api.getModerationOverview());
        } else {
          setAdminOverview(null);
          setModerationOverview(null);
        }
      } catch {
        resetAuthState();
      } finally {
        setDashboardLoading(false);
      }
    })();
  }, []);

  async function submitAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      if (authMode === "register") {
        await api.register(authForm);
      }

      const loginPayload = { email: authForm.email, password: authForm.password };
      const authPayload = await api.login(loginPayload);
      applyAuthPayload(authPayload);
      await refreshPrivateData({ silent: true });
      setAuthForm(emptyAuthForm);
    } catch (error) {
      setAuthError(getErrorMessage(error, "Ошибка авторизации"));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch (error) {
      setDashboardError(getErrorMessage(error, "Не удалось завершить сессию"));
    } finally {
      resetAuthState();
      setSelectedProduct(null);
      setDetailError("");
    }
  }

  async function handleLogoutAll() {
    try {
      await api.logoutAll();
    } catch (error) {
      setDashboardError(getErrorMessage(error, "Не удалось завершить все сессии"));
    } finally {
      resetAuthState();
      setSelectedProduct(null);
      setDetailError("");
    }
  }

  function fillProductForm(product) {
    setEditingId(product.id);
    setProductForm({
      title: product.title ?? "",
      category: product.category ?? "",
      description: product.description ?? "",
      price: String(product.price ?? ""),
      stock: String(product.stock ?? ""),
      rating: product.rating !== undefined ? String(product.rating) : "",
      imageUrl: product.imageUrl ?? "",
    });
  }

  async function submitProduct(event) {
    event.preventDefault();
    setProductSubmitting(true);
    setProductActionError("");

    const payload = {
      title: productForm.title.trim(),
      category: productForm.category.trim(),
      description: productForm.description.trim(),
      price: Number(productForm.price),
      stock: Number(productForm.stock),
      ...(productForm.rating !== "" ? { rating: Number(productForm.rating) } : {}),
      ...(productForm.imageUrl.trim() ? { imageUrl: productForm.imageUrl.trim() } : {}),
    };

    try {
      if (editingId) {
        const updated = await api.updateProduct(editingId, payload);
        setProducts((prev) => prev.map((product) => (product.id === editingId ? updated : product)));
        if (selectedProduct?.id === editingId) {
          setSelectedProduct(updated);
        }
      } else {
        const created = await api.createProduct(payload);
        setProducts((prev) => [created, ...prev]);
      }

      resetProductForm();
      await refreshPrivateData({ silent: true });
    } catch (error) {
      setProductActionError(getErrorMessage(error, "Не удалось сохранить товар"));
    } finally {
      setProductSubmitting(false);
    }
  }

  async function removeProduct(id) {
    if (!window.confirm("Удалить товар без возможности восстановления?")) {
      return;
    }

    try {
      setProductActionError("");
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((product) => product.id !== id));
      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }
      if (editingId === id) {
        resetProductForm();
      }
      await refreshPrivateData({ silent: true });
    } catch (error) {
      setProductActionError(getErrorMessage(error, "Не удалось удалить товар"));
    }
  }

  async function loadProtectedProduct(id) {
    try {
      setDetailLoading(true);
      setDetailError("");
      setSelectedProduct(await api.getProductById(id));
    } catch (error) {
      setDetailError(
        getErrorMessage(error, "Не удалось получить защищенные детали товара. Выполните вход.")
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitBlacklist(event) {
    event.preventDefault();
    try {
      setBlacklistStatus("");
      await api.blacklistToken(blacklistToken);
      setBlacklistStatus("Токен добавлен в blacklist, связанная сессия отозвана.");
      setBlacklistToken("");
      await refreshPrivateData({ silent: true });
    } catch (error) {
      setBlacklistStatus(getErrorMessage(error, "Не удалось добавить токен в blacklist"));
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="kicker">Практики 7-12</p>
          <h1>1KR Auth Control Center</h1>
          <p className="subtitle">
            Bcrypt, JWT access/refresh, HttpOnly cookie, сессии, RBAC, blacklist и защищенный CRUD.
          </p>
        </div>
        <div className="heroActions">
          <a className="pillLink" href="http://localhost:3000/api-docs" target="_blank" rel="noreferrer">
            Swagger
          </a>
          <button className="ghost" type="button" onClick={loadProducts}>
            Обновить каталог
          </button>
        </div>
      </header>

      <section className="practiceStrip">
        {["7: bcrypt", "8: access token", "9: cookie", "10: refresh + sessions", "11: RBAC + blacklist", "12: README + защита"].map(
          (item) => (
            <span key={item}>{item}</span>
          )
        )}
      </section>

      <main className="layout">
        <section className="stack">
          <article className="panel">
            <div className="panelHead">
              <h2>{currentUser ? "Профиль" : authMode === "login" ? "Вход" : "Регистрация"}</h2>
              {!currentUser && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setAuthMode((prev) => (prev === "login" ? "register" : "login"));
                    setAuthError("");
                  }}
                >
                  {authMode === "login" ? "Новый аккаунт" : "Есть аккаунт"}
                </button>
              )}
            </div>

            {!currentUser ? (
              <form className="form" onSubmit={submitAuth}>
                <input
                  value={authForm.email}
                  onChange={(event) => updateAuthField("email", event.target.value)}
                  placeholder="Email"
                  type="email"
                  required
                />
                {authMode === "register" && (
                  <>
                    <input
                      value={authForm.first_name}
                      onChange={(event) => updateAuthField("first_name", event.target.value)}
                      placeholder="Имя"
                      required
                    />
                    <input
                      value={authForm.last_name}
                      onChange={(event) => updateAuthField("last_name", event.target.value)}
                      placeholder="Фамилия"
                      required
                    />
                  </>
                )}
                <input
                  value={authForm.password}
                  onChange={(event) => updateAuthField("password", event.target.value)}
                  placeholder="Пароль"
                  type="password"
                  minLength={8}
                  required
                />
                <button className="primary" disabled={authLoading} type="submit">
                  {authLoading ? "Отправка..." : authMode === "login" ? "Войти" : "Зарегистрироваться"}
                </button>
                {authError && <p className="state error">{authError}</p>}
                <div className="credentials">
                  <strong>Демо-аккаунты:</strong>
                  <span>`admin@1kr.local / Admin123!`</span>
                  <span>`moderator@1kr.local / Moderator123!`</span>
                  <span>`user@1kr.local / User12345!`</span>
                </div>
              </form>
            ) : (
              <div className="profileCard">
                <div className="badgeRow">
                  <span className={`badge role-${currentUser.role}`}>{currentUser.role}</span>
                  {currentSession?.is_current && <span className="badge">current session</span>}
                </div>
                <h3>
                  {currentUser.first_name} {currentUser.last_name}
                </h3>
                <p>{currentUser.email}</p>
                <div className="miniActions">
                  <button className="ghost" onClick={() => refreshPrivateData()} type="button">
                    Обновить профиль
                  </button>
                  <button className="ghost" onClick={handleLogoutAll} type="button">
                    Logout all
                  </button>
                  <button className="danger" onClick={handleLogout} type="button">
                    Logout
                  </button>
                </div>
              </div>
            )}
          </article>

          <article className="panel">
            <div className="panelHead">
              <h2>Сессии и токены</h2>
              {dashboardLoading && <span className="hint">Загрузка...</span>}
            </div>
            {dashboardError && <p className="state error">{dashboardError}</p>}

            <div className="tokenBox">
              <p className="label">Access token в памяти клиента</p>
              <textarea readOnly rows={4} value={tokenPreview || "Нет активного access token"} />
            </div>

            <div className="sessionList">
              {sessions.length ? (
                sessions.map((session) => (
                  <div className="sessionItem" key={session.id}>
                    <div className="sessionTop">
                      <strong>{session.is_current ? "Текущая" : "Дополнительная"} сессия</strong>
                      <span className={`badge ${session.revoked_at ? "badge-danger" : ""}`}>
                        {session.revoked_at ? "revoked" : "active"}
                      </span>
                    </div>
                    <p>{session.user_agent}</p>
                    <small>Истекает: {new Date(session.expires_at).toLocaleString()}</small>
                    {session.revocation_reason && <small>Причина: {session.revocation_reason}</small>}
                  </div>
                ))
              ) : (
                <p className="state">После входа здесь появятся активные сессии.</p>
              )}
            </div>
          </article>

          {currentUser?.role === "admin" && (
            <article className="panel">
              <div className="panelHead">
                <h2>Blacklist</h2>
              </div>
              <form className="form" onSubmit={submitBlacklist}>
                <textarea
                  value={blacklistToken}
                  onChange={(event) => setBlacklistToken(event.target.value)}
                  placeholder="Вставьте access token, который нужно отозвать"
                  rows={5}
                  required
                />
                <button className="primary" type="submit">
                  Добавить в blacklist
                </button>
                {blacklistStatus && <p className="state">{blacklistStatus}</p>}
              </form>
            </article>
          )}
        </section>

        <section className="stack wide">
          <article className="panel">
            <div className="panelHead">
              <h2>Панель практик</h2>
              <span className="hint">JWT + cookies + RBAC</span>
            </div>
            <div className="statsGrid">
              <div className="statCard">
                <span>Пользователь</span>
                <strong>{currentUser ? currentUser.role : "guest"}</strong>
              </div>
              <div className="statCard">
                <span>Сессий</span>
                <strong>{sessions.length}</strong>
              </div>
              <div className="statCard">
                <span>Товаров</span>
                <strong>{products.length}</strong>
              </div>
              <div className="statCard">
                <span>Защищенный GET /products/:id</span>
                <strong>{currentUser ? "доступен" : "требует login"}</strong>
              </div>
            </div>

            {adminOverview && (
              <div className="overviewBlock">
                <h3>Admin overview</h3>
                <div className="statsGrid">
                  <div className="statCard">
                    <span>Пользователей</span>
                    <strong>{adminOverview.users_total}</strong>
                  </div>
                  <div className="statCard">
                    <span>Активных сессий</span>
                    <strong>{adminOverview.active_sessions}</strong>
                  </div>
                  <div className="statCard">
                    <span>Blacklisted JWT</span>
                    <strong>{adminOverview.blacklisted_access_tokens}</strong>
                  </div>
                  <div className="statCard">
                    <span>Товаров</span>
                    <strong>{adminOverview.products_total}</strong>
                  </div>
                </div>
              </div>
            )}

            {moderationOverview && (
              <div className="overviewBlock">
                <h3>Moderation overview</h3>
                <p className="state">
                  Низкий остаток: {moderationOverview.low_stock_products.length} позиций.
                </p>
                <div className="tags">
                  {moderationOverview.low_stock_products.map((product) => (
                    <span key={product.id}>
                      {product.title}: {product.stock}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>

          <div className="catalogGrid">
            <article className="panel">
              <div className="panelHead">
                <h2>{editingId ? "Редактирование товара" : "Создание товара"}</h2>
                {editingId && (
                  <button className="ghost" onClick={resetProductForm} type="button">
                    Сбросить
                  </button>
                )}
              </div>

              <form className="form" onSubmit={submitProduct}>
                <input
                  value={productForm.title}
                  onChange={(event) => updateProductField("title", event.target.value)}
                  placeholder="Название"
                  required
                />
                <input
                  value={productForm.category}
                  onChange={(event) => updateProductField("category", event.target.value)}
                  placeholder="Категория"
                  required
                />
                <textarea
                  value={productForm.description}
                  onChange={(event) => updateProductField("description", event.target.value)}
                  placeholder="Описание"
                  rows={4}
                  required
                />
                <div className="grid2">
                  <input
                    value={productForm.price}
                    onChange={(event) => updateProductField("price", event.target.value)}
                    placeholder="Цена"
                    type="number"
                    min="0"
                    required
                  />
                  <input
                    value={productForm.stock}
                    onChange={(event) => updateProductField("stock", event.target.value)}
                    placeholder="Остаток"
                    type="number"
                    min="0"
                    required
                  />
                </div>
                <div className="grid2">
                  <input
                    value={productForm.rating}
                    onChange={(event) => updateProductField("rating", event.target.value)}
                    placeholder="Рейтинг"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                  />
                  <input
                    value={productForm.imageUrl}
                    onChange={(event) => updateProductField("imageUrl", event.target.value)}
                    placeholder="URL изображения"
                  />
                </div>
                <button className="primary" disabled={!canManageProducts || productSubmitting} type="submit">
                  {productSubmitting ? "Сохранение..." : editingId ? "Обновить товар" : "Создать товар"}
                </button>
                {!canManageProducts && (
                  <p className="state">Создание и редактирование доступны только `admin` и `moderator`.</p>
                )}
                {productActionError && <p className="state error">{productActionError}</p>}
              </form>
            </article>

            <article className="panel">
              <div className="panelHead">
                <h2>Каталог товаров ({filteredProducts.length})</h2>
                <input
                  className="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск по каталогу"
                />
              </div>

              {loadingProducts && <p className="state">Каталог загружается...</p>}
              {productsError && <p className="state error">{productsError}</p>}

              <div className="cards">
                {filteredProducts.map((product) => (
                  <article className="card" key={product.id}>
                    <img
                      src={product.imageUrl || "https://images.unsplash.com/photo-1518770660439-4636190af475"}
                      alt={product.title}
                      onError={(event) => {
                        event.currentTarget.src =
                          "https://images.unsplash.com/photo-1518770660439-4636190af475";
                      }}
                    />
                    <div className="meta">
                      <div className="titleRow">
                        <h3>{product.title}</h3>
                        <span className="price">{product.price} RUB</span>
                      </div>
                      <p>{product.description}</p>
                      <div className="tags">
                        <span>{product.category}</span>
                        <span>stock: {product.stock}</span>
                        {product.rating !== undefined && <span>rating: {product.rating}</span>}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="ghost" onClick={() => loadProtectedProduct(product.id)} type="button">
                        Детали API
                      </button>
                      {canManageProducts && (
                        <button className="ghost" onClick={() => fillProductForm(product)} type="button">
                          Изменить
                        </button>
                      )}
                      {canDeleteProducts && (
                        <button className="danger" onClick={() => removeProduct(product.id)} type="button">
                          Удалить
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </div>

          <article className="panel">
            <div className="panelHead">
              <h2>Защищенный просмотр товара</h2>
              {detailLoading && <span className="hint">Загрузка...</span>}
            </div>
            {detailError && <p className="state error">{detailError}</p>}
            {!selectedProduct && !detailError && (
              <p className="state">
                Нажмите `Детали API`, чтобы проверить защищенный маршрут `GET /api/products/:id`.
              </p>
            )}
            {selectedProduct && (
              <div className="detailCard">
                <h3>{selectedProduct.title}</h3>
                <p>{selectedProduct.description}</p>
                <div className="detailGrid">
                  <span>Категория: {selectedProduct.category}</span>
                  <span>Цена: {selectedProduct.price} RUB</span>
                  <span>Склад: {selectedProduct.stock}</span>
                  <span>Рейтинг: {selectedProduct.rating ?? "n/a"}</span>
                </div>
                <small>ID: {selectedProduct.id}</small>
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
