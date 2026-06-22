const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const FORMATOS_VALIDOS = {
  webp: { entrada: ['.jpg', '.jpeg', '.png'], salida: '.webp', nombrar: 'WebP' },
  png:  { entrada: ['.jpg', '.jpeg', '.webp'], salida: '.png',  nombrar: 'PNG'  }
};

async function convertirArchivo(inputPath, outputDir, options = {}) {
  const to = (options.to || 'webp').toLowerCase();
  const cfg = FORMATOS_VALIDOS[to];
  if (!cfg) throw new Error(`Formato de destino no soportado: ${to}`);

  const ext = path.extname(inputPath).toLowerCase();
  if (!cfg.entrada.includes(ext)) {
    throw new Error(`No se puede convertir ${ext} a ${cfg.nombrar}. Formatos aceptados: ${cfg.entrada.join(', ')}`);
  }

  const baseName = path.basename(inputPath, ext) + cfg.salida;
  const outputPath = path.join(outputDir, baseName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pipeline = sharp(inputPath);

  if (to === 'webp') {
    await pipeline.webp({ quality: 85, effort: 6 }).toFile(outputPath);
  } else {
    await pipeline.png().toFile(outputPath);
  }

  const originalBytes = fs.statSync(inputPath).size;
  const finalBytes = fs.statSync(outputPath).size;
  const ahorro = ((1 - finalBytes / originalBytes) * 100).toFixed(1);

  return {
    nombre: baseName,
    originalKB: (originalBytes / 1024).toFixed(1),
    finalKB: (finalBytes / 1024).toFixed(1),
    ahorro,
    formatoDestino: to
  };
}

async function convertirMultiples(items, fn, concurrency = 4) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...await Promise.all(chunk.map(item => fn(item).catch(e => e))));
  }
  return results;
}

async function convertirDirectorio(inputDir, outputDir, options = {}) {
  const to = (options.to || 'webp').toLowerCase();
  const cfg = FORMATOS_VALIDOS[to];

  const files = fs.readdirSync(inputDir)
    .filter(f => cfg.entrada.includes(path.extname(f).toLowerCase()));

  const resultados = [];
  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    try {
      const result = await convertirArchivo(inputPath, outputDir, { to });
      resultados.push({ archivo: file, ...result });
    } catch (e) {
      resultados.push({ archivo: file, error: e.message });
    }
  }
  return resultados;
}

module.exports = { convertirArchivo, convertirDirectorio, convertirMultiples };
