const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ZipArchive } = require('archiver');
const rateLimit = require('express-rate-limit');
const { convertirArchivo, convertirMultiples } = require('./convert');

const app = express();
const PORT = 8012;
const MAX_TOTAL_MB = 500;
const ES_PROD = process.env.NODE_ENV === 'production';

function mensajeError(err) {
  if (ES_PROD) return 'Error interno al procesar la imagen';
  return err.message;
}

const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
const publicDir = path.join(__dirname, 'public');

for (const dir of [uploadsDir, outputsDir, publicDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Formato no soportado'), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/convertir', apiLimiter);
app.use(express.static(publicDir));
app.use('/outputs', express.static(outputsDir));

function limpiarOutputs() {
  if (!fs.existsSync(outputsDir)) return;
  for (const f of fs.readdirSync(outputsDir)) {
    fs.unlink(path.join(outputsDir, f), () => {});
  }
}

app.post('/convertir', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se subio ninguna imagen' });
    limpiarOutputs();

    const to = (req.query.to || 'webp').toLowerCase();
    if (!['webp', 'png', 'svg'].includes(to)) {
      return res.status(400).json({ error: 'Formato de destino invalido. Use webp, png o svg.' });
    }

    const resultado = await convertirArchivo(req.file.path, outputsDir, { to });

    fs.unlink(req.file.path, () => {});

    res.json({
      ...resultado,
      descarga: `/outputs/${resultado.nombre}`
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: mensajeError(err) });
  }
});

app.post('/convertir-multiple', upload.array('imagenes', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron imagenes' });
    }

    const totalMB = req.files.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
    if (totalMB > MAX_TOTAL_MB) {
      req.files.forEach(f => fs.unlink(f.path, () => {}));
      return res.status(413).json({
        error: `El tamaño total de ${totalMB.toFixed(1)} MB excede el limite de ${MAX_TOTAL_MB} MB`
      });
    }

    limpiarOutputs();

    const to = (req.query.to || 'webp').toLowerCase();
    if (!['webp', 'png', 'svg'].includes(to)) {
      return res.status(400).json({ error: 'Formato de destino invalido. Use webp, png o svg.' });
    }
    const toProcess = req.files.map(f => ({ file: f, to }));

    const rawResults = await convertirMultiples(toProcess, async ({ file, to }) => {
      const r = await convertirArchivo(file.path, outputsDir, { to });
      fs.unlink(file.path, () => {});
      return {
        archivo: file.originalname,
        ...r,
        descarga: `/outputs/${r.nombre}`
      };
    }, 4);

    const resultados = rawResults.map(r =>
      r instanceof Error
        ? { archivo: 'desconocido', error: r.message }
        : r
    );

    res.json({ resultados });
  } catch (err) {
    if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
    res.status(500).json({ error: mensajeError(err) });
  }
});

app.get('/descargar-todo', (req, res) => {
  const files = fs.readdirSync(outputsDir).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.webp', '.png', '.svg'].includes(ext);
  });

  if (files.length === 0) {
    return res.status(404).json({ error: 'No hay archivos convertidos' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=imagenes-convertidas.zip');

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', err => { throw err; });
  archive.pipe(res);

  for (const file of files) {
    archive.file(path.join(outputsDir, file), { name: file });
  }

  archive.finalize();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Conversor de Imagenes corriendo en:`);
  console.log(`  http://127.0.0.1:${PORT}\n`);
});
