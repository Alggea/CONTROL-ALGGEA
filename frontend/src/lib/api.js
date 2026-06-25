import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

export const fmtMXN = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const fmtDate = (d) => {
  if (!d) return "—";
  let date;
  if (typeof d === "string") {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d);
    date = isDateOnly ? new Date(d + "T12:00:00") : new Date(d);
  } else {
    date = d;
  }
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

export const fmtErr = (err) => {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return err?.message || "Error desconocido";
};
