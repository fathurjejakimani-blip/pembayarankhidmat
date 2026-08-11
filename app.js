/* ==========================================================================
   APLIKASI TANDA TERIMA PEMBAYARAN - PT. JEJAK IMANI BERKAH BERSAMA (app.js)
   ========================================================================== */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz3A7kYSe8LnYmNmVyqGzNAG78oeTj5Uqff41pbK4NKfM2UDUYZnuceYEp0LEKzanFllQ/exec';
const STORAGE_KEY = 'bukti_pembayaran_jejakimani_sheets_live_v2';
const SIGNATURES_KEY = 'bukti_pembayaran_signatures_store';
const MASTER_KEY = 'bukti_pembayaran_master_data_v1';

// Clear old sample data keys from previous versions
['bukti_pembayaran_jejakimani_v16', 'bukti_pembayaran_jejakimani_v17', 'bukti_pembayaran_jejakimani_v18', 'bukti_pembayaran_jejakimani_v19', 'bukti_pembayaran_jejakimani_v20', 'bukti_pembayaran_jejakimani_v21', 'bukti_pembayaran_jejakimani_db_v1'].forEach(k => localStorage.removeItem(k));

// Default initial vouchers matching spreadsheet rows
const DEFAULT_SHEET_VOUCHERS = [
  {
    id: 'OUT0001',
    noReferensi: 'OUT0001',
    tanggal: '2026-08-11',
    diserahkanOleh: 'Fathur Rahman Al Masyi',
    diterimaOleh: 'Abdullah Katering Madinah',
    wilayah: 'Madinah',
    metodePembayaran: 'Cash Riyal',
    rincian: [
      { no: 1, kebutuhanGrup: 'Umroh Ruby Onyx 02 Agustus 2026 Madinah Awal (9 Hari)', keterangan: 'Snack Check Out Hotel Madinah', nominal: 209 },
      { no: 2, kebutuhanGrup: 'Umroh Reguler 02 Agustus 2026 Makkah Awal (9 Hari)', keterangan: 'Snack Check Out Hotel Madinah', nominal: 253 },
      { no: 3, kebutuhanGrup: 'Umroh Private 06 Agustus 2026', keterangan: 'Snack Check Out Hotel Madinah', nominal: 48 }
    ],
    totalNominal: 510,
    terbilang: 'Lima Ratus Sepuluh Saudi Riyal',
    status: 'Menunggu Tanda Tangan',
    tandaTanganUrl: null,
    tanggalDitandatangani: null
  },
  {
    id: 'OUT0002',
    noReferensi: 'OUT0002',
    tanggal: '2026-08-11',
    diserahkanOleh: 'Fathur Rahman Al Masyi',
    diterimaOleh: 'Ahmad Transport Makkah',
    wilayah: 'Makkah',
    metodePembayaran: 'Cash Riyal',
    rincian: [
      { no: 1, kebutuhanGrup: 'Sewa Bus Ziarah Makkah - Madinah', keterangan: 'Operasional Transportasi', nominal: 1200 }
    ],
    totalNominal: 1200,
    terbilang: 'Seribu Dua Ratus Saudi Riyal',
    status: 'Menunggu Tanda Tangan',
    tandaTanganUrl: null,
    tanggalDitandatangani: null
  },
  {
    id: 'OUT0003',
    noReferensi: 'OUT0003',
    tanggal: '2026-08-11',
    diserahkanOleh: 'Fathur Rahman Al Masyi',
    diterimaOleh: 'Syarif Katering Jeddah',
    wilayah: 'Jeddah',
    metodePembayaran: 'Cash Riyal',
    rincian: [
      { no: 1, kebutuhanGrup: 'Katering Kedatangan Bandara Jeddah', keterangan: 'Makan Malam Jamaah', nominal: 850 }
    ],
    totalNominal: 850,
    terbilang: 'Delapan Ratus Lima Puluh Saudi Riyal',
    status: 'Menunggu Tanda Tangan',
    tandaTanganUrl: null,
    tanggalDitandatangani: null
  }
];

// App State
let vouchers = JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_SHEET_VOUCHERS;
let signaturesStore = JSON.parse(localStorage.getItem(SIGNATURES_KEY)) || {};
let masterData = JSON.parse(localStorage.getItem(MASTER_KEY)) || {
  namaList: [],
  kebutuhanList: [],
  keteranganList: []
};

let currentVoucher = null;
let selectedVoucher = null;
let signatureDataUrl = null;
let isDrawing = false;
let isLoadingSheets = false;

// Preloaded Image Data URLs to guarantee 100% html2canvas capture without CORS taint
let bgLetterheadBase64 = '';
let ttdDiserahkanBase64 = '';

// Preload Images to Base64 Data URLs using root-relative paths
function preloadImagesAsBase64() {
  const loadAsBase64 = (url, callback) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        callback(canvas.toDataURL('image/png'));
      } catch (e) {
        callback(url);
      }
    };
    img.onerror = () => callback(url);
    img.src = url;
  };

  loadAsBase64('/bg-letterhead.png', (b64) => { bgLetterheadBase64 = b64; });
  loadAsBase64('/ttd-diserahkan.png', (b64) => { ttdDiserahkanBase64 = b64; });
}

// DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  preloadImagesAsBase64();
  updateDatalists();

  const isRecipientPage = window.location.pathname.endsWith('penerima.html') || window.location.href.includes('penerima.html') || window.location.pathname.includes('/doc/');
  const urlParams = new URLSearchParams(window.location.search);
  
  // Extract ID from query param OR path (/doc/OUT0004)
  let voucherId = urlParams.get('id');
  if (!voucherId && window.location.pathname.includes('/doc/')) {
    const parts = window.location.pathname.split('/doc/');
    if (parts.length > 1) {
      voucherId = parts[1].replace(/\/$/, '');
    }
  }

  setupGlobalEventDelegation();
  setup2FingerPinchZoom();

  if (isRecipientPage) {
    if (voucherId) {
      currentVoucher = vouchers.find(v => v.id === voucherId || v.noReferensi === voucherId);
      if (currentVoucher) {
        renderRecipientView(currentVoucher);
      } else {
        showLoadingRecipientState();
      }
    }
    fetchFromGoogleSheets();
  } else {
    initAdminPortal();
    fetchFromGoogleSheets();
    fetchMasterData();
  }
});

// FETCH MASTER DATA FOR SEARCHBAR AUTOCOMPLETE SUGGESTIONS
async function fetchMasterData() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getMasterData`);
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith('{') && text.endsWith('}')) {
        const data = JSON.parse(text);
        if (data && (Array.isArray(data.namaList) || Array.isArray(data.kebutuhanList) || Array.isArray(data.keteranganList))) {
          masterData = {
            namaList: Array.isArray(data.namaList) ? data.namaList : masterData.namaList,
            kebutuhanList: Array.isArray(data.kebutuhanList) ? data.kebutuhanList : masterData.kebutuhanList,
            keteranganList: Array.isArray(data.keteranganList) ? data.keteranganList : masterData.keteranganList
          };
          localStorage.setItem(MASTER_KEY, JSON.stringify(masterData));
          updateDatalists();
        }
      }
    }
  } catch (e) {
    console.log('Master Data fetch notice:', e);
  }
}

// DYNAMICALLY FILL HTML5 DATALISTS FOR AUTOCOMPLETE
function updateDatalists() {
  fillDatalist('list-nama-penerima', masterData.namaList);
  fillDatalist('list-kebutuhan-grup', masterData.kebutuhanList);
  fillDatalist('list-keterangan', masterData.keteranganList);
}

function fillDatalist(elementId, items) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '';
  
  if (Array.isArray(items)) {
    const uniqueItems = [...new Set(items.filter(x => x && String(x).trim() !== ''))];
    uniqueItems.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item;
      el.appendChild(opt);
    });
  }
}

function showLoadingRecipientState() {
  const container = document.getElementById('pdf-doc-content');
  if (container) {
    container.innerHTML = `
      <div class="text-center" style="padding: 60px 10px; color: #475569;">
        <i class="fa-solid fa-arrows-rotate fa-spin" style="font-size: 32px; color: #0f172a; margin-bottom: 12px;"></i>
        <h3 style="font-family: var(--font-serif); font-size: 16px; font-weight: 700;">Menyinkronkan Data Google Sheets...</h3>
        <p style="font-size: 11px; margin-top: 4px;">Mohon tunggu sebentar, memuat dokumen resmi Jejak Imani.</p>
      </div>
    `;
  }
}

// REAL-TIME DIRECT GOOGLE SHEETS LIVE SYNC WITH SAFE FALLBACK
async function fetchFromGoogleSheets() {
  isLoadingSheets = true;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${SCRIPT_URL}?action=get`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      if (text.startsWith('[') && text.endsWith(']')) {
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          const sheetVouchers = data.map(item => {
            let rincianList = item.rincian;
            if (!Array.isArray(rincianList) || rincianList.length === 0) {
              if (typeof item.rincianPembayaran === 'string' && item.rincianPembayaran.trim()) {
                const lines = item.rincianPembayaran.split('\n').filter(l => l.trim());
                rincianList = lines.map((line, idx) => {
                  return {
                    no: idx + 1,
                    kebutuhanGrup: line.replace(/^\d+\.\s*/, ''),
                    keterangan: 'Rincian Pengeluaran',
                    nominal: idx === 0 ? (parseFloat(item.totalNominal) || 0) : 0
                  };
                });
              } else {
                rincianList = [
                  { no: 1, kebutuhanGrup: item.rincianPembayaran || 'Operasional Saudi', keterangan: 'Rincian Pengeluaran', nominal: parseFloat(item.totalNominal) || 0 }
                ];
              }
            }
            const totalNominal = parseFloat(item.totalNominal) || 0;

            const savedSig = signaturesStore[item.id] || signaturesStore[item.noReferensi];
            const isSignedLocally = savedSig && savedSig.status === 'Sudah Ditandatangani';
            const isSigned = isSignedLocally || item.status === 'Sudah Ditandatangani';

            return {
              id: item.id || item.noReferensi,
              noReferensi: item.noReferensi || item.id,
              tanggal: item.tanggal || new Date().toISOString().split('T')[0],
              diserahkanOleh: item.diserahkanOleh || 'Fathur Rahman Al Masyi',
              diterimaOleh: item.diterimaOleh || 'Penerima',
              wilayah: item.wilayah || 'Madinah',
              metodePembayaran: item.metodePembayaran || 'Cash Riyal',
              rincian: rincianList,
              totalNominal: totalNominal,
              terbilang: item.terbilang || terbilang(totalNominal),
              status: isSigned ? 'Sudah Ditandatangani' : (item.status || 'Menunggu Tanda Tangan'),
              tandaTanganUrl: savedSig ? savedSig.tandaTanganUrl : (item.tandaTanganUrl || null),
              tanggalDitandatangani: savedSig ? savedSig.tanggalDitandatangani : (item.tanggalDitandatangani || null)
            };
          });

          vouchers = mergeVouchers(sheetVouchers, vouchers);
          saveVouchersLocal();
        }
      }
    }
  } catch (err) {
    console.log('Google Sheets Sync Notice:', err);
  } finally {
    isLoadingSheets = false;
    renderVouchersTable(vouchers);
    updateStats();

    const urlParams = new URLSearchParams(window.location.search);
    let voucherId = urlParams.get('id');
    if (!voucherId && window.location.pathname.includes('/doc/')) {
      const parts = window.location.pathname.split('/doc/');
      if (parts.length > 1) {
        voucherId = parts[1].replace(/\/$/, '');
      }
    }

    if (voucherId) {
      const v = vouchers.find(x => x.id === voucherId || x.noReferensi === voucherId);
      if (v) renderRecipientView(v);
    }
  }
}

