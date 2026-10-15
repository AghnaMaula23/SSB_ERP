-- Susulan 20261014120000_enable_rls: tabel `users` terlewat karena skrip
-- pembuat daftar tabel melewatkan baris terakhir (tanpa newline). Migrasi yang
-- sudah ter-deploy tidak diedit — Prisma menyimpan checksum-nya.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
