// ============================================================
// PENYIMPANAN LOKAL — folder & berkas proyek.
//
// Backend BELUM punya modul file (multer terpasang tapi belum dipakai, belum
// ada tabel dokumen). Sampai ada, metadata disimpan di localStorage dan isi
// berkas di IndexedDB (localStorage terlalu kecil untuk file). Semuanya per
// browser dan dibersihkan saat sign out. Fungsi dibuat async dengan bentuk
// yang wajar untuk REST supaya halaman tidak perlu diubah saat diganti API.
// ============================================================

const META_KEY = 'admin_mock_files';
const DB_NAME = 'constructerp-files';
const BLOB_STORE = 'blobs';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const ACCEPTED_TYPES = '.pdf,.dwg,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

// ---------------- IndexedDB untuk isi berkas ----------------

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser ini tidak mendukung penyimpanan berkas (IndexedDB).'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(BLOB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function blobOp(mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, mode);
    const request = operation(tx.objectStore(BLOB_STORE));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const readBlob = (fileId) => blobOp('readonly', (store) => store.get(fileId));

// ---------------- Data contoh ----------------

const now = Date.now();
const hoursAgo = (hours) => new Date(now - hours * 3600000).toISOString();
const year = new Date().getFullYear();

const DEMO_FOLDERS = [
  ['Jalan Tol Subang - Phase 2', 'INF', 'construction', 'active', year, 2],
  ['Gedung Perkantoran Sudirman', 'BLD', 'construction', 'planned', year, 24],
  ['Jembatan Musi IV - Archive', 'INF', 'construction', 'completed', year - 2, 6000],
  ['LRT Jabodebek Expansion', 'RIL', 'rental', 'active', year, 0.1],
  ['Industrial Park Cikarang', 'IND', 'supply', 'active', year, 4],
];

const DEMO_FILES = [
  ['Foto Fisik Surat Jalan 102', 'Foto_Fisik_Surat_Jalan_102.jpg', 'image/jpeg', 2.4, 'Surat Jalan', 'Agung Saputra', ['Ritase', 'Subang']],
  ['Laporan Harian KM45 Subang', 'Laporan_Harian_KM45_Subang.pdf', 'application/pdf', 1.1, 'Laporan Harian', 'Rian Maulana', ['KM45']],
  ['Logistik Beton ReadyMix V2', 'Logistik_Beton_ReadyMix_V2.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 0.45, 'Logistik', 'Dina Kurnia', ['Beton', 'Rev-2']],
  ['Dokumentasi Tiang Pancang B', 'Dokumentasi_Tiang_Pancang_B.png', 'image/png', 5.8, 'Foto Lapangan', 'Agung Saputra', ['Struktur']],
  ['Sertifikasi Baja A500 Verified', 'Sertifikasi_Baja_A500_Verified.pdf', 'application/pdf', 3.2, 'Sertifikat', 'Rian Maulana', ['QC']],
  ['Gambar Teknik Jembatan Rev-3', 'Gambar_Teknik_Jembatan_Rev3.dwg', 'application/acad', 12.6, 'Gambar Teknik', 'Dina Kurnia', ['Rev-3']],
  ['Kontrak Sewa Alat Q3', 'Kontrak_Sewa_Alat_Q3.pdf', 'application/pdf', 0.9, 'Kontrak', 'Admin Kantor', ['Legal']],
];

function seed() {
  const folders = DEMO_FOLDERS.map(([name, prefix, projectKind, projectStatus, folderYear, ageHours], index) => ({
    id: index + 1,
    name,
    projectKind,
    projectId: null,
    projectCode: `${prefix}-${folderYear}-${String([1, 42, 98, 15, 883][index]).padStart(3, '0')}`,
    projectName: name.replace(' - Archive', ''),
    projectStatus,
    year: folderYear,
    archived: projectStatus === 'completed',
    createdAt: hoursAgo(ageHours + 720),
    createdBy: { fullName: 'Data Contoh' },
    isDemo: true,
  }));
  let fileId = 0;
  const files = [];
  folders.forEach((folder, folderIndex) => {
    const count = [7, 4, 6, 5, 3][folderIndex];
    for (let i = 0; i < count; i += 1) {
      const [name, fileName, mimeType, sizeMb, category, uploader, tags] = DEMO_FILES[(i + folderIndex) % DEMO_FILES.length];
      fileId += 1;
      files.push({
        id: fileId,
        folderId: folder.id,
        name,
        fileName,
        mimeType,
        size: Math.round(sizeMb * 1024 * 1024),
        category,
        description: `Berkas contoh untuk ${folder.name}.`,
        tags,
        uploadedAt: hoursAgo(DEMO_FOLDERS[folderIndex][5] + i * 7),
        uploadedBy: { fullName: uploader },
        hasBlob: false,
        isDemo: true,
      });
    }
  });
  return { folders, files };
}

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(META_KEY) || 'null');
    if (stored?.folders) return stored;
  } catch {
    // jatuh ke data awal
  }
  const data = seed();
  localStorage.setItem(META_KEY, JSON.stringify(data));
  return data;
}

