// Arranca backend y frontend juntos sin dependencias externas.
// Uso: npm run dev   (desde la raíz del proyecto)
const { spawn } = require('child_process');
const path = require('path');

const raiz = path.join(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const procesos = [
  { nombre: 'backend ', color: '\x1b[36m', args: ['--prefix', 'backend', 'run', 'dev'] },
  { nombre: 'frontend', color: '\x1b[35m', args: ['--prefix', 'frontend', 'run', 'dev'] }
];

const hijos = procesos.map(({ nombre, color, args }) => {
  const hijo = spawn(npm, args, { cwd: raiz, shell: process.platform === 'win32' });

  const escribir = (flujo, datos) => {
    String(datos)
      .split(/\r?\n/)
      .filter((linea) => linea.trim())
      .forEach((linea) => flujo.write(`${color}[${nombre}]\x1b[0m ${linea}\n`));
  };

  hijo.stdout.on('data', (d) => escribir(process.stdout, d));
  hijo.stderr.on('data', (d) => escribir(process.stderr, d));
  hijo.on('exit', (codigo) => {
    escribir(process.stdout, `terminó con código ${codigo}`);
  });

  return hijo;
});

const detener = () => {
  hijos.forEach((hijo) => {
    if (!hijo.killed) hijo.kill();
  });
  process.exit(0);
};

process.on('SIGINT', detener);
process.on('SIGTERM', detener);

console.log('\x1b[32mMinimercado\x1b[0m');
console.log('  Backend : http://localhost:3000');
console.log('  Tienda  : http://localhost:5173');
console.log('  (Ctrl+C detiene ambos procesos)\n');
