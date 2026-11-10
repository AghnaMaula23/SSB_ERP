/**
 * Halaman Project & Rental dipakai dua divisi: Admin (`#/admin/...`) dan Lapangan
 * (`#/lapangan/...`). Tombolnya sudah disaring per permission, jadi yang berbeda
 * hanya awalan rute. Awalan dibaca dari hash supaya tautan tetap di divisi yang
 * sedang dibuka.
 */
export const divisionPrefix = () => (window.location.hash.startsWith('#/lapangan/') ? 'lapangan' : 'admin');