function mergeVouchers(sheetsList, localList) {
  const map = new Map();
  sheetsList.forEach(v => map.set(v.id, v));
  localList.forEach(v => {
    if (!map.has(v.id)) {
      map.set(v.id, v);
    } else {
      const existing = map.get(v.id);
      if (v.status === 'Sudah Ditandatangani') {
        existing.status = 'Sudah Ditandatangani';
        existing.tandaTanganUrl = v.tandaTanganUrl || existing.tandaTanganUrl;
        existing.tanggalDitandatangani = v.tanggalDitandatangani || existing.tanggalDitandatangani;
      }
    }
  });
  return Array.from(map.values());
}

// GLOBAL EVENT DELEGATION (GUARANTEES 100% RELIABLE BUTTON CLICKS)
function setupGlobalEventDelegation() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('#btn-open-canvas-modal, #btn-close-canvas-modal, #btn-save-canvas-modal, #btn-download-pdf-recipient, #btn-download-pdf-admin');
    if (!target) return;

    if (target.id === 'btn-open-canvas-modal') {
      const modal = document.getElementById('modal-canvas-overlay');
      if (modal) {
        modal.classList.remove('hidden');
        setTimeout(initLargeCanvasPad, 100);
      }
    } else if (target.id === 'btn-close-canvas-modal') {
      const modal = document.getElementById('modal-canvas-overlay');
      if (modal) modal.classList.add('hidden');
    } else if (target.id === 'btn-save-canvas-modal') {
      if (!signatureDataUrl) {
        alert('Mohon goreskan tanda tangan terlebih dahulu pada canvas.');
        return;
      }
      const modal = document.getElementById('modal-canvas-overlay');
      if (modal) modal.classList.add('hidden');

      const sigStatusEl = document.getElementById('sig-preview-status');
      if (sigStatusEl) {
        sigStatusEl.innerHTML = `
          <span style="font-weight: 700; color: #059669; font-size: 11px;"><i class="fa-solid fa-circle-check"></i> Tanda Tangan Tersimpan & Siap Disetujui</span>
        `;
      }
      checkCanSubmit();
    } else if (target.id === 'btn-download-pdf-recipient' || target.id === 'btn-download-pdf-admin') {
      const targetVoucher = currentVoucher || selectedVoucher || vouchers[0];
      if (targetVoucher) {
        downloadPDF(targetVoucher);
      }
    }
  });
}

// 2-FINGER PINCH ZOOM IN / PINCH ZOOM OUT FOR INTERACTIVE DOCUMENT PREVIEW
function setup2FingerPinchZoom() {
  const viewports = document.querySelectorAll('.a4-preview-viewport');
  viewports.forEach(vp => {
    const doc = vp.querySelector('.doc-printable-wrapper');
    if (!doc) return;

    let initialDist = 0;
    let currentScale = 1;
    let initialScale = 1;

    vp.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        initialDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = currentScale;
      }
    }, { passive: true });

    vp.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / initialDist;
        currentScale = Math.min(Math.max(0.5, initialScale * factor), 2.5);
        doc.style.transform = `scale(${currentScale})`;
        doc.style.transformOrigin = 'top center';
      }
    }, { passive: false });

    vp.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialDist = 0;
      }
    });
  });
}

