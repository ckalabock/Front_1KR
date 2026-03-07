import axios from "axios";

const apiClient = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

let accessToken = "";
let refreshPromise = null;

function setAccessToken(token) {
  accessToken = token || "";
}

function clearAccessToken() {
  accessToken = "";
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post("/auth/refresh", {}, { skipAuthRefresh: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch((error) => {
        clearAccessToken();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config ?? {};
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.skipAuthRefresh &&
      accessToken
    ) {
      originalRequest._retry = true;

      const nextToken = await refreshAccessToken();
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${nextToken}`;
      return apiClient(originalRequest);
    }

    throw error;
  }
);

export const api = {
  getAccessToken: () => accessToken,
  clearAccessToken,
  bootstrapSession: async () => {
    await refreshAccessToken();
    const [{ data: me }, { data: sessions }] = await Promise.all([
      apiClient.get("/auth/me", { skipAuthRefresh: true }),
      apiClient.get("/auth/sessions", { skipAuthRefresh: true }),
    ]);

    return { me, sessions };
  },
  register: async (payload) => (await apiClient.post("/auth/register", payload, { skipAuthRefresh: true })).data,
  login: async (payload) => {
    const { data } = await apiClient.post("/auth/login", payload, { skipAuthRefresh: true });
    setAccessToken(data.accessToken);
    return data;
  },
  getCurrentUser: async () => (await apiClient.get("/auth/me")).data,
  getSessions: async () => (await apiClient.get("/auth/sessions")).data,
  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      clearAccessToken();
    }
  },
  logoutAll: async () => {
    try {
      await apiClient.post("/auth/logout-all");
    } finally {
      clearAccessToken();
    }
  },
  blacklistToken: async (token) => (await apiClient.post("/auth/blacklist", { token })).data,
  getProducts: async () => (await apiClient.get("/products")).data,
  getProductById: async (id) => (await apiClient.get(`/products/${id}`)).data,
  createProduct: async (payload) => (await apiClient.post("/products", payload)).data,
  updateProduct: async (id, payload) => (await apiClient.patch(`/products/${id}`, payload)).data,
  deleteProduct: async (id) => {
    await apiClient.delete(`/products/${id}`);
  },
  getAdminOverview: async () => (await apiClient.get("/admin/overview")).data,
  getModerationOverview: async () => (await apiClient.get("/moderation/overview")).data,
};