const write = (data) => localStorage.setItem(META_KEY, JSON.stringify(data));
const nextId = (rows) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

// ---------------- Folder ----------------

/** Folder beserta ringkasan berkasnya (jumlah, ukuran, update terakhir). */
export async function listFolders() {
  const { folders, files } = read();
  return folders.map((folder) => {
    const own = files.filter((file) => file.folderId === folder.id);
    return {
      ...folder,
      fileCount: own.length,
      totalSize: own.reduce((sum, file) => sum + file.size, 0),
      lastUploadAt: own.reduce((latest, file) => (file.uploadedAt > latest ? file.uploadedAt : latest), ''),
    };
  });
}

export async function getFolder(folderId) {
  const folder = (await listFolders()).find((row) => row.id === Number(folderId));
  if (!folder) throw new Error('Folder tidak ditemukan.');
  return folder;
}

class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.errors = errors;
  }
}

export async function createFolder(form, project) {
  const data = read();
  const name = form.name.trim();
  if (data.folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase() && folder.projectCode === project.projectCode)) {
    throw new ValidationError('Folder dengan nama ini sudah ada untuk proyek tersebut.', [{ field: 'name', message: 'Nama folder sudah dipakai.' }]);
  }
  const user = readUser();
  const folder = {
    id: nextId(data.folders),
    name,
    projectKind: project.kind,
    projectId: project.id,
    projectCode: project.projectCode,
    projectName: project.projectName,
    projectStatus: project.status,
    year: Number(form.year),
    archived: false,
    createdAt: new Date().toISOString(),
    createdBy: { fullName: user.fullName || user.username },
    isDemo: Boolean(project.isDemo),
  };
  data.folders.push(folder);
  write(data);
  return folder;
}

export async function setFolderArchived(folderId, archived) {
  const data = read();
  const folder = data.folders.find((row) => row.id === Number(folderId));
  if (!folder) throw new Error('Folder tidak ditemukan.');
  folder.archived = archived;
  write(data);
  return folder;
}

/** Folder hanya boleh dihapus kalau kosong — berkas tidak ikut hilang diam-diam. */
export async function deleteFolder(folderId) {
  const data = read();
  if (data.files.some((file) => file.folderId === Number(folderId))) {
    throw new Error('Folder masih berisi berkas. Pindahkan atau hapus berkasnya dulu.');
  }
  data.folders = data.folders.filter((folder) => folder.id !== Number(folderId));
  write(data);
}

// ---------------- Berkas ----------------

export async function listFiles(folderId) {
  return read().files.filter((file) => file.folderId === Number(folderId)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getFile(fileId) {
  const file = read().files.find((row) => row.id === Number(fileId));
  if (!file) throw new Error('Berkas tidak ditemukan.');
  return file;
}

export async function uploadFile(folderId, form, blob) {
  if (!blob) throw new ValidationError('Pilih berkas yang akan diunggah.', [{ field: 'file', message: 'Berkas wajib dipilih.' }]);
  if (blob.size > MAX_FILE_SIZE) throw new ValidationError('Ukuran berkas maksimal 50 MB.', [{ field: 'file', message: 'Berkas melebihi 50 MB.' }]);
  const data = read();
  const folder = data.folders.find((row) => row.id === Number(folderId));
  if (!folder) throw new Error('Folder tidak ditemukan.');
  if (folder.archived) throw new Error('Folder diarsipkan — aktifkan kembali sebelum mengunggah.');

  const id = nextId(data.files);
  // Isi berkas disimpan dulu: kalau gagal (kuota penuh), metadata tidak ikut tercatat.
  await blobOp('readwrite', (store) => store.put(blob, id));
  const user = readUser();
  const file = {
    id,
    folderId: folder.id,
    name: form.name.trim(),
    fileName: blob.name,
    mimeType: blob.type || 'application/octet-stream',
    size: blob.size,
    category: form.category,
    description: form.description.trim(),
    tags: form.tags,
    uploadedAt: new Date().toISOString(),
    uploadedBy: { fullName: user.fullName || user.username },
    hasBlob: true,
  };
  data.files.push(file);
  write(data);
  return file;
}

export async function deleteFile(fileId) {
  const data = read();
  data.files = data.files.filter((file) => file.id !== Number(fileId));
  write(data);
  await blobOp('readwrite', (store) => store.delete(Number(fileId))).catch(() => {});
}