// ==================== 1. ADMIN PORTAL LOGIC ====================
function initAdminPortal() {
  renderVouchersTable(vouchers);
  updateStats();

  const btnFabAdd = document.getElementById('btn-fab-add');
  const modalFormOverlay = document.getElementById('modal-form-overlay');
  const btnCloseForm = document.getElementById('btn-close-form');
  const formVoucher = document.getElementById('voucher-form');
  const btnAddRincian = document.getElementById('btn-add-rincian');
  const searchInput = document.getElementById('search-input');
  const filterSelect = document.getElementById('filter-select');
  const btnRefresh = document.getElementById('btn-refresh-header');

  // Header Refresh Button Logic
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      const icon = btnRefresh.querySelector('i');
      if (icon) icon.classList.add('spinning');

      Promise.all([fetchFromGoogleSheets(), fetchMasterData()]).then(() => {
        setTimeout(() => {
          if (icon) icon.classList.remove('spinning');
        }, 650);
      });
    };
  }

  // Open Form Modal with 100% Clean Blank State
  if (btnFabAdd) {
    btnFabAdd.onclick = () => {
      resetFormToCleanState();
      modalFormOverlay.classList.remove('hidden');
    };
  }

  if (btnCloseForm) btnCloseForm.onclick = () => modalFormOverlay.classList.add('hidden');
  if (btnAddRincian) btnAddRincian.onclick = () => addRincianItem('', '', '');

  const handleFilterChange = () => {
    const query = searchInput.value.toLowerCase();
    const status = filterSelect.value;
    let filtered = vouchers;

    if (status !== 'all') {
      filtered = filtered.filter(v => v.status === status);
    }
    if (query) {
      filtered = filtered.filter(v => 
        v.noReferensi.toLowerCase().includes(query) || 
        v.diterimaOleh.toLowerCase().includes(query)
      );
    }
    renderVouchersTable(filtered);
  };

  if (searchInput) searchInput.oninput = handleFilterChange;
  if (filterSelect) filterSelect.onchange = handleFilterChange;

  if (formVoucher) {
    formVoucher.onsubmit = (e) => {
      e.preventDefault();
      const noReferensi = document.getElementById('noReferensi').value;
      const tanggal = document.getElementById('tanggal').value;
      const wilayah = document.getElementById('wilayah').value;
      const diserahkanOleh = document.getElementById('diserahkanOleh').value;
      const diterimaOleh = document.getElementById('diterimaOleh').value;
      const metodePembayaran = document.getElementById('metodePembayaran').value;

      const rincianItems = [];
      const itemCards = document.querySelectorAll('.rincian-card-item');
      itemCards.forEach((card, idx) => {
        const keb = card.querySelector('.input-kebutuhan').value.trim();
        const ket = card.querySelector('.input-keterangan').value.trim();
        const nom = parseFloat(card.querySelector('.input-nominal').value) || 0;
        if (keb || ket || nom > 0) {
          rincianItems.push({
            no: idx + 1,
            kebutuhanGrup: keb,
            keterangan: ket,
            nominal: nom
          });
        }
      });

      if (rincianItems.length === 0) {
        alert('Mohon isi minimal 1 rincian pembayaran.');
        return;
      }

      const totalNominal = rincianItems.reduce((acc, curr) => acc + curr.nominal, 0);

      const newVoucher = {
        id: noReferensi || `OUT${Math.floor(1000 + Math.random() * 9000)}`,
        noReferensi,
        tanggal,
        diserahkanOleh: diserahkanOleh || 'Fathur Rahman Al Masyi',
        diterimaOleh,
        wilayah,
        metodePembayaran,
        rincian: rincianItems,
        totalNominal,
        terbilang: terbilang(totalNominal),
        status: 'Menunggu Tanda Tangan',
        tandaTanganUrl: null,
        tanggalDitandatangani: null
      };

      vouchers.unshift(newVoucher);
      saveVouchersLocal();
      postToGoogleSheets(newVoucher);

      modalFormOverlay.classList.add('hidden');
      showShareModal(newVoucher);

      renderVouchersTable(vouchers);
      updateStats();
    };
  }

  const closeShareModal = () => {
    document.getElementById('modal-share-overlay').classList.add('hidden');
  };

  const btnCloseShare = document.getElementById('btn-close-share');
  if (btnCloseShare) btnCloseShare.onclick = closeShareModal;

  const btnCloseShareX = document.getElementById('btn-close-share-x');
  if (btnCloseShareX) btnCloseShareX.onclick = closeShareModal;

  document.getElementById('btn-copy-share').onclick = () => {
    const input = document.getElementById('share-link-input');
    navigator.clipboard.writeText(input.value);
    alert('Link penerima berhasil disalin!');
  };

  document.getElementById('btn-close-preview').onclick = () => {
    document.getElementById('modal-preview-overlay').classList.add('hidden');
  };

  document.getElementById('btn-close-actions-modal').onclick = () => {
    document.getElementById('modal-actions-overlay').classList.add('hidden');
  };

  document.getElementById('btn-act-share').onclick = () => {
    if (selectedVoucher) {
      document.getElementById('modal-actions-overlay').classList.add('hidden');
      showShareModal(selectedVoucher);
    }
  };

  document.getElementById('btn-act-preview').onclick = () => {
    if (selectedVoucher) {
      document.getElementById('modal-actions-overlay').classList.add('hidden');
      showPreviewModal(selectedVoucher);
    }
  };

  document.getElementById('btn-act-download').onclick = () => {
    if (selectedVoucher) {
      downloadPDF(selectedVoucher);
    }
  };

  document.getElementById('btn-act-delete').onclick = () => {
    if (selectedVoucher && confirm(`Hapus dokumen ${selectedVoucher.noReferensi}?`)) {
      vouchers = vouchers.filter(v => v.id !== selectedVoucher.id);
      saveVouchersLocal();
      document.getElementById('modal-actions-overlay').classList.add('hidden');
      renderVouchersTable(vouchers);
      updateStats();
    }
  };
}

