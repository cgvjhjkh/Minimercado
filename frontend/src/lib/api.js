// Base URL de la API
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Helper para hacer fetch con manejo de errores
const fetchApi = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': options.headers?.['Content-Type'] || 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    method: options.method || 'GET',
    headers,
    body: options.body ? (options.body instanceof FormData ? options.body : JSON.stringify(options.body)) : undefined,
    ...options,
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Error ${response.status}`);
    }

    return { success: true, data };
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    return { success: false, error: error.message || 'Error de conexión' };
  }
};

// ===== AUTH ENDPOINTS =====

export const auth = {
  // Login de usuario (usado desde la página de inicio)
  login: async (credentials) => {
    const result = await fetchApi('/api/auth/login', {
      method: 'POST',
      body: credentials,
    });
    if (result.success && result.data.usuario) {
      localStorage.setItem('token', result.data.token || '');
      localStorage.setItem('usuario', JSON.stringify(result.data.usuario));
    }
    return result;
  },

  // Obtener usuario actual
  me: async () => {
    const result = await fetchApi('/api/auth/me');
    if (result.success && result.data.usuario) {
      // No setUser aquí porque usa window.usuarioActual en la copia prueba
    }
    return result;
  },

  // Logout
  logout: async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/';
  },
};

// ===== PERFIL ENDPOINT =====

export const actualizarPerfil = async (formData) => {
  const response = await fetch(`${API_BASE}/api/auth/perfil`, {
    method: 'PUT',
    headers: {
      Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : {},
      // No fijar Content-Type: el navegador agrega el boundary de multipart
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }

  if (data.usuario) {
    // Actualizar localStorage y el global window.usuarioActual
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    window.usuarioActual = data.usuario;
    // Dispatch event para que PerfilMenu y otros componentes se enteren
    window.dispatchEvent(
      new CustomEvent('perfil:actualizado', { detail: data.usuario })
    );
  }

  return data;
};