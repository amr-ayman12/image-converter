(() => {
  'use strict';

  const CDN_MODULES = [
    'https://esm.sh/@imagemagick/magick-wasm@0.0.43?bundle',
    'https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.43/dist/index.js'
  ];
  const WASM_URLS = [
    'https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.43/dist/x86/magick.wasm',
    'https://unpkg.com/@imagemagick/magick-wasm@0.0.43/dist/x86/magick.wasm'
  ];

  const FALLBACK_FORMATS = [
    { format: 'PNG', description: 'Portable Network Graphics', mimeType: 'image/png', supportsWriting: true },
    { format: 'JPEG', description: 'Joint Photographic Experts Group', mimeType: 'image/jpeg', supportsWriting: true },
    { format: 'WEBP', description: 'WebP Image Format', mimeType: 'image/webp', supportsWriting: true },
    { format: 'BMP', description: 'Windows Bitmap', mimeType: 'image/bmp', supportsWriting: true },
    { format: 'ICO', description: 'Microsoft icon', mimeType: 'image/x-icon', supportsWriting: true }
  ];

  const state = {
    files: [],
    outputs: [],
    engine: 'loading',
    magick: null,
    supportedFormats: FALLBACK_FORMATS,
    busy: false,
    cancelRequested: false
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    engineBadge: $('engineBadge'), formatCount: $('formatCount'), themeBtn: $('themeBtn'),
    dropZone: $('dropZone'), fileInput: $('fileInput'), browseBtn: $('browseBtn'), addMoreBtn: $('addMoreBtn'),
    queueSection: $('queueSection'), fileCount: $('fileCount'), fileList: $('fileList'), clearBtn: $('clearBtn'),
    formatSelect: $('formatSelect'), formatHint: $('formatHint'), qualityRange: $('qualityRange'), qualityValue: $('qualityValue'),
    resizeMode: $('resizeMode'), resizeExtra: $('resizeExtra'), resizeValue: $('resizeValue'), resizeUnit: $('resizeUnit'),
    backgroundColor: $('backgroundColor'), backgroundHex: $('backgroundHex'), totalSize: $('totalSize'),
    convertBtn: $('convertBtn'), downloadZipBtn: $('downloadZipBtn'), progressText: $('progressText'),
    progressPercent: $('progressPercent'), progressBar: $('progressBar'), toast: $('toast')
  };

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** i)).toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function getExt(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(idx + 1).toLowerCase() : 'unknown';
  }

  function baseName(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
  }

  function extForFormat(format) {
    const map = { JPEG: 'jpg', JPG: 'jpg', TIFF: 'tiff', HEIC: 'heic', HEIF: 'heif', PNG: 'png', WEBP: 'webp', AVIF: 'avif', BMP: 'bmp', GIF: 'gif', ICO: 'ico', JP2: 'jp2', JXL: 'jxl', TGA: 'tga', PNM: 'pnm', PPM: 'ppm', PGM: 'pgm', PBM: 'pbm', EXR: 'exr', HDR: 'hdr' };
    return map[String(format).toUpperCase()] || String(format).toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  }

  function mimeForFormat(format) {
    const f = String(format).toUpperCase();
    const known = { PNG:'image/png', JPEG:'image/jpeg', JPG:'image/jpeg', WEBP:'image/webp', AVIF:'image/avif', GIF:'image/gif', BMP:'image/bmp', ICO:'image/x-icon', TIFF:'image/tiff', HEIC:'image/heic', HEIF:'image/heif', JXL:'image/jxl', JP2:'image/jp2' };
    const item = state.supportedFormats.find(x => String(x.format).toUpperCase() === f);
    return item?.mimeType || known[f] || 'application/octet-stream';
  }

  let toastTimer;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
  }

  function updateEngineBadge(mode, detail = '') {
    els.engineBadge.className = `engine-badge ${mode}`;
    const text = mode === 'ready' ? `ImageMagick WASM جاهز${detail ? ` — ${detail}` : ''}` : mode === 'fallback' ? 'الوضع الأساسي — PNG/JPG/WEBP/BMP/ICO' : 'جاري تجهيز محرك التحويل…';
    els.engineBadge.querySelector('span:last-child').textContent = text;
  }

  function populateFormats(formats) {
    const bannedOutput = new Set(['NULL','INFO','IDENTIFY','CLIPBOARD','SCREENSHOT','INLINE','HISTOGRAM','LABEL','CAPTION','TEXT','TXT','URL','FTP','HTTP','HTTPS','EPDF','PS','PS2','PS3','EPS','EPS2','EPS3','XPS','MSL','MVG','SVG','MSVG','FRACTAL','GRADIENT','PLASMA','XC','CANVAS','PATTERN','TILE','FAN','RADIAL-GRADIENT']);
    const uniq = new Map();
    formats.forEach(info => {
      const key = String(info.format || '').toUpperCase();
      if (!key || !info.supportsWriting || bannedOutput.has(key)) return;
      if (!uniq.has(key)) uniq.set(key, info);
    });
    FALLBACK_FORMATS.forEach(info => { if (!uniq.has(info.format)) uniq.set(info.format, info); });
    const preferred = ['PNG','JPEG','WEBP','AVIF','HEIC','HEIF','TIFF','GIF','BMP','ICO','JXL','JP2','TGA','EXR','HDR','PPM','PGM','PBM','PNM'];
    const sorted = [...uniq.values()].sort((a,b) => {
      const ai = preferred.indexOf(String(a.format).toUpperCase());
      const bi = preferred.indexOf(String(b.format).toUpperCase());
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return String(a.format).localeCompare(String(b.format));
    });
    state.supportedFormats = sorted;
    const current = els.formatSelect.value || 'PNG';
    els.formatSelect.innerHTML = sorted.map(info => {
      const f = String(info.format).toUpperCase();
      const label = f === 'JPEG' ? 'JPG / JPEG' : f;
      const desc = info.description ? ` — ${info.description}` : '';
      return `<option value="${escapeHtml(f)}">${escapeHtml(label + desc)}</option>`;
    }).join('');
    if ([...els.formatSelect.options].some(o => o.value === current)) els.formatSelect.value = current;
    else if ([...els.formatSelect.options].some(o => o.value === 'PNG')) els.formatSelect.value = 'PNG';
    els.formatCount.textContent = sorted.length;
    els.formatHint.textContent = state.engine === 'ready' ? 'القائمة مستخرجة من محرك ImageMagick المتاح داخل المتصفح.' : 'الوضع الأساسي يعمل بدون محرك ImageMagick الكامل.';
  }

  async function importFirstWorking(urls) {
    let lastErr;
    for (const url of urls) {
      try { return await import(url); } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Unable to load module');
  }

  async function fetchFirstWorking(urls) {
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Unable to load WASM');
  }

  async function initEngine() {
    populateFormats(FALLBACK_FORMATS);
    if (new URLSearchParams(location.search).get('fallback') === '1') {
      state.engine = 'fallback'; updateEngineBadge('fallback'); return;
    }
    try {
      const mod = await importFirstWorking(CDN_MODULES);
      const wasmBytes = await fetchFirstWorking(WASM_URLS);
      await mod.initializeImageMagick(wasmBytes);
      state.magick = mod;
      state.engine = 'ready';
      const formats = mod.Magick?.supportedFormats || FALLBACK_FORMATS;
      populateFormats(formats);
      updateEngineBadge('ready', mod.Magick?.imageMagickVersion || '');
    } catch (err) {
      console.warn('Full ImageMagick engine unavailable, using fallback.', err);
      state.engine = 'fallback';
      populateFormats(FALLBACK_FORMATS);
      updateEngineBadge('fallback');
    }
  }

  function previewUrl(file) {
    return URL.createObjectURL(file);
  }

  function addFiles(fileList) {
    const incoming = [...fileList].filter(file => file.size > 0);
    if (!incoming.length) return;
    const existing = new Set(state.files.map(x => `${x.file.name}:${x.file.size}:${x.file.lastModified}`));
    let added = 0;
    incoming.forEach(file => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(key)) return;
      state.files.push({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, file, url: previewUrl(file), status: 'ready', error: '' });
      existing.add(key); added++;
    });
    if (added) {
      resetOutputs(); renderQueue(); toast(`تمت إضافة ${added} ملف`);
    }
  }

  function removeFile(id) {
    if (state.busy) return;
    const idx = state.files.findIndex(x => x.id === id);
    if (idx >= 0) { URL.revokeObjectURL(state.files[idx].url); state.files.splice(idx, 1); }
    resetOutputs(); renderQueue();
  }

  function clearAll() {
    if (state.busy) { state.cancelRequested = true; toast('سيتم إيقاف التحويل بعد الملف الحالي'); return; }
    state.files.forEach(x => URL.revokeObjectURL(x.url));
    state.files = []; resetOutputs(); renderQueue();
  }

  function resetOutputs() {
    state.outputs = [];
    els.downloadZipBtn.classList.add('hidden');
    setProgress(0, state.files.length ? 'جاهز للتحويل' : '');
    state.files.forEach(x => { x.status = 'ready'; x.error = ''; });
  }

  function renderQueue() {
    els.queueSection.classList.toggle('hidden', state.files.length === 0);
    els.fileCount.textContent = state.files.length;
    els.totalSize.textContent = formatBytes(state.files.reduce((a,x) => a + x.file.size, 0));
    els.fileList.innerHTML = state.files.map(item => {
      const statusText = item.status === 'processing' ? 'جاري التحويل' : item.status === 'done' ? 'تم' : item.status === 'error' ? `خطأ${item.error ? `: ${item.error}` : ''}` : 'جاهز';
      return `<tr data-id="${item.id}">
        <td><div class="file-cell"><img class="thumb" src="${item.url}" alt=""><div class="file-meta"><strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong><span>.${escapeHtml(getExt(item.file.name))}</span></div></div></td>
        <td>${formatBytes(item.file.size)}</td>
        <td><span class="status ${item.status}">${escapeHtml(statusText)}</span></td>
        <td><button class="remove-row" data-remove="${item.id}" title="حذف" ${state.busy ? 'disabled' : ''}>×</button></td>
      </tr>`;
    }).join('');
    els.convertBtn.disabled = !state.files.length || state.busy;
    els.convertBtn.textContent = state.busy ? 'جاري التحويل…' : 'تحويل الكل';
  }

  function updateRow(item) {
    const row = els.fileList.querySelector(`tr[data-id="${CSS.escape(item.id)}"]`);
    if (!row) return renderQueue();
    const status = row.querySelector('.status');
    status.className = `status ${item.status}`;
    status.textContent = item.status === 'processing' ? 'جاري التحويل' : item.status === 'done' ? 'تم' : item.status === 'error' ? `خطأ: ${item.error || 'غير معروف'}` : 'جاهز';
  }

  function setProgress(value, text) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    els.progressPercent.textContent = `${pct}%`;
    els.progressBar.style.width = `${pct}%`;
    if (text !== undefined) els.progressText.textContent = text;
  }

  async function fileToImageBitmap(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {}
    }
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('المتصفح لا يستطيع قراءة هذه الصيغة بدون WASM')); };
      img.src = url;
    });
  }

  function targetDimensions(width, height) {
    const mode = els.resizeMode.value;
    const value = Math.max(1, Number(els.resizeValue.value) || 1);
    if (mode === 'percentage') {
      const scale = value / 100; return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
    }
    if (mode === 'max' && Math.max(width, height) > value) {
      const scale = value / Math.max(width, height); return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
    }
    return [width, height];
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`المتصفح لا يدعم إخراج ${type}`)), type, quality));
  }

  function writeU16(arr, off, val) { arr[off]=val&255; arr[off+1]=(val>>>8)&255; }
  function writeU32(arr, off, val) { arr[off]=val&255; arr[off+1]=(val>>>8)&255; arr[off+2]=(val>>>16)&255; arr[off+3]=(val>>>24)&255; }

  function encodeBmp(ctx, width, height) {
    const pixels = ctx.getImageData(0,0,width,height).data;
    const row = Math.ceil((width*3)/4)*4, size = 54 + row*height;
    const out = new Uint8Array(size); out[0]=0x42; out[1]=0x4D; writeU32(out,2,size); writeU32(out,10,54); writeU32(out,14,40); writeU32(out,18,width); writeU32(out,22,height); writeU16(out,26,1); writeU16(out,28,24); writeU32(out,34,row*height);
    let p=54;
    for(let y=height-1;y>=0;y--){ for(let x=0;x<width;x++){ const i=(y*width+x)*4; out[p++]=pixels[i+2]; out[p++]=pixels[i+1]; out[p++]=pixels[i]; } while((p-54)%row) out[p++]=0; }
    return new Blob([out],{type:'image/bmp'});
  }

  async function encodeIcoFromCanvas(canvas) {
    const png = new Uint8Array(await (await canvasToBlob(canvas,'image/png')).arrayBuffer());
    const out = new Uint8Array(22 + png.length);
    writeU16(out,0,0); writeU16(out,2,1); writeU16(out,4,1);
    out[6]=canvas.width>=256?0:canvas.width; out[7]=canvas.height>=256?0:canvas.height; out[8]=0; out[9]=0; writeU16(out,10,1); writeU16(out,12,32); writeU32(out,14,png.length); writeU32(out,18,22); out.set(png,22);
    return new Blob([out],{type:'image/x-icon'});
  }

  async function convertFallback(file, format) {
    const img = await fileToImageBitmap(file);
    const width = img.width || img.naturalWidth, height = img.height || img.naturalHeight;
    let [tw, th] = targetDimensions(width, height);
    if (format === 'ICO' && Math.max(tw, th) > 256) { const scale = 256 / Math.max(tw, th); tw = Math.max(1, Math.round(tw * scale)); th = Math.max(1, Math.round(th * scale)); }
    const canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas غير متاح');
    if (['JPEG','JPG','BMP'].includes(format)) { ctx.fillStyle = els.backgroundColor.value; ctx.fillRect(0,0,tw,th); }
    ctx.drawImage(img,0,0,tw,th); if (img.close) img.close();
    const q = Number(els.qualityRange.value)/100;
    if (format === 'PNG') return canvasToBlob(canvas,'image/png');
    if (format === 'JPEG' || format === 'JPG') return canvasToBlob(canvas,'image/jpeg',q);
    if (format === 'WEBP') return canvasToBlob(canvas,'image/webp',q);
    if (format === 'BMP') return encodeBmp(ctx,tw,th);
    if (format === 'ICO') return encodeIcoFromCanvas(canvas);
    throw new Error(`صيغة ${format} تحتاج محرك ImageMagick الكامل`);
  }

  async function convertWithMagick(file, format) {
    const mod = state.magick;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let output;
    await mod.ImageMagick.read(bytes, async image => {
      const [tw, th] = targetDimensions(image.width, image.height);
      if (tw !== image.width || th !== image.height) image.resize(tw, th);
      const q = Number(els.qualityRange.value);
      if ('quality' in image) image.quality = q;
      const noAlpha = new Set(['JPEG','JPG','BMP','JPE','JFIF']);
      if (noAlpha.has(format) && image.hasAlpha) {
        try {
          const bg = new mod.MagickColor(els.backgroundColor.value);
          image.backgroundColor = bg;
          if (typeof image.alpha === 'function' && mod.AlphaAction?.Remove !== undefined) image.alpha(mod.AlphaAction.Remove);
        } catch (_) {}
      }
      await image.write(format, data => { output = new Blob([data], { type: mimeForFormat(format) }); });
    });
    if (!output) throw new Error('لم ينتج المحرك ملفًا');
    return output;
  }

  async function convertOne(file, format) {
    if (state.engine === 'ready' && state.magick) {
      try { return await convertWithMagick(file, format); }
      catch (err) {
        if (['PNG','JPEG','JPG','WEBP','BMP','ICO'].includes(format)) return convertFallback(file, format);
        throw err;
      }
    }
    return convertFallback(file, format);
  }

  async function convertAll() {
    if (!state.files.length || state.busy) return;
    state.busy = true; state.cancelRequested = false; state.outputs = [];
    els.downloadZipBtn.classList.add('hidden');
    const format = els.formatSelect.value.toUpperCase();
    state.files.forEach(x => { x.status='ready'; x.error=''; }); renderQueue();
    let done = 0, succeeded = 0;
    const usedNames = new Map();
    for (const item of state.files) {
      if (state.cancelRequested) break;
      item.status='processing'; updateRow(item); setProgress((done/state.files.length)*100, `جاري تحويل ${done+1} من ${state.files.length}`);
      try {
        const blob = await convertOne(item.file, format);
        const stem = baseName(item.file.name);
        const ext = extForFormat(format);
        const key = `${stem}.${ext}`.toLowerCase();
        const count = usedNames.get(key) || 0; usedNames.set(key, count + 1);
        const fileName = count ? `${stem}-${count + 1}.${ext}` : `${stem}.${ext}`;
        state.outputs.push({ name:fileName, blob }); item.status='done'; succeeded++;
      } catch (err) {
        console.error(err); item.status='error'; item.error = String(err?.message || err).replace(/^.*?:\s*/,'').slice(0,90);
      }
      done++; updateRow(item); setProgress((done/state.files.length)*100, `تمت معالجة ${done} من ${state.files.length}`);
      await new Promise(r => setTimeout(r,0));
    }
    state.busy=false; renderQueue();
    if (state.cancelRequested) toast('تم إيقاف التحويل');
    else if (succeeded) {
      els.downloadZipBtn.classList.remove('hidden');
      els.downloadZipBtn.textContent = succeeded === 1 ? 'تنزيل الملف' : `تنزيل ZIP (${succeeded})`;
      setProgress(100, succeeded === state.files.length ? 'اكتمل التحويل بنجاح' : `تم ${succeeded} — يوجد ${state.files.length-succeeded} أخطاء`);
      toast(`اكتمل تحويل ${succeeded} ملف`);
    } else { setProgress(0,'فشل التحويل'); toast('لم يتم تحويل أي ملف'); }
  }

  async function makeZip(entries) {
    return window.PixelZip.makeZip(entries);
  }

  function downloadBlob(blob,name){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); }

  async function downloadResults() {
    if (!state.outputs.length) return;
    els.downloadZipBtn.disabled=true;
    try {
      if (state.outputs.length===1) downloadBlob(state.outputs[0].blob,state.outputs[0].name);
      else {
        els.downloadZipBtn.textContent='جاري تجهيز ZIP…';
        const zip=await makeZip(state.outputs); downloadBlob(zip,`pixelshift-${new Date().toISOString().slice(0,10)}.zip`);
      }
    } finally { els.downloadZipBtn.disabled=false; els.downloadZipBtn.textContent=state.outputs.length===1?'تنزيل الملف':`تنزيل ZIP (${state.outputs.length})`; }
  }

  function bindEvents() {
    const openPicker=()=>els.fileInput.click();
    els.browseBtn.addEventListener('click', e=>{e.stopPropagation();openPicker();});
    els.addMoreBtn.addEventListener('click',openPicker); els.dropZone.addEventListener('click',openPicker);
    els.dropZone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPicker();}});
    els.fileInput.addEventListener('change',()=>{addFiles(els.fileInput.files);els.fileInput.value='';});
    ['dragenter','dragover'].forEach(evt=>els.dropZone.addEventListener(evt,e=>{e.preventDefault();els.dropZone.classList.add('dragover');}));
    ['dragleave','drop'].forEach(evt=>els.dropZone.addEventListener(evt,e=>{e.preventDefault();els.dropZone.classList.remove('dragover');}));
    els.dropZone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
    els.fileList.addEventListener('click',e=>{const id=e.target.closest('[data-remove]')?.dataset.remove;if(id)removeFile(id);});
    els.clearBtn.addEventListener('click',clearAll); els.convertBtn.addEventListener('click',convertAll); els.downloadZipBtn.addEventListener('click',downloadResults);
    els.qualityRange.addEventListener('input',()=>{els.qualityValue.textContent=`${els.qualityRange.value}%`;resetOutputs();renderQueue();});
    els.formatSelect.addEventListener('change',()=>{resetOutputs();renderQueue();});
    els.resizeMode.addEventListener('change',()=>{const mode=els.resizeMode.value;els.resizeExtra.classList.toggle('hidden',mode==='original');els.resizeUnit.textContent=mode==='percentage'?'%':'px';els.resizeValue.value=mode==='percentage'?'80':'1920';resetOutputs();renderQueue();});
    els.resizeValue.addEventListener('change',()=>{resetOutputs();renderQueue();});
    els.backgroundColor.addEventListener('input',()=>{els.backgroundHex.textContent=els.backgroundColor.value.toUpperCase();resetOutputs();renderQueue();});
    els.themeBtn.addEventListener('click',()=>{const light=document.documentElement.classList.toggle('light');els.themeBtn.textContent=light?'☀':'☾';localStorage.setItem('pixelshift-theme',light?'light':'dark');});
  }

  function restoreTheme(){ if(localStorage.getItem('pixelshift-theme')==='light'){document.documentElement.classList.add('light');els.themeBtn.textContent='☀';} }

  window.__PixelShiftTest = {
    getState: () => ({ engine:state.engine, files:state.files.length, outputs:state.outputs.length, formats:state.supportedFormats.length }),
    addTestFiles: files => addFiles(files),
    convertAll,
    makeZip
  };

  async function runSelfTestIfRequested() {
    if (new URLSearchParams(location.search).get('selftest') !== '1') return;
    await new Promise(r => setTimeout(r, 120));
    try {
      const makeFile = async (name, color) => {
        const c = document.createElement('canvas'); c.width = 24; c.height = 18;
        const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0,0,c.width,c.height);
        const blob = await canvasToBlob(c, 'image/png');
        return new File([blob], name, { type:'image/png' });
      };
      addFiles([await makeFile('test-red.png','#ff3344'), await makeFile('test-blue.png','#3366ff')]);
      els.formatSelect.value = 'BMP';
      await convertAll();
      const zip = await makeZip(state.outputs);
      document.body.dataset.selftest = state.outputs.length === 2 && zip.size > 100 ? 'pass' : 'fail';
      document.body.dataset.selftestOutputs = String(state.outputs.length);
      document.body.dataset.selftestZip = String(zip.size);
    } catch (err) {
      console.error('Self test failed', err);
      document.body.dataset.selftest = 'fail';
      document.body.dataset.selftestError = String(err?.message || err).slice(0,120);
    }
  }

  restoreTheme(); bindEvents(); renderQueue(); initEngine(); runSelfTestIfRequested();
})();