// RESET FORM POPUP TO 100% CLEAN BLANK STATE WITH NO PRE-FILLED SAMPLES
function resetFormToCleanState() {
  document.getElementById('noReferensi').value = `OUT000${vouchers.length + 1}`;
  document.getElementById('tanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('diterimaOleh').value = '';
  document.getElementById('diserahkanOleh').value = 'Fathur Rahman Al Masyi';

  const rincianList = document.getElementById('rincian-list');
  if (rincianList) {
    rincianList.innerHTML = '';
    addRincianItem('', '', '');
  }
  calculateTotal();
}

function updateStats() {
  document.getElementById('stat-total-count').textContent = vouchers.length;
  document.getElementById('stat-pending-count').textContent = vouchers.filter(v => v.status === 'Menunggu Tanda Tangan').length;
  document.getElementById('stat-signed-count').textContent = vouchers.filter(v => v.status === 'Sudah Ditandatangani').length;
}

function initRincianInputs() {
  resetFormToCleanState();
}

function addRincianItem(kebutuhan = '', keterangan = '', nominal = '') {
  const rincianList = document.getElementById('rincian-list');
  if (!rincianList) return;
  const count = rincianList.children.length + 1;

  const card = document.createElement('div');
  card.className = 'rincian-card-item';
  card.innerHTML = `
    <div class="rincian-item-header">
      <span>Baris #${count}</span>
      <button type="button" class="btn-remove-item"><i class="fa-solid fa-trash"></i></button>
    </div>
    <div class="form-group">
      <input type="text" list="list-kebutuhan-grup" class="form-control input-kebutuhan" value="${kebutuhan}" placeholder="Cari / Ketik Kebutuhan Grup..." autocomplete="off" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <input type="text" list="list-keterangan" class="form-control input-keterangan" value="${keterangan}" placeholder="Cari / Ketik Keterangan..." autocomplete="off" required>
      </div>
      <div class="form-group">
        <input type="number" class="form-control input-nominal font-mono" value="${nominal !== '' ? nominal : ''}" placeholder="Nominal SAR" style="text-align: right;" required>
      </div>
    </div>
  `;

  rincianList.appendChild(card);

  card.querySelector('.input-nominal').addEventListener('input', calculateTotal);
  card.querySelector('.btn-remove-item').addEventListener('click', () => {
    if (rincianList.children.length > 1) {
      card.remove();
      calculateTotal();
    } else {
      alert('Minimal 1 rincian pembayaran.');
    }
  });
}

function calculateTotal() {
  const nominalInputs = document.querySelectorAll('.input-nominal');
  let total = 0;
  nominalInputs.forEach(inp => {
    total += parseFloat(inp.value) || 0;
  });

  const totalEl = document.getElementById('total-display');
  const terbilangEl = document.getElementById('terbilang-display');
  if (totalEl) totalEl.textContent = formatSAR(total);
  if (terbilangEl) terbilangEl.textContent = `"${terbilang(total)}"`;
}

function renderVouchersTable(list) {
  const tbody = document.getElementById('vouchers-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    if (isLoadingSheets) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 30px 10px; color: #64748b;">
            <i class="fa-solid fa-arrows-rotate fa-spin" style="margin-right: 6px;"></i> Menyinkronkan data dari Google Sheets...
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 30px 10px; color: #94a3b8;">
            <i class="fa-solid fa-folder-open" style="margin-right: 6px;"></i> Belum ada dokumen bukti pembayaran.
          </td>
        </tr>
      `;
    }
    return;
  }

  list.forEach(v => {
    const isSigned = v.status === 'Sudah Ditandatangani';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-mono font-bold text-navy">${v.noReferensi}</td>
      <td style="font-weight: 700;">${v.diterimaOleh}</td>
      <td style="text-align: right; font-family: monospace; font-weight: 700;">${formatSAR(v.totalNominal)}</td>
      <td style="text-align: center;">
        <span class="badge-status ${isSigned ? 'signed' : 'pending'}">
          <i class="fa-solid ${isSigned ? 'fa-circle-check' : 'fa-clock'}"></i> ${isSigned ? 'Selesai' : 'Menunggu'}
        </span>
      </td>
    `;

    tr.addEventListener('click', () => {
      openRowActionsModal(v);
    });

    tbody.appendChild(tr);
  });
}

function openRowActionsModal(v) {
  selectedVoucher = v;
  const isSigned = v.status === 'Sudah Ditandatangani';

  document.getElementById('action-modal-ref').textContent = v.noReferensi;
  document.getElementById('action-modal-receiver').textContent = v.diterimaOleh;
  document.getElementById('action-modal-amount').textContent = formatSAR(v.totalNominal);
  
  const statusEl = document.getElementById('action-modal-status');
  if (statusEl) {
    statusEl.className = `badge-status ${isSigned ? 'signed' : 'pending'}`;
    statusEl.innerHTML = `<i class="fa-solid ${isSigned ? 'fa-circle-check' : 'fa-clock'}"></i> ${v.status}`;
  }

  document.getElementById('modal-actions-overlay').classList.remove('hidden');
}

