/**
 * Sakelar kontrak contoh Supply & Rental (backlog E11). Kontrak contoh tampil
 * bercampur dengan kontrak asli — ditandai "Contoh" — supaya layar bisa dicoba
 * tanpa data. Default: nyala saat `vite dev`, mati di build produksi.
 * Paksa lewat .env: VITE_ADMIN_DEMO_DATA=true | false.
 */
const flag = import.meta.env.VITE_ADMIN_DEMO_DATA;
export const DEMO_DATA_ENABLED = flag === undefined || flag === '' ? Boolean(import.meta.env.DEV) : flag === 'true';
