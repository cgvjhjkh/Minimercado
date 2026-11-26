const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

/**
 * Indica si un valor guardado ya es un hash bcrypt.
 * Los registros antiguos del proyecto guardaban la contraseña en texto plano.
 */
function esHashBcrypt(valor) {
    return typeof valor === 'string' && BCRYPT_PATTERN.test(valor);
}

/** Genera un hash bcrypt para una contraseña en texto plano. */
async function hashPassword(contrasena) {
    return bcrypt.hash(String(contrasena), BCRYPT_ROUNDS);
}

/**
 * Compara una contraseña en texto plano contra el valor almacenado.
 * Soporta bcrypt (formato actual) y texto plano (registros legacy).
 */
async function verifyPassword(contrasena, almacenada) {
    if (!almacenada) return false;

    if (esHashBcrypt(almacenada)) {
        return bcrypt.compare(String(contrasena), almacenada);
    }

    // Comparación de tiempo constante para los registros legacy en texto plano.
    const ingresada = Buffer.from(String(contrasena));
    const guardada = Buffer.from(String(almacenada));
    if (ingresada.length !== guardada.length) return false;
    return crypto.timingSafeEqual(ingresada, guardada);
}

module.exports = { hashPassword, verifyPassword, esHashBcrypt };