function showShareModal(voucher) {
  selectedVoucher = voucher;

  let recipientUrl;
  if (window.location.protocol.startsWith('http')) {
    recipientUrl = `${window.location.origin}/doc/${voucher.id}`;
  } else {
    const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    recipientUrl = `${basePath}penerima.html?id=${voucher.id}`;
  }

  const directUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}penerima.html?id=${voucher.id}`;
  
  const shareInput = document.getElementById('share-link-input');
  if (shareInput) shareInput.value = recipientUrl;

  const btnOpen = document.getElementById('btn-open-recipient');
  if (btnOpen) btnOpen.href = directUrl;

  // WhatsApp Message Generator (matching exact template requested)
  const receiverName = voucher.diterimaOleh || 'Bapak/Ibu';
  const waMessageText = `Assalamualaikum wr.wb ${receiverName}
Izin konfirmasi, berikut terlampir link konfirmasi bukti pembayaran yang sudah dilaksanakan:

🔗 ${recipientUrl}

Minta tolong dicek kembali rinciannya dan diisi tanda tangannya ya, sebagai laporan keuangan ke kantor jejak imani.

Jika sudah dikonfirmasi, tolong kabari ya..
Syukron, terimakasih 🙏🏻`;

  const btnWa = document.getElementById('btn-share-wa');
  if (btnWa) {
    btnWa.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(waMessageText)}`;
  }

  document.getElementById('modal-share-overlay').classList.remove('hidden');
}

function showPreviewModal(voucher) {
  const container = document.getElementById('pdf-doc-content');
  if (container) {
    container.innerHTML = generateDocumentHTML(voucher);
  }
  document.getElementById('modal-preview-overlay').classList.remove('hidden');
  setup2FingerPinchZoom();
}

// ==================== 2. RECIPIENT PORTAL LOGIC ====================
function initRecipientPortal(id) {
  currentVoucher = vouchers.find(v => v.id === id || v.noReferensi === id);
  if (currentVoucher) {
    renderRecipientView(currentVoucher);
  } else {
    showLoadingRecipientState();
  }
}

function renderRecipientView(v) {
  currentVoucher = v;
  const container = document.getElementById('pdf-doc-content');
  const formBox = document.getElementById('signature-form-box');
  const thankYouBox = document.getElementById('thank-you-container');
  const statusBadgeContainer = document.getElementById('status-badge-container');

  if (container) {
    container.innerHTML = generateDocumentHTML(v);
  }

  const isSigned = v.status === 'Sudah Ditandatangani';

  if (isSigned) {
    if (statusBadgeContainer) {
      statusBadgeContainer.innerHTML = `<span class="pill-badge signed" title="Sudah Ditandatangani"><i class="fa-solid fa-circle-check"></i></span>`;
    }
    if (formBox) formBox.classList.add('hidden');
    if (thankYouBox) thankYouBox.classList.remove('hidden');
  } else {
    if (statusBadgeContainer) {
      statusBadgeContainer.innerHTML = `<span class="pill-badge pending" title="Menunggu TTD Anda"><i class="fa-solid fa-clock"></i></span>`;
    }
    if (formBox) formBox.classList.remove('hidden');
    if (thankYouBox) thankYouBox.classList.add('hidden');
  }

  const chkAgreement = document.getElementById('chk-agreement');
  if (chkAgreement) {
    chkAgreement.onchange = checkCanSubmit;
  }

  const recipientForm = document.getElementById('recipient-form');
  if (recipientForm) {
    recipientForm.onsubmit = (e) => {
      e.preventDefault();
      document.getElementById('modal-confirm-overlay').classList.remove('hidden');
    };
  }

  const btnCancel = document.getElementById('btn-modal-cancel');
  if (btnCancel) {
    btnCancel.onclick = () => {
      document.getElementById('modal-confirm-overlay').classList.add('hidden');
    };
  }

  const btnConfirm = document.getElementById('btn-modal-confirm');
  if (btnConfirm) {
    btnConfirm.onclick = () => {
      document.getElementById('modal-confirm-overlay').classList.add('hidden');

      if (currentVoucher && signatureDataUrl) {
        currentVoucher.status = 'Sudah Ditandatangani';
        currentVoucher.tandaTanganUrl = signatureDataUrl;
        currentVoucher.tanggalDitandatangani = new Date().toISOString();

        // Save to permanent signature store
        signaturesStore[currentVoucher.id] = {
          tandaTanganUrl: signatureDataUrl,
          tanggalDitandatangani: currentVoucher.tanggalDitandatangani,
          status: 'Sudah Ditandatangani'
        };
        signaturesStore[currentVoucher.noReferensi] = signaturesStore[currentVoucher.id];
        localStorage.setItem(SIGNATURES_KEY, JSON.stringify(signaturesStore));

        saveVouchersLocal();
        postToGoogleSheets(currentVoucher);

        renderRecipientView(currentVoucher);
      }
    };
  }

  const btnDownloadRec = document.getElementById('btn-download-pdf-recipient');
  if (btnDownloadRec) {
    btnDownloadRec.onclick = () => {
      downloadPDF(currentVoucher);
    };
  }
}

