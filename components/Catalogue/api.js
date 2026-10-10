// Axios instance for the terms/catalogue pages.
// Login (Req 1, Person 1) sets an HttpOnly "token" cookie, which the browser sends automatically
// on same-origin /api requests. If a client keeps the token from the login response in
// localStorage under "token" instead, it is sent as a Bearer header.
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errorMessage = (err) =>
  err?.response?.data?.message || (err?.response ? `Request failed (${err.response.status})` : 'Cannot reach the server');
export const fieldErrors = (err) => err?.response?.data?.errors || {};

export const SEASON_LABEL = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', BOTH: 'Winter & Spring' };
export const TYPE_LABEL = { CORE: 'Core', ELECTIVE: 'Elective', HUMA: 'Humanities' };

export const formatDay = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// <input type="date"> / <input type="datetime-local"> need local "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm"
const pad = (n) => String(n).padStart(2, '0');
export const toDateInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const toDateTimeInput = (d) => (d ? `${toDateInput(d)}T${pad(new Date(d).getHours())}:${pad(new Date(d).getMinutes())}` : '');
export const fromInput = (v) => (v ? new Date(v).toISOString() : ''); // local time -> ISO for the API

export default api;
