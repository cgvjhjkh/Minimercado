require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'minimercado',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = null;

// Devuelve el pool actual (null si la BD no está disponible -> modo demo)
function getPool() {
    return pool;
}

async function initDB() {
    try {
        pool = await mysql.createPool(dbConfig);
        // createPool no abre conexión; esto fuerza la verificación real
        const conn = await pool.getConnection();
        conn.release();
        console.log('✅ Conectado a MySQL');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS ubicacion_repartidor (
                id_ubicacion INT AUTO_INCREMENT PRIMARY KEY,
                id_repartidor INT NOT NULL,
                latitud DECIMAL(10,7) NOT NULL,
                longitud DECIMAL(10,7) NOT NULL,
                precision_gps INT DEFAULT 0,
                velocidad DECIMAL(5,2) DEFAULT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_repartidor (id_repartidor)
            )
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS ruta_historica (
                id_ruta INT AUTO_INCREMENT PRIMARY KEY,
                id_pedido INT NOT NULL,
                id_repartidor INT NOT NULL,
                punto_orden INT NOT NULL,
                latitud DECIMAL(10,7) NOT NULL,
                longitud DECIMAL(10,7) NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Tablas listas');
        return true;
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error.message);
        console.log('⚠️ El servidor seguirá funcionando en modo demo sin base de datos');
        if (pool) { try { await pool.end(); } catch (_) {} }
        pool = null;
        return false;
    }
}

module.exports = { initDB, getPool, dbConfig };