// ==================== 3. EXPANDED CANVAS SIGNATURE PAD LOGIC ====================
function initLargeCanvasPad() {
  const canvas = document.getElementById('signature-canvas-large');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const canvasPlaceholder = document.getElementById('canvas-large-placeholder');
  const btnClear = document.getElementById('btn-clear-canvas-large');

  const startDraw = (e) => {
    isDrawing = true;
    const pos = getCanvasPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    if (canvasPlaceholder) canvasPlaceholder.style.display = 'none';
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getCanvasPos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    signatureDataUrl = canvas.toDataURL('image/png');
  };

  const stopDraw = () => {
    isDrawing = false;
  };

  canvas.onmousedown = startDraw;
  canvas.onmousemove = draw;
  canvas.onmouseup = stopDraw;
  canvas.onmouseleave = stopDraw;

  canvas.ontouchstart = startDraw;
  canvas.ontouchmove = draw;
  canvas.ontouchend = stopDraw;

  if (btnClear) {
    btnClear.onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      signatureDataUrl = null;
      if (canvasPlaceholder) canvasPlaceholder.style.display = 'flex';
    };
  }
}

function getCanvasPos(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function checkCanSubmit() {
  const chk = document.getElementById('chk-agreement');
  const btn = document.getElementById('btn-submit-sig');
  if (chk && btn) {
    btn.disabled = !(chk.checked && signatureDataUrl);
  }
}

// ==================== 4. OFFICIAL JEJAK IMANI DOCUMENT GENERATOR ====================
function generateDocumentHTML(v) {
  const isSigned = v.status === 'Sudah Ditandatangani';

  const rincianRows = (v.rincian || []).map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td style="font-weight: 500;">${item.kebutuhanGrup || item.keterangan || '-'}</td>
      <td>${item.keterangan || '-'}</td>
      <td style="font-weight: 600;">${formatSAR(item.nominal)}</td>
    </tr>
  `).join('');

  const bgSrc = bgLetterheadBase64 || '/bg-letterhead.png';
  const ttdDiserahkanSrc = ttdDiserahkanBase64 || '/ttd-diserahkan.png';

  return `
    <img src="${bgSrc}" alt="Letterhead Background" class="ji-bg-letterhead-img">
    <div class="doc-inner-content">
      <!-- MAIN DOCUMENT TITLE (14pt Title & 12pt Subtitle) -->
      <div class="ji-doc-title-block">
        <h1 class="ji-main-title">TANDA TERIMA PEMBAYARAN</h1>
        <h2 class="ji-sub-title">Tim Khidmat <span class="jejak-imani-lc">jejak imani</span> Saudi Arabia</h2>
      </div>

      <!-- META INFORMATION (9pt Font, Justified Paragraphs) -->
      <div class="ji-meta-lines">
        <div class="ji-meta-row">
          <span class="ji-meta-label">No. Referensi</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${v.noReferensi}</span>
        </div>
        <div class="ji-meta-row">
          <span class="ji-meta-label">Hari, Tanggal</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${formatIndoDate(v.tanggal)}</span>
        </div>

        <div class="ji-section-heading">INFORMASI PEMBAYARAN</div>

        <div class="ji-meta-row">
          <span class="ji-meta-label">Diserahkan oleh</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${v.diserahkanOleh || 'Fathur Rahman Al Masyi'}</span>
        </div>
        <div class="ji-meta-row">
          <span class="ji-meta-label">Diterima oleh</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${v.diterimaOleh}</span>
        </div>
        <div class="ji-meta-row">
          <span class="ji-meta-label">Wilayah</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${v.wilayah || 'Madinah'}</span>
        </div>
        <div class="ji-meta-row">
          <span class="ji-meta-label">Metode Pembayaran</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${v.metodePembayaran || 'Cash Riyal'}</span>
        </div>
        <div class="ji-meta-row">
          <span class="ji-meta-label">Total Nominal</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">${formatSAR(v.totalNominal)}</span>
        </div>
        <div class="ji-meta-row">
          <span class="ji-meta-label">Terbilang</span>
          <span class="ji-meta-colon">:</span>
          <span class="ji-meta-val">“${v.terbilang}”</span>
        </div>
      </div>

      <div class="ji-section-heading">RINCIAN PEMBAYARAN</div>

      <!-- RINCIAN TABLE (Center Center Cell Alignment) -->
      <table class="ji-table">
        <thead>
          <tr>
            <th style="width: 35px;">No</th>
            <th style="width: 40%;">Kebutuhan Grup</th>
            <th>Keterangan</th>
            <th style="width: 95px;">Nominal</th>
          </tr>
        </thead>
        <tbody>
          ${rincianRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align: center; font-weight: 800;">TOTAL</td>
            <td style="text-align: center; font-weight: 800;">${formatSAR(v.totalNominal)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- STATEMENTS BLOCK (Justified Paragraphs) -->
      <div class="ji-statements-block">
        <p>Bahwa Pihak Pertama telah menyerahkan dana dengan total nominal tersebut diatas kepada Pihak Kedua. Pihak Kedua menyatakan telah menerima dana tersebut secara lengkap dan benar sesuai dengan rincian pengeluaran di atas untuk alokasi operasional saudi.</p>
        <p>Dokumen ini disetujui dan ditandatangani secara elektronik/digital serta berlaku sebagai bukti pembayaran yang sah bagi kedua belah pihak.</p>
      </div>

      <!-- SIGNATURES GRID WITH ENLARGED SIGNATURE IMAGES -->
      <div class="ji-signatures-grid">
        <div class="ji-sig-box">
          <div class="ji-sig-label">Diserahkan Oleh</div>
          <div class="ji-sig-space">
            <img src="${ttdDiserahkanSrc}" alt="TTD Diserahkan Oleh" class="ji-sig-img">
          </div>
          <div class="ji-sig-name">Fathur Rahman Al Masyi</div>
          <div class="ji-sig-role">Saudi Operational Officer</div>
        </div>

        <div class="ji-sig-box">
          <div class="ji-sig-label">Diterima Oleh</div>
          <div class="ji-sig-space">
            ${isSigned && v.tandaTanganUrl ? `<img src="${v.tandaTanganUrl}" alt="TTD Diterima Oleh" class="ji-sig-img">` : ``}
          </div>
          <div class="ji-sig-name">${v.diterimaOleh}</div>
        </div>
      </div>

    </div>
  `;
}

// ==================== 5. GOOGLE SHEETS SYNC ====================
function postToGoogleSheets(v) {
  const rincianText = (v.rincian || []).map(r => `${r.no}. ${r.kebutuhanGrup} - ${r.keterangan} (${formatSAR(r.nominal)})`).join('\n');

  const payload = {
    id: v.id,
    noReferensi: v.noReferensi,
    tanggal: v.tanggal,
    diserahkanOleh: v.diserahkanOleh,
    diterimaOleh: v.diterimaOleh,
    wilayah: v.wilayah || 'Madinah',
    metodePembayaran: v.metodePembayaran || 'Cash Riyal',
    rincianPembayaran: rincianText,
    totalNominal: v.totalNominal,
    status: v.status
  };

  fetch(SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.log('Sheets Sync Notice:', err));
}

// ==================== 6. GUARANTEED 100% NON-BLANK & UN-SHIFTED PDF RENDERER ====================
function downloadPDF(voucher, callback) {
  if (!voucher) return;

  // Create or get capture container inside DOM viewport
  let captureContainer = document.getElementById('pdf-hidden-capture-container');
  if (!captureContainer) {
    captureContainer = document.createElement('div');
    captureContainer.id = 'pdf-hidden-capture-container';
    document.body.appendChild(captureContainer);
  }

  // Set style so element is inside DOM viewport for html2canvas without being visible to user
  captureContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 794px; height: 1123px; overflow: hidden; background: #ffffff; z-index: -9999; opacity: 0.01; pointer-events: none;';
  
  // Render document HTML with transform: none !important on wrapper to guarantee no zoom contamination
  captureContainer.innerHTML = `
    <div class="doc-printable-wrapper" style="width: 794px; height: 1123px; padding: 135px 48px 30px 48px; box-sizing: border-box; background: #ffffff; position: relative; transform: none !important;">
      ${generateDocumentHTML(voucher)}
    </div>
  `;

  const targetEl = captureContainer.querySelector('.doc-printable-wrapper');
  const filename = `Tanda_Terima_Pembayaran_${(voucher.noReferensi || 'OUT0001').replace(/[\/\\]/g, '_')}.pdf`;

  const opt = {
    margin:       0,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      allowTaint: true, 
      backgroundColor: '#ffffff', 
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 794,
      windowHeight: 1123
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  let pdfDone = false;

  const cleanup = () => {
    captureContainer.innerHTML = '';
    if (callback) callback();
  };

  if (typeof html2pdf !== 'undefined') {
    try {
      html2pdf().set(opt).from(targetEl).save().then(() => {
        pdfDone = true;
        cleanup();
      }).catch(err => {
        console.log('html2pdf notice:', err);
        if (!pdfDone) {
          pdfDone = true;
          window.print();
          cleanup();
        }
      });
    } catch (e) {
      console.log('html2pdf exception:', e);
      window.print();
      cleanup();
    }
  } else {
    window.print();
    cleanup();
  }

  setTimeout(() => {
    if (!pdfDone) {
      pdfDone = true;
      window.print();
      cleanup();
    }
  }, 750);
}

// ==================== 7. HELPER UTILITIES ====================
function saveVouchersLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vouchers));
}

function formatSAR(number) {
  if (isNaN(number)) return 'SAR 0';
  return `SAR ${Number(number).toLocaleString('id-ID')}`;
}

function formatIndoDate(dateStr) {
  if (!dateStr) return '';
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const dayName = days[d.getDay()];
  const monthName = months[d.getMonth()];
  return `${dayName}, ${d.getDate()} ${monthName} ${d.getFullYear()}`;
}

function terbilang(nominal) {
  if (isNaN(nominal) || nominal === 0) return 'Nol Saudi Riyal';

  const rounded = Math.floor(Math.abs(nominal));
  const angka = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function convert(n) {
    if (n < 12) return ' ' + angka[n];
    if (n < 20) return convert(n - 10) + ' Belas';
    if (n < 100) return convert(Math.floor(n / 10)) + ' Puluh' + convert(n % 10);
    if (n < 200) return ' Seratus' + convert(n - 100);
    if (n < 1000) return convert(Math.floor(n / 100)) + ' Ratus' + convert(n % 100);
    if (n < 2000) return ' Seribu' + convert(n - 1000);
    if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Ribu' + convert(n % 1000);
    if (n < 1000000000) return convert(Math.floor(n / 1000000)) + ' Juta' + convert(n % 1000000);
    if (n < 1000000000000) return convert(Math.floor(n / 1000000000)) + ' Miliar' + convert(n % 1000000000);
    return convert(Math.floor(n / 1000000000000)) + ' Triliun' + convert(n % 1000000000000);
  }

  return `${convert(rounded).trim().replace(/\s+/g, ' ')} Saudi Riyal`;
}
