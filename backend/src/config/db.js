require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { ensureTrackingSchema } = require('./schema');

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

        // Tablas, índices y columnas del módulo de repartidores/rastreo
        await ensureTrackingSchema(pool);
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
