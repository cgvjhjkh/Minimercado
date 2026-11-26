import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE, actualizarPerfil } from '../../lib/api';
import { getToken, getUser } from '../../lib/auth-token';
import './PerfilMenu.css';

// Convierte la ruta relativa guardada en BD a una URL usable por el navegador.
const urlFoto = (foto) => {
  if (!foto) return '';
  if (foto.startsWith('http')) return foto;
  return `${API_BASE}${foto}`;
};

const inicialDe = (usuario) =>
  (usuario?.nombre_completo || '?').trim().charAt(0).toUpperCase();

export default function PerfilMenu() {
  const [usuario, setUsuario] = useState(getUser);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({
    nombre_completo: '',
    telefono: '',
    doc_identidad: '',
    fecha_nacimiento: '',
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [sinTrigger, setSinTrigger] = useState(false);
  const fileRef = useRef(null);

  // El .user-pill que ya existe en cada topbar abre el menú.
  useEffect(() => {
    const triggers = document.querySelectorAll(
      '.user-pill, .app-topbar .avatar-sm'
    );

    // Si la pantalla no tiene topbar propio (p. ej. Empleado), mostramos
    // un botón flotante para que el perfil siga siendo accesible.
    if (!triggers.length) {
      setSinTrigger(true);
      return undefined;
    }

    const onClick = (event) => {
      event.preventDefault();
      setMenuAbierto((abierto) => !abierto);
    };

    triggers.forEach((trigger) => trigger.addEventListener('click', onClick));
    return () =>
      triggers.forEach((trigger) => trigger.removeEventListener('click', onClick));
  }, []);

  // Cierra el menú al hacer clic fuera.
  useEffect(() => {
    if (!menuAbierto) return undefined;

    const onDocumentClick = (event) => {
      if (event.target.closest('.perfil-dropdown')) return;
      if (event.target.closest('.user-pill')) return;
      if (event.target.closest('.app-topbar .avatar-sm')) return;
      if (event.target.closest('.perfil-trigger-flotante')) return;
      setMenuAbierto(false);
    };

    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [menuAbierto]);

  // Refresca el usuario desde el backend (incluye foto_perfil).
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.usuario) setUsuario(data.usuario);
      })
      .catch(() => {
        // Sin conexión se mantiene el usuario guardado en localStorage.
      });
  }, []);

  // Escucha actualizaciones hechas desde cualquier parte de la app.
  useEffect(() => {
    const onActualizado = (event) => setUsuario(event.detail);
    window.addEventListener('perfil:actualizado', onActualizado);
    return () => window.removeEventListener('perfil:actualizado', onActualizado);
  }, []);

  // Sincroniza el avatar y el nombre de los topbars.
  useEffect(() => {
    const foto = urlFoto(usuario?.foto_perfil);

    document
      .querySelectorAll('#topbarAvatar, #topbarAvatarR, .user-pill .avatar')
      .forEach((elemento) => {
        if (foto) {
          elemento.style.backgroundImage = `url("${foto}")`;
          elemento.style.backgroundSize = 'cover';
          elemento.style.backgroundPosition = 'center';
          elemento.textContent = '';
        } else {
          elemento.style.backgroundImage = '';
          elemento.textContent = inicialDe(usuario);
        }
      });

    document.querySelectorAll('#topbarUserName').forEach((elemento) => {
      elemento.textContent =
        (usuario?.nombre_completo || '').trim().split(' ')[0] || 'Usuario';
    });
  }, [usuario]);

  // Libera el object URL de la vista previa.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const abrirModal = () => {
    setForm({
      nombre_completo: usuario?.nombre_completo || '',
      telefono: usuario?.telefono || '',
      doc_identidad: usuario?.doc_identidad || '',
      fecha_nacimiento: (usuario?.fecha_nacimiento || '').slice(0, 10),
    });
    setFile(null);
    setPreview('');
    setError('');
    setMenuAbierto(false);
    setModalAbierto(true);
  };

  const onFile = (event) => {
    const seleccionado = event.target.files?.[0];
    if (!seleccionado) return;

    if (seleccionado.size > 2 * 1024 * 1024) {
      setError('La imagen no debe superar 2 MB.');
      return;
    }

    setError('');
    setFile(seleccionado);
    setPreview(URL.createObjectURL(seleccionado));
  };

  const guardar = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError('');

    try {
      const datos = new FormData();
      Object.entries(form).forEach(([campo, valor]) => {
        datos.append(campo, valor || '');
      });
      if (file) datos.append('foto', file);

      const data = await actualizarPerfil(datos);
      setUsuario(data.usuario);
      window.usuarioActual = data.usuario;
      setModalAbierto(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/';
  };

  const foto = urlFoto(usuario?.foto_perfil);

  return createPortal(
    <>
      {sinTrigger && (
        <button
          type="button"
          className="perfil-trigger-flotante"
          title="Mi perfil"
          aria-label="Abrir menú de perfil"
          onClick={() => setMenuAbierto((abierto) => !abierto)}
          style={foto ? { backgroundImage: `url("${foto}")` } : undefined}
        >
          {!foto && inicialDe(usuario)}
        </button>
      )}

      {menuAbierto && (
        <div className="perfil-dropdown" onMouseLeave={() => setMenuAbierto(false)}>
          <div className="perfil-dropdown-head">
            <div
              className="perfil-avatar"
              style={foto ? { backgroundImage: `url("${foto}")` } : undefined}
            >
              {!foto && inicialDe(usuario)}
            </div>
            <div className="perfil-dropdown-datos">
              <strong>{usuario?.nombre_completo || 'Usuario'}</strong>
              <small>{usuario?.correo}</small>
            </div>
          </div>

          <button type="button" className="perfil-item" onClick={abrirModal}>
            <i className="bi bi-person-gear" /> Ver / editar mi perfil
          </button>

          <button type="button" className="perfil-item text-danger" onClick={cerrarSesion}>
            <i className="bi bi-box-arrow-right" /> Cerrar sesión
          </button>
        </div>
      )}

      {modalAbierto && (
        <div
          className="perfil-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModalAbierto(false);
          }}
        >
          <div className="perfil-modal">
            <div className="perfil-modal-head">
              <h5>Mi perfil</h5>
              <button type="button" onClick={() => setModalAbierto(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={guardar}>
              <div className="perfil-foto-row">
                <div
                  className="perfil-avatar perfil-avatar-lg"
                  style={
                    preview || foto
                      ? { backgroundImage: `url("${preview || foto}")` }
                      : undefined
                  }
                >
                  {!(preview || foto) && inicialDe(usuario)}
                </div>

                <div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Cambiar foto
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={onFile}
                  />
                  <div className="perfil-ayuda">JPG, PNG o WEBP · máx. 2 MB</div>
                </div>
              </div>

              <label className="form-label">Nombre completo</label>
              <input
                className="form-control mb-2"
                value={form.nombre_completo}
                onChange={(event) =>
                  setForm({ ...form, nombre_completo: event.target.value })
                }
                required
              />

              <label className="form-label">Correo</label>
              <input className="form-control mb-2" value={usuario?.correo || ''} disabled />

              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label">Teléfono</label>
                  <input
                    className="form-control"
                    value={form.telefono}
                    onChange={(event) =>
                      setForm({ ...form, telefono: event.target.value })
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">Documento</label>
                  <input
                    className="form-control"
                    value={form.doc_identidad}
                    onChange={(event) =>
                      setForm({ ...form, doc_identidad: event.target.value })
                    }
                  />
                </div>
              </div>

              <label className="form-label mt-2">Fecha de nacimiento</label>
              <input
                type="date"
                className="form-control mb-2"
                value={form.fecha_nacimiento}
                onChange={(event) =>
                  setForm({ ...form, fecha_nacimiento: event.target.value })
                }
              />

              {error && <div className="alert alert-danger py-2 mb-2">{error}</div>}

              <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => setModalAbierto(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
