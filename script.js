// script.js

// ============ MAPEO DE ROL -> PÁGINA ============
const PAGINA_POR_ROL = {
    cliente: 'cliente.html',
    empleado: 'empleado.html',
    admin: 'administrador.html',
    repartidor: 'repartidor.html'
};

function redirigirPorRol(rol) {
    return PAGINA_POR_ROL[rol] || 'index.html';
}

document.addEventListener('DOMContentLoaded', function() {

    // ============ REGISTRO (Modal en index.html) ============
    const registerModalForm = document.getElementById('registerForm');
    if (registerModalForm) {
        registerModalForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nombre_completo = document.getElementById('reg_nombre_completo').value.trim();
            const correo = document.getElementById('reg_correo').value.trim();
            const contrasena = document.getElementById('reg_contrasena_hash').value;
            const telefono = document.getElementById('reg_telefono') ? document.getElementById('reg_telefono').value.trim() : '';
            const doc_identidad = document.getElementById('reg_doc_identidad') ? document.getElementById('reg_doc_identidad').value.trim() : '';
            const fecha_nacimiento = document.getElementById('reg_fecha_nacimiento') ? document.getElementById('reg_fecha_nacimiento').value : '';

            if (!nombre_completo || !correo || !contrasena) {
                showAlert('Por favor, completa todos los campos obligatorios.', 'warning');
                return;
            }

            if (contrasena.length < 6) {
                showAlert('La contraseña debe tener al menos 6 caracteres.', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/auth/registrar-cliente', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre_completo,
                        correo,
                        contrasena_hash: contrasena,
                        telefono: telefono || null,
                        doc_identidad: doc_identidad || null,
                        fecha_nacimiento: fecha_nacimiento || null
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showAlert('✅ ¡Cuenta creada con éxito!', 'success');
                    const registerModal = document.getElementById('registermodal');
                    if (registerModal) {
                        const modal = bootstrap.Modal.getInstance(registerModal);
                        if (modal) modal.hide();
                    }
                    registerModalForm.reset();
                    setTimeout(() => {
                        const loginModal = document.getElementById('loginmodal');
                        if (loginModal) {
                            new bootstrap.Modal(loginModal).show();
                        }
                    }, 500);
                } else {
                    showAlert('❌ ' + data.error, 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                showAlert('❌ Error de conexión con el servidor.', 'danger');
            }
        });
    }

    // ============ LOGIN (Modal en index.html) ============
    const loginModalForm = document.getElementById('loginForm');
    if (loginModalForm) {
        loginModalForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login_correo').value.trim();
            const password = document.getElementById('login_contrasena').value.trim();

            if (!email || !password) {
                showAlert('Por favor, ingresa tu correo y contraseña.', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ correo: email, contrasena: password })
                });

                const data = await response.json();

                if (data.success) {
                    showAlert('✅ ¡Bienvenido ' + data.usuario.nombre_completo + '!', 'success');
                    localStorage.setItem('usuario', JSON.stringify(data.usuario));
                    const modal = bootstrap.Modal.getInstance(document.getElementById('loginmodal'));
                    if (modal) modal.hide();
                    setTimeout(() => {
                        window.location.href = redirigirPorRol(data.usuario.rol);
                    }, 500);
                } else {
                    showAlert('❌ ' + data.error, 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                showAlert('❌ Error de conexión con el servidor.', 'danger');
            }
        });
    }

    // ============ LOGIN (Página independiente login.html) ============
    const loginPageForm = document.getElementById('loginPageForm');
    if (loginPageForm) {
        loginPageForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('loginPageEmail').value.trim();
            const password = document.getElementById('loginPagePassword').value.trim();

            if (!email || !password) {
                showAlert('Por favor, ingresa tu correo y contraseña.', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ correo: email, contrasena: password })
                });

                const data = await response.json();

                if (data.success) {
                    showAlert('✅ ¡Bienvenido ' + data.usuario.nombre_completo + '!', 'success');
                    localStorage.setItem('usuario', JSON.stringify(data.usuario));
                    setTimeout(() => {
                        window.location.href = redirigirPorRol(data.usuario.rol);
                    }, 1500);
                } else {
                    showAlert('❌ ' + data.error, 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                showAlert('❌ Error de conexión con el servidor.', 'danger');
            }
        });
    }

    // ============ REGISTRO (Página independiente register.html) ============
    const registerPageForm = document.getElementById('registerPageForm');
    if (registerPageForm) {
        registerPageForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nombre_completo = document.getElementById('registerNombre').value.trim();
            const correo = document.getElementById('registerCorreo').value.trim();
            const telefono = document.getElementById('registerTelefono').value.trim();
            const doc_identidad = document.getElementById('registerDocIdentidad').value.trim();
            const fecha_nacimiento = document.getElementById('registerFechaNacimiento').value;
            const contrasena = document.getElementById('registerContrasena').value;
            const contrasena_confirm = document.getElementById('registerContrasenaConfirm').value;

            if (!nombre_completo || !correo || !contrasena) {
                showAlert('Por favor, completa todos los campos obligatorios.', 'warning');
                return;
            }

            if (contrasena.length < 6) {
                showAlert('La contraseña debe tener al menos 6 caracteres.', 'warning');
                return;
            }

            if (contrasena !== contrasena_confirm) {
                showAlert('Las contraseñas no coinciden.', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/auth/registrar-cliente', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nombre_completo,
                        correo,
                        contrasena_hash: contrasena,
                        telefono: telefono || null,
                        doc_identidad: doc_identidad || null,
                        fecha_nacimiento: fecha_nacimiento || null
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showAlert('✅ ¡Cuenta creada con éxito! Redirigiendo...', 'success');
                    registerPageForm.reset();
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                } else {
                    showAlert('❌ ' + data.error, 'danger');
                }
            } catch (error) {
                console.error('Error:', error);
                showAlert('❌ Error de conexión con el servidor.', 'danger');
            }
        });

        // Validación de contraseña en tiempo real
        const passInput = document.getElementById('registerContrasena');
        const reqLength = document.getElementById('reqLength');
        if (passInput && reqLength) {
            passInput.addEventListener('input', function() {
                if (this.value.length >= 6) {
                    reqLength.className = 'valid';
                    reqLength.textContent = '✓ Mínimo 6 caracteres';
                } else {
                    reqLength.className = 'invalid';
                    reqLength.textContent = '✗ Mínimo 6 caracteres';
                }
            });
        }
    }

    // ============ FUNCIÓN PARA MOSTRAR ALERTAS ============
    function showAlert(message, type) {
        let container = document.getElementById('alertContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'alertContainer';
            container.className = 'alert-container';
            document.body.appendChild(container);
        }

        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        container.appendChild(alert);

        setTimeout(() => {
            if (alert.parentNode) alert.remove();
        }, 5000);
    }

    // ============ VERIFICAR SESIÓN ============
    function checkSession() {
        const usuario = localStorage.getItem('usuario');
        const cuentaBtn = document.getElementById('cuentaBtn');
        if (usuario && cuentaBtn) {
            try {
                const user = JSON.parse(usuario);
                cuentaBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    ${user.nombre_completo.split(' ')[0]}
                `;
                cuentaBtn.removeAttribute('data-bs-target');
                cuentaBtn.removeAttribute('data-bs-toggle');
                cuentaBtn.onclick = function(e) {
                    e.preventDefault();
                    if (confirm('¿Cerrar sesión?')) {
                        localStorage.removeItem('usuario');
                        window.location.href = 'index.html';
                    }
                };
            } catch (e) {
                console.error('Error al parsear usuario:', e);
            }
        }
    }

    checkSession();
});