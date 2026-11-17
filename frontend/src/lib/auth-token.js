// Módulo de gestión de tokens de autenticación
// Almacena y recupera el JWT y datos de usuario del localStorage

// Guardar token y usuario en localStorage
export function setToken(token) {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

// Obtener token de localStorage
export function getToken() {
  return localStorage.getItem('token');
}

// Remover token de localStorage
export function removeToken() {
  localStorage.removeItem('token');
  removeUser();
}

// Guardar usuario en localStorage
export function setUser(user) {
  if (user) {
    localStorage.setItem('usuario', JSON.stringify(user));
  } else {
    localStorage.removeItem('usuario');
  }
}

// Obtener usuario de localStorage
export function getUser() {
  const userStr = localStorage.getItem('usuario');
  return userStr ? JSON.parse(userStr) : null;
}

// Remover usuario de localStorage
export function removeUser() {
  localStorage.removeItem('usuario');
}

// Verificar si hay sesión activa
export function hasSession() {
  return !!getToken() && !!getUser();
}

// Obtener datos completos de la sesión actual
export function getSession() {
  return {
    token: getToken(),
    user: getUser()
  };
}

// Inicializar sesión desde los datos del servidor
export function initSession(token, userData) {
  setToken(token);
  setUser(userData);
}