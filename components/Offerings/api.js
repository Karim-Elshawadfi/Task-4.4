// Axios instance and shared formatting for the course offering and standard schedule pages.
// Login (Req 1) sets an HttpOnly "token" cookie that the browser sends on same-origin /api
// requests. A client that keeps the login token in localStorage sends it as a Bearer header.
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

export const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'];
export const DAY_LABEL = {
  SATURDAY: 'Saturday', SUNDAY: 'Sunday', MONDAY: 'Monday',
  TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday',
};
export const TYPE_LABEL = { LECTURE: 'Lecture', TUTORIAL: 'Tutorial', LAB: 'Lab' };
export const TYPE_TONE = { LECTURE: 'blue', TUTORIAL: 'green', LAB: 'amber' };

export const slotText = (s) => `${TYPE_LABEL[s.type] ?? s.type} ${s.group_number}`;
export const timeText = (s) => `${s.start_time}-${s.end_time}`;

/** "HH:MM" -> minutes after midnight, or null. */
export const toMinutes = (time) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// One stable colour per course code, so a course reads the same in the table, the picker and
// the weekly grid. The hue comes from the code itself, so it never shifts between pages.
// Every pair is kept dark-on-light for AA contrast.
const COURSE_COLOURS = [
  ['#4338ca', '#eef2ff', '#3730a3'], ['#0f766e', '#f0fdfa', '#115e59'],
  ['#b45309', '#fffbeb', '#92400e'], ['#be123c', '#fff1f2', '#9f1239'],
  ['#7e22ce', '#faf5ff', '#6b21a8'], ['#1d4ed8', '#eff6ff', '#1e40af'],
  ['#15803d', '#f0fdf4', '#166534'], ['#c2410c', '#fff7ed', '#9a3412'],
  ['#0369a1', '#f0f9ff', '#075985'], ['#4d7c0f', '#f7fee7', '#3f6212'],
];
export function courseColour(code) {
  let hash = 0;
  for (const ch of String(code ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_COLOURS[hash % COURSE_COLOURS.length];
}
/** The course colour as inline custom properties, which the CSS reads. */
export function courseStyle(code) {
  const [line, wash, ink] = courseColour(code);
  return { '--off-c': line, '--off-c-wash': wash, '--off-c-ink': ink };
}

/** How full a group is, for the capacity pill. */
export const capacityTone = (slot) => {
  const remaining = slot.remaining_capacity ?? 0;
  if (remaining === 0) return 'red';
  if (remaining <= Math.max(Math.round((slot.max_capacity || 1) * 0.1), 1)) return 'amber';
  return 'green';
};

export default api;
