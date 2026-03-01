import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import "./App.css";

const emptyForm = {
  name: "",
  category: "",
  description: "",
  price: "",
  stock: "",
  rating: "",
  imageUrl: "",
};

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");
      const data = await api.getProducts();
      setProducts(data);
    } catch (err) {
      setError(err?.response?.data?.error || "Не удалось загрузить товары");
    } finally {
      setLoading(false);
    }
  }

  function fillForm(product) {
    setEditingId(product.id);
    setForm({
      name: product.name ?? "",
      category: product.category ?? "",
      description: product.description ?? "",
      price: String(product.price ?? ""),
      stock: String(product.stock ?? ""),
      rating: product.rating !== undefined ? String(product.rating) : "",
      imageUrl: product.imageUrl ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSubmit(e) {
    e.preventDefault();

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      stock: Number(form.stock),
      ...(form.rating !== "" ? { rating: Number(form.rating) } : {}),
      ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
    };

    try {
      setError("");
      if (editingId) {
        const updated = await api.updateProduct(editingId, payload);
        setProducts((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await api.createProduct(payload);
        setProducts((prev) => [created, ...prev]);
      }
      resetForm();
    } catch (err) {
      setError(err?.response?.data?.error || "Ошибка сохранения товара");
    }
  }

  async function removeProduct(id) {
    const ok = window.confirm("Удалить товар?");
    if (!ok) return;

    try {
      setError("");
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err?.response?.data?.error || "Ошибка удаления товара");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.category, p.description].join(" ").toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="kicker">Практика 2-6</p>
          <h1>1KR Tech Store</h1>
          <p className="subtitle">React + Express + Swagger. CRUD для каталога товаров.</p>
        </div>
        <a className="docsLink" href="http://localhost:3000/api-docs" target="_blank" rel="noreferrer">
          Open API Docs
        </a>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panelHead">
            <h2>{editingId ? "Редактирование" : "Новый товар"}</h2>
            {editingId && (
              <button className="ghost" onClick={resetForm} type="button">
                Отмена
              </button>
            )}
          </div>

          <form className="form" onSubmit={onSubmit}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название" required />
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Категория" required />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Описание"
              rows={3}
              required
            />
            <div className="grid2">
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Цена" type="number" min="0" required />
              <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Остаток" type="number" min="0" required />
            </div>
            <div className="grid2">
              <input
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: e.target.value })}
                placeholder="Рейтинг (0-5, опц.)"
                type="number"
                min="0"
                max="5"
                step="0.1"
              />
              <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="URL фото (опц.)" />
            </div>
            <button className="primary" type="submit">
              {editingId ? "Сохранить" : "Добавить"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panelHead">
            <h2>Каталог ({filtered.length})</h2>
            <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по товарам" />
          </div>

          {loading && <p className="state">Загрузка...</p>}
          {error && <p className="state error">{error}</p>}
          {!loading && !filtered.length && <p className="state">Нет товаров</p>}

          <div className="cards">
            {filtered.map((p) => (
              <article key={p.id} className="card">
                <img
                  src={p.imageUrl || "https://images.unsplash.com/photo-1518770660439-4636190af475"}
                  alt={p.name}
                  onError={(e) => {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1518770660439-4636190af475";
                  }}
                />
                <div className="meta">
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <div className="tags">
                    <span>{p.category}</span>
                    <span>{p.price} RUB</span>
                    <span>Склад: {p.stock}</span>
                    {p.rating !== undefined && <span>Рейтинг: {p.rating}</span>}
                  </div>
                </div>
                <div className="actions">
                  <button className="ghost" onClick={() => fillForm(p)} type="button">
                    Изменить
                  </button>
                  <button className="danger" onClick={() => removeProduct(p.id)} type="button">
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
