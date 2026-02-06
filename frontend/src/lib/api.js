import axios from 'axios';

const API_BASE = process.env.REACT_APP_BACKEND_URL + '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const auth = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Stock data endpoints
export const stocks = {
  getData: (symbol, interval = 'daily') => 
    api.get(`/stocks/${symbol}?interval=${interval}`),
  getIndicators: (symbol, params) => 
    api.get(`/stocks/${symbol}/indicators`, { params }),
  getSymbols: () => api.get('/symbols'),
};

// Backtest endpoints
export const backtest = {
  run: (data) => api.post('/backtest', data),
  history: () => api.get('/backtest/history'),
};

// Paper trading endpoints
export const paperTrades = {
  create: (symbol, positionType, quantity) => 
    api.post(`/paper-trades?symbol=${symbol}&position_type=${positionType}&quantity=${quantity}`),
  getAll: (status) => api.get('/paper-trades', { params: { status } }),
  close: (tradeId, exitReason = 'manual') => 
    api.put(`/paper-trades/${tradeId}/close?exit_reason=${exitReason}`),
  updateStop: (tradeId) => api.put(`/paper-trades/${tradeId}/update-stop`),
};

// Settings endpoints
export const settings = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

export default api;
