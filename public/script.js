const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const results = document.getElementById('results');
const dropzoneText = document.getElementById('dropzoneText');
const modeBtns = document.querySelectorAll('.mode-btn');
const apiUrl = window.location.origin;
let currentMode = 'webp';

lucide.createIcons();

const FORMATOS_POR_MODO = {
  webp: ['.jpg', '.jpeg', '.png'],
  png: ['.jpg', '.jpeg', '.webp']
};

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    fileInput.accept = FORMATOS_POR_MODO[currentMode].join(',');
    dropzoneText.textContent = `Arrastra tus imagenes aqui`;
  });
});

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    procesarArchivos(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    procesarArchivos(fileInput.files);
    fileInput.value = '';
  }
});

function procesarArchivos(files) {
  const extPermitidas = FORMATOS_POR_MODO[currentMode];
  const valids = Array.from(files).filter(f => {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    return extPermitidas.includes(ext);
  });

  if (valids.length === 0) {
    mostrarResultados([{ archivo: 'Ningun archivo valido para este modo', error: true }]);
    return;
  }

  results.classList.remove('hidden');
  results.innerHTML = `<div class="summary"><span class="pulse"></span>Convirtiendo ${valids.length} archivo(s)...</div>`;

  const formData = new FormData();
  valids.forEach(f => formData.append('imagenes', f));

  fetch(apiUrl + '/convertir-multiple?to=' + currentMode, {
    method: 'POST',
    body: formData
  })
    .then(r => r.json())
    .then(data => mostrarResultados(data.resultados))
    .catch(err => {
      results.innerHTML = `<div class="result-card"><span class="result-error">Error de conexion: ${err.message}</span></div>`;
    });
}

function mostrarResultados(items) {
  const ok = items.filter(i => !i.error).length;
  let html = `<div class="summary">
    <strong>${ok}</strong> convertidos exitosamente
  </div>
  <div class="result-actions">
    <a class="btn-zip" href="/descargar-todo">
      <i data-lucide="file-archive"></i>
      Descargar todo en ZIP
    </a>
  </div>`;

  items.forEach(item => {
    if (item.error) {
      html += `<div class="result-card">
        <div class="result-info">
          <div class="result-name">${item.archivo}</div>
          <div class="result-error">${item.error === true ? 'Formato no valido' : item.error}</div>
        </div>
      </div>`;
    } else {
      html += `<div class="result-card">
        <div class="result-info">
          <div class="result-name">${item.archivo}</div>
          <div class="result-sizes">
            ${item.originalKB} KB → ${item.finalKB} KB
            <span class="saved">(${item.ahorro}% menos)</span>
          </div>
        </div>
        <a class="btn-download" href="${item.descarga}" download="${item.nombre}">
          <i data-lucide="download" style="width:14px;height:14px;vertical-align:middle"></i>
          Descargar
        </a>
      </div>`;
    }
  });

  results.innerHTML = html;
  lucide.createIcons();
}
