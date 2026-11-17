const mysql = require('mysql2/promise');

async function init() {
  const c = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'root', database: 'minimercado'
  });

  // Tabla notificaciones - version simplificada
  await c.execute(`CREATE TABLE IF NOT EXISTS notificaciones (
    id_notificacion INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    rol_destino VARCHAR(20) NOT NULL,
    id_usuario_origen INT,
    mensaje TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    leido TINYINT DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_usuario (id_usuario),
    INDEX idx_tipo (tipo),
    INDEX idx_leido (leido)
  )`);

  // Tabla mensajes_chat - version simplificada
  await c.execute(`CREATE TABLE IF NOT EXISTS mensajes_chat (
    id_mensaje INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_emisor INT NOT NULL,
    id_receptor INT NOT NULL,
    contenido TEXT NOT NULL,
    tipo VARCHAR(10) DEFAULT 'texto',
    leido TINYINT DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_emisor (id_emisor),
    INDEX idx_receptor (id_receptor),
    INDEX idx_leido (leido)
  )`);

  // Columnas usuario
  try { await c.execute('ALTER TABLE usuario ADD COLUMN foto_perfil VARCHAR(255) NULL AFTER correo'); } catch(e) {}
  try { await c.execute('ALTER TABLE usuario ADD COLUMN rol VARCHAR(20) NOT NULL DEFAULT "cliente" AFTER estado'); } catch(e) {}

  console.log('✅ Tablas y columnas listas');
  await c.end();
}

init().catch(e => console.error('Error init DB:', e.message));