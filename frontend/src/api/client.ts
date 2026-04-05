import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 10000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - is Anki running?');
    }
    throw error.response?.data?.detail || error.message;
  }
);
