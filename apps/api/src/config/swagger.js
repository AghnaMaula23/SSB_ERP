const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'ConstructERP API',
    version: '0.1.0',
    description: 'API Contract untuk ERP Konstruksi SSB.Inc / ConstructERP',
    contact: { name: 'SSB.Inc Dev Team' }
  },
  servers: [
    { url: '/api', description: 'API Base' }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Masukkan token dari POST /auth/login'
      }
    },
    schemas: {
      // Modul Pekerja — docs/skema-tenaga-kerja-harian.md P1–P11
      Worker: {
        type: 'object',
        description: 'Identitas pekerja (master GLOBAL, tidak terikat project/tahapan). Upah TIDAK di sini — milik penugasan.',
        properties: {
          id: { type: 'integer' },
          workerCode: { type: 'string', example: 'PWK-000001', description: 'Dibuat sistem' },
          fullName: { type: 'string', example: 'Dedi Kurniawan' },
          idNumber: { type: 'string', nullable: true, example: '3275010294880001', description: 'NIK, 16 digit; unik kalau diisi' },
          phone: { type: 'string', nullable: true },
          defaultRole: { type: 'string', nullable: true, example: 'Operator Excavator' },
          joinedAt: { type: 'string', format: 'date', nullable: true },
          yearsOfService: { type: 'integer', nullable: true, description: 'Turunan dari joinedAt (tidak disimpan)' },
          notes: { type: 'string', nullable: true },
          createdBy: { type: 'object', properties: { id: { type: 'integer' }, fullName: { type: 'string' } } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      WorkerAssignment: {
        type: 'object',
        description: 'Kesepakatan kerja satu pekerja di satu tahapan. Tanpa kolom status: `isActive` = endDate kosong atau ≥ hari ini (turunan).',
        properties: {
          id: { type: 'integer' },
          subProjectId: { type: 'integer' },
          worker: { type: 'object', properties: { id: { type: 'integer' }, workerCode: { type: 'string' }, fullName: { type: 'string' }, idNumber: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true } } },
          workerType: { type: 'string', enum: ['contract', 'daily'] },
          assignedRole: { type: 'string', nullable: true, description: 'Peran di tahapan ini; null → pakai worker.defaultRole' },
          dailyWage: { type: 'number', example: 150000, description: 'Upah sepakat per hari — juga untuk pekerja KONTRAK (P3)' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date', nullable: true },
          isActive: { type: 'boolean', description: 'Turunan' },
          loggedDays: { type: 'integer', description: 'Jumlah log tahapan ini yang memuat pekerja ini (turunan)' },
          notes: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LaborLogItem: {
        type: 'object',
        description: 'SATU BARIS = SATU ORANG. totalWage = dailyWage + overtimeAmount (tanpa pengali, P2) — dihitung, tidak disimpan.',
        properties: {
          id: { type: 'integer' },
          worker: { type: 'object', properties: { id: { type: 'integer' }, workerCode: { type: 'string' }, fullName: { type: 'string' } } },
          workerRole: { type: 'string', example: 'Harian K3' },
          workerType: { type: 'string', enum: ['contract', 'daily'] },
          dailyWage: { type: 'number' },
          overtimeAmount: { type: 'number', description: '0 = tidak lembur' },
          totalWage: { type: 'number' },
          taskNotes: { type: 'string', nullable: true },
          assignmentDailyWage: { type: 'number', nullable: true, description: 'Upah di penugasan tahapan ini; null = tanpa penugasan' },
          wageDiffersFromAssignment: { type: 'boolean', description: 'Penanda untuk pemeriksa klaim (P7)' },
        },
      },
      LaborLog: {
        type: 'object',
        description: 'Log tenaga kerja satu tahapan satu tanggal. Tanpa status & tanpa validasi (P1). Total dihitung saat dibaca.',
        properties: {
          id: { type: 'integer' },
          subProjectId: { type: 'integer' },
          workDate: { type: 'string', format: 'date' },
          notes: { type: 'string', nullable: true },
          summary: { type: 'object', properties: {
            totalWorkers: { type: 'integer' }, contractWorkers: { type: 'integer' }, dailyWorkers: { type: 'integer' },
            overtimeWorkers: { type: 'integer' }, totalWage: { type: 'number' }, totalOvertime: { type: 'number' },
          } },
          items: { type: 'array', items: { $ref: '#/components/schemas/LaborLogItem' }, description: 'Hanya di detail & response tulis; list tidak memuat items' },
          createdBy: { type: 'object', properties: { id: { type: 'integer' }, fullName: { type: 'string' } } },
          updatedBy: { type: 'object', nullable: true, properties: { id: { type: 'integer' }, fullName: { type: 'string' } } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectFolderEntry: {
        type: 'object',
        description: 'Satu folder di direktori project. `kind: user` = folder buatan Admin (bisa di-rename/hapus). `kind: system` = baca-saja: lampiran modul (`delivery-notes`, `receipt-proofs`, dibaca dari tabel sumber — tidak disalin) atau `closing-archive` ("Arsip Penutupan", XLSX yang dibuat SEKALI saat tahapan/project ditutup). Ringkasan dihitung saat dibaca.',
        properties: {
          kind: { type: 'string', enum: ['user', 'system'] },
          id: { type: 'integer', nullable: true, description: 'Hanya `user`' },
          key: { type: 'string', nullable: true, enum: ['delivery-notes', 'receipt-proofs', 'closing-archive'], description: 'Hanya `system`' },
          name: { type: 'string', example: 'Surat Jalan' },
          subProjectId: { type: 'integer', nullable: true, description: 'Folder milik tahapan (konstruksi); null = tingkat project' },
          fileCount: { type: 'integer', description: 'Berkas aktif (sampah tidak dihitung)' },
          totalSize: { type: 'integer', description: 'Byte' },
          lastUploadAt: { type: 'string', format: 'date-time', nullable: true },
          createdBy: { type: 'object', nullable: true, properties: { id: { type: 'integer' }, username: { type: 'string' }, fullName: { type: 'string' } } },
          createdAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ProjectFile: {
        type: 'object',
        description: 'Berkas di folder user. Pengunggah, ukuran, jenis & status sampah hidup di tabel `files` (satu fakta), bukan disalin ke sini. Buka/unduh lewat `GET /api/files/{file.id}/url`.',
        properties: {
          id: { type: 'integer' },
          folderId: { type: 'integer' },
          folderName: { type: 'string' },
          name: { type: 'string', example: 'Gambar Teknik Jembatan Rev-3', description: 'Nama tampilan, bisa diubah' },
          description: { type: 'string', nullable: true },
          kind: { type: 'string', enum: ['image', 'pdf', 'sheet', 'doc', 'cad'], description: 'Turunan dari mimeType' },
          file: { type: 'object', properties: {
            id: { type: 'integer' }, originalName: { type: 'string', description: 'Nama saat diunggah — dipakai sebagai nama unduhan' },
            mimeType: { type: 'string' }, sizeBytes: { type: 'integer' }, uploadedAt: { type: 'string', format: 'date-time' },
            uploadedBy: { type: 'object', properties: { id: { type: 'integer' }, username: { type: 'string' }, fullName: { type: 'string' } } },
          } },
          trashedAt: { type: 'string', format: 'date-time', nullable: true },
          trashedBy: { type: 'object', nullable: true },
          purgeAt: { type: 'string', format: 'date-time', nullable: true, description: 'Hanya di sampah: trashedAt + 30 hari — sesudahnya dihapus permanen' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ApprovalQueueItem: {
        type: 'object',
        description: 'Satu baris antrean Approval Center. Ringkasan untuk list — detail & aksi selalu lewat endpoint modul sumber.',
        properties: {
          sourceType: { type: 'string', enum: ['purchase_request', 'material_request', 'equipment_request', 'progress_log'] },
          sourceId: { type: 'integer', example: 12 },
          stage: { type: 'string', enum: ['admin', 'finance'] },
          referenceCode: { type: 'string', nullable: true, example: 'MRQ-000012', description: 'Kode dokumen. `null` untuk progress_log (tidak bernomor)' },
          context: { type: 'string', example: 'PRJ-000003 Jalan Demak-Kudus · Galian', description: 'Project & tahapan, kontrak supply, atau kategori order PR' },
          summary: { type: 'string', example: '3 material', description: 'Ringkasan isi: jumlah item, kategori order, atau volume + tanggal progress' },
          amount: { type: 'number', nullable: true, example: 15000000, description: 'Rupiah. PR: estimasi total; request material tahap finance: total rincian biaya; lainnya `null`' },
          requestedBy: { type: 'object', properties: { id: { type: 'integer' }, fullName: { type: 'string' } } },
          submittedAt: { type: 'string', format: 'date-time', description: 'Waktu masuk antrean TAHAP INI (lihat tabel di GET /approval-queue)' },
          detailPath: { type: 'string', example: '/api/request-material/12', description: 'Endpoint detail sumber' },
          actionEndpoints: {
            type: 'array', description: 'Endpoint aksi tahap ini (method PUT). FE tetap memakai kontrak masing-masing endpoint',
            items: { type: 'string' },
            example: ['/api/request-material/12/admin-validation', '/api/request-material/12/costs', '/api/request-material/12/submit-to-finance', '/api/request-material/12/reject'],
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' }
        }
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' }
        }
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: {} },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              totalPages: { type: 'integer' }
            }
          }
        }
      },
      PaginationQuery: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20, maximum: 100 }
        }
      }
    },
    parameters: {
      PageParam: { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
      LimitParam: { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      SearchParam: { in: 'query', name: 'search', schema: { type: 'string' } }
    }
  },
  security: [{ BearerAuth: [] }],

  tags: [
    { name: 'Auth', description: 'Autentikasi dan profil user' },
    { name: 'Users', description: 'Daftar user dan penugasan role' },
    { name: 'Roles', description: 'CRUD role dan pemetaan permission' },
    { name: 'Permissions', description: 'Master permission (module:action)' },
    { name: 'Construction Projects', description: 'CRUD construction project dan sub-project' },
    { name: 'Sub-Projects', description: 'Sub-project (tahapan) dengan kontrak terpisah' },
    { name: 'Daily Progress', description: 'Progress harian per sub-project' },
    { name: 'External Rental', description: 'Project rental alat eksternal' },
    { name: 'External Supply', description: 'Project supply material eksternal' },
    { name: 'Equipment Pool & Material Pool', description: 'Pool alat dan material pada level project' },
    { name: 'Material Master', description: 'Master jenis material, satuan baku, dan supplier' },
    { name: 'Project Files', description: 'Manajemen file dan folder project' },
    { name: 'Equipment Types', description: 'Master jenis alat' },
    { name: 'Equipment Items', description: 'Master unit alat' },
    { name: 'Workhour Logs', description: 'Catatan jam kerja alat' },
    { name: 'Maintenance', description: 'Aspek, setting, dan record maintenance' },
    { name: 'Damage Logs', description: 'Laporan kerusakan alat' },
    { name: 'Purchase Requests', description: 'Pengajuan servis/sparepart Divisi Alat' },
    { name: 'Kas Divisi Alat', description: 'Saldo dan transaksi kas Divisi Alat' },
    { name: 'Request Alat', description: 'Permintaan alat dari Lapangan' },
    { name: 'Request Material', description: 'Permintaan material dari Lapangan' },
    { name: 'Material Delivery', description: 'Delivery + surat jalan per truk (RM-4)' },
    { name: 'Material Receipt', description: 'Penerimaan material per delivery (RM-5)' },
    { name: 'Material Stock', description: 'Stok material per tahapan konstruksi (RM-5)' },
    { name: 'Files', description: 'Unduh lampiran lewat signed URL' },
    { name: 'Project Files', description: 'Berkas project: folder user, folder sistem baca-saja (lampiran modul + arsip penutupan XLSX), sampah 30 hari (L8)' },
    { name: 'Approval Center', description: 'Antrean baca-saja lintas modul (VIEW approval_queue). Aksi tetap di modul sumber' },
    { name: 'Pekerja', description: 'Master pekerja (global) + penugasan per tahapan — docs/skema-tenaga-kerja-harian.md' },
    { name: 'Log Tenaga Kerja', description: 'Log pekerja harian per tahapan per tanggal, satu baris = satu orang, tanpa validasi (P1)' },
    { name: 'Income Records', description: 'Pencatatan pendapatan dan billing' },
    { name: 'Income Payments', description: 'Pembayaran client' },
    { name: 'Equipment Income Claims', description: 'Klaim pendapatan alat oleh Divisi Alat' },
    { name: 'Finance Field', description: 'Pengeluaran operasional lapangan' },
    { name: 'Daily Labor', description: 'PLACEHOLDER September — klaim upah & bukti bayar dirancang ulang di sesi klaim (docs/skema-tenaga-kerja-harian.md "Hilir")' },
    { name: 'Chart of Accounts', description: 'Master akun keuangan' },
    { name: 'Journal Entries', description: 'Jurnal umum debit-credit' },
    { name: 'Financial Corrections', description: 'Koreksi transaksi keuangan' },
    { name: 'Employees', description: 'Master karyawan tetap' },
    { name: 'Payroll', description: 'Penggajian karyawan tetap' }
  ],

  paths: {
    // ========================================
    // 1. AUTH
    // ========================================
    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Buat akun user baru', description: 'Permission: user:create (super_admin). BUKAN pendaftaran mandiri — dulu terbuka untuk publik, ditutup 13 Okt 2026. Akun baru tanpa role; role diberikan lewat PUT /users/{id}/roles.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['username', 'email', 'password', 'fullName'],
          properties: {
            username: { type: 'string', example: 'admin1' },
            email: { type: 'string', example: 'admin1@ssb.com' },
            password: { type: 'string', example: 'password123' },
            fullName: { type: 'string', example: 'Admin Satu' }
          }
        }}}},
        responses: {
          201: { description: 'User created', content: { 'application/json': { schema: {
            type: 'object', properties: {
              success: { type: 'boolean' }, message: { type: 'string' },
              data: { type: 'object', properties: {
                id: { type: 'integer' }, username: { type: 'string' },
                email: { type: 'string' }, fullName: { type: 'string' }, createdAt: { type: 'string' }
              }}
            }
          }}}},
          409: { description: 'Username/email sudah terdaftar' }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Login dan dapatkan JWT token', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['login', 'password'],
          properties: {
            login: { type: 'string', description: 'Username atau email', example: 'admin1' },
            password: { type: 'string', example: 'password123' }
          }
        }}}},
        responses: {
          200: { description: 'Login berhasil', content: { 'application/json': { schema: {
            type: 'object', properties: {
              success: { type: 'boolean' }, message: { type: 'string' },
              data: { type: 'object', properties: {
                token: { type: 'string', example: 'eyJhbGciOi...' },
                user: { type: 'object', properties: {
                  id: { type: 'integer' }, username: { type: 'string' },
                  fullName: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } }
                }}
              }}
            }
          }}}},
          401: { description: 'Kredensial tidak valid' }
        }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'], summary: 'Profil user yang sedang login',
        responses: { 200: { description: 'User profile + roles + permissions' } }
      }
    },

    // ========================================
    // 1b. ACCESS CONTROL (Users, Roles, Permissions)
    // ========================================
    '/users': {
      get: {
        tags: ['Users'], summary: 'List user + role-nya', description: 'Permission: user:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { $ref: '#/components/parameters/SearchParam' },
          { in: 'query', name: 'roleCode', schema: { type: 'string', example: 'lapangan' }, description: 'Filter user berdasarkan kode role' },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated list user', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      }
    },
    '/users/{id}': {
      get: {
        tags: ['Users'], summary: 'Detail user + roles + permissions', description: 'Permission: user:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail user' }, 404: { description: 'User tidak ditemukan' } }
      }
    },
    '/users/{id}/roles': {
      put: {
        tags: ['Users'], summary: 'Set ulang seluruh role user', description: 'Permission: user:update. Mengganti semua role user dengan daftar yang dikirim.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['roleIds'],
          properties: { roleIds: { type: 'array', items: { type: 'integer' }, example: [2, 3] } }
        }}}},
        responses: {
          200: { description: 'Role user diperbarui' },
          404: { description: 'User / role tidak ditemukan' },
          403: { description: 'Mengubah role akun sendiri' },
          409: { description: 'Melepas super_admin aktif terakhir / super_admin digabung role lain (super_admin eksklusif)' }
        }
      },
      post: {
        tags: ['Users'], summary: 'Tambah satu role ke user', description: 'Permission: user:update',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['roleId'], properties: { roleId: { type: 'integer', example: 2 } }
        }}}},
        responses: {
          201: { description: 'Role ditugaskan' },
          404: { description: 'User / role tidak ditemukan' },
          409: { description: 'User sudah punya role ini / role nonaktif' }
        }
      }
    },
    '/users/{id}/roles/{roleId}': {
      delete: {
        tags: ['Users'], summary: 'Lepas role dari user', description: 'Permission: user:update',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'roleId', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'Role dilepas' },
          404: { description: 'User tidak punya role ini' },
          403: { description: 'Mengubah role akun sendiri' },
          409: { description: 'Melepas super_admin aktif terakhir / super_admin digabung role lain (super_admin eksklusif)' }
        }
      }
    },
    '/roles': {
      get: {
        tags: ['Roles'], summary: 'List role + permission-nya', description: 'Permission: role:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { $ref: '#/components/parameters/SearchParam' },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated list role', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Roles'], summary: 'Buat role baru', description: 'Permission: role:create',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['code', 'name'],
          properties: {
            code: { type: 'string', example: 'gudang', description: 'huruf kecil, angka, underscore' },
            name: { type: 'string', example: 'Staf Gudang' },
            description: { type: 'string', example: 'Mengelola stok material' }
          }
        }}}},
        responses: { 201: { description: 'Role dibuat' }, 400: { description: 'Validasi gagal' }, 409: { description: 'Kode role sudah ada' } }
      }
    },
    '/roles/{id}': {
      get: {
        tags: ['Roles'], summary: 'Detail role + permission + jumlah user', description: 'Permission: role:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail role' }, 404: { description: 'Role tidak ditemukan' } }
      },
      put: {
        tags: ['Roles'], summary: 'Ubah role', description: 'Permission: role:update. Field `code` bersifat immutable.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            name: { type: 'string' }, description: { type: 'string' }, isActive: { type: 'boolean' }
          }
        }}}},
        responses: { 200: { description: 'Role diperbarui' }, 404: { description: 'Role tidak ditemukan' }, 409: { description: 'Role sistem tidak bisa dinonaktifkan' } }
      },
      delete: {
        tags: ['Roles'], summary: 'Hapus role', description: 'Permission: role:delete. Ditolak kalau role masih dipakai user atau role sistem.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Role dihapus' }, 404: { description: 'Role tidak ditemukan' }, 409: { description: 'Role masih dipakai user / role sistem' } }
      }
    },
    '/roles/{id}/permissions': {
      put: {
        tags: ['Roles'], summary: 'Set ulang permission role', description: 'Permission: role:update. Mengganti semua permission role dengan daftar yang dikirim (untuk halaman matrix). Permission role `super_admin` DIKUNCI (409) — diatur kebijakan sistem: read semua modul + CRUD manajemen akun.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['permissionIds'],
          properties: { permissionIds: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] } }
        }}}},
        responses: { 200: { description: 'Permission role diperbarui' }, 404: { description: 'Role / permission tidak ditemukan' } }
      },
      post: {
        tags: ['Roles'], summary: 'Tambah satu permission ke role', description: 'Permission: role:update',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['permissionId'], properties: { permissionId: { type: 'integer', example: 4 } }
        }}}},
        responses: { 201: { description: 'Permission ditambahkan' }, 404: { description: 'Role / permission tidak ditemukan' }, 409: { description: 'Permission sudah dimiliki role' } }
      }
    },
    '/roles/{id}/permissions/{permissionId}': {
      delete: {
        tags: ['Roles'], summary: 'Lepas permission dari role', description: 'Permission: role:update',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'permissionId', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Permission dilepas' }, 404: { description: 'Role tidak punya permission ini' } }
      }
    },
    '/permissions': {
      get: {
        tags: ['Permissions'], summary: 'List semua permission', description: 'Permission: permission:read atau role:read. Tidak dipaginate karena dipakai untuk matrix role.',
        parameters: [
          { in: 'query', name: 'module', schema: { type: 'string', example: 'role' }, description: 'Filter per module' },
          { in: 'query', name: 'grouped', schema: { type: 'boolean' }, description: 'true = dikelompokkan per module' }
        ],
        responses: { 200: { description: 'Array permission (key = module:action)' } }
      },
      post: {
        tags: ['Permissions'], summary: 'Daftarkan permission baru', description: 'Permission: permission:create. Dipakai saat modul baru dibangun.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['module', 'action', 'label'],
          properties: {
            module: { type: 'string', example: 'project' },
            action: { type: 'string', example: 'create' },
            label: { type: 'string', example: 'Buat construction project' }
          }
        }}}},
        responses: { 201: { description: 'Permission dibuat' }, 409: { description: 'Permission sudah ada' } }
      }
    },
    '/permissions/{id}': {
      delete: {
        tags: ['Permissions'], summary: 'Hapus permission', description: 'Permission: permission:delete. Otomatis dilepas dari semua role.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Permission dihapus' }, 404: { description: 'Permission tidak ditemukan' } }
      }
    },

    // ========================================
    // 2. CONSTRUCTION PROJECTS
    // ========================================
    '/projects/construction': {
      get: {
        tags: ['Construction Projects'], summary: 'List construction projects',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['planned','active','completed','cancelled'] } },
          { $ref: '#/components/parameters/SearchParam' }
        ],
        responses: { 200: { description: 'Paginated list' } }
      },
      post: {
        tags: ['Construction Projects'], summary: 'Buat construction project baru',
        description: 'Permission: project:create. `projectCode` DIBUAT SISTEM (PRJ-000001) lewat counter atomik document_sequences — mengirimnya ditolak 400 (override manual dibuang 15 Okt 2026; migrasi data lama lewat skrip impor). `status` ditolak 400 kalau dikirim: project baru selalu `planned`.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['projectName'],
          properties: {
            projectName: { type: 'string', example: 'Jalan Tol Semarang' },
            clientName: { type: 'string', example: 'PT ABC' },
            location: { type: 'string', example: 'Semarang, Jawa Tengah' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/projects/construction/{id}': {
      get: {
        tags: ['Construction Projects'], summary: 'Detail construction project + sub-projects',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Project detail with sub-projects and progress summary' } }
      },
      put: {
        tags: ['Construction Projects'], summary: 'Update construction project', description: 'Role: admin',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } }
      },
    },
    '/projects/construction/{id}/status': {
      put: {
        tags: ['Construction Projects'], summary: 'Ubah status project',
        description: 'Permission: project:update. Status diubah lewat endpoint SENDIRI supaya tidak pernah jadi efek samping edit data biasa. Transisi sah: planned→active|cancelled, active→planned|completed|cancelled. `completed` dan `cancelled` FINAL. Menutup project (`completed` MAUPUN `cancelled`, sejak 17 Okt 2026) DITOLAK 409 kalau masih ada sub-project berstatus planned/active — batalkan/selesaikan tahapannya dulu. Menutup (`completed`/`cancelled`) membuat arsip `project-summary` (rekap tahapan) dalam transaksi yang sama — 503 kalau storage tidak tersedia, status tidak berubah (L8).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: { status: { type: 'string', enum: ['planned','active','completed','cancelled'] } }
        }}}},
        responses: { 200: { description: 'Status diubah' }, 409: { description: 'Transisi tidak sah / masih ada tahapan terbuka' } }
      }
    },

    // ========================================
    // 2.2 SUB-PROJECTS
    // ========================================
    '/projects/construction/{projectId}/sub-projects': {
      get: {
        tags: ['Sub-Projects'], summary: 'List sub-projects dalam satu construction project',
        parameters: [{ in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Array of sub-projects with progress' } }
      },
      post: {
        tags: ['Sub-Projects'], summary: 'Buat sub-project baru (tahapan + kontrak)',
        description: 'Role: admin. Setiap sub-project punya kontrak terpisah.',
        parameters: [{ in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['subProjectType', 'sequenceOrder', 'targetVolume', 'volumeUnit', 'contractValue'],
          properties: {
            subProjectType: { type: 'string', enum: ['galian','timbunan','line_clearing','aspal'] },
            sequenceOrder: { type: 'integer', example: 1 },
            targetVolume: { type: 'number', example: 1000 },
            dailyTargetVolume: { type: 'number', example: 50 },
            volumeUnit: { type: 'string', example: 'm3' },
            contractValue: { type: 'number', example: 4000000000 },
            contractNo: { type: 'string', example: 'KTR-2026-001' },
            contractDate: { type: 'string', format: 'date' },
            contractStartDate: { type: 'string', format: 'date' },
            contractEndDate: { type: 'string', format: 'date' }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/projects/construction/{projectId}/sub-projects/{id}': {
      get: {
        tags: ['Sub-Projects'], summary: 'Detail sub-project + progress',
        parameters: [
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Sub-project detail with progress calculation' } }
      },
      put: {
        tags: ['Sub-Projects'], summary: 'Update sub-project / kontrak', description: 'Role: admin',
        parameters: [
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } }
      }
    },
    '/projects/construction/{projectId}/sub-projects/{subProjectId}/progress': {
      get: {
        tags: ['Sub-Projects'], summary: 'Progress billing satu sub-project',
        parameters: [
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Progress + billing calculation', content: { 'application/json': { schema: {
          type: 'object', properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: {
              subProjectId: { type: 'integer' }, subProjectType: { type: 'string' }, status: { type: 'string' },
              targetVolume: { type: 'number' }, volumeUnit: { type: 'string' },
              contractValue: { type: 'number' },
              validatedVolume: { type: 'number', description: 'HANYA baris status=validated' },
              billableProgress: { type: 'number', description: 'Persen dari validatedVolume. Inilah yang dibaca modul Income.' },
              billableAmount: { type: 'number', description: 'billableProgress/100 × contractValue' },
              pendingVolume: { type: 'number', description: 'status=submitted, BELUM diperiksa Admin' },
              pendingProgress: { type: 'number', description: 'Sengaja dipisah — tidak pernah ikut menghitung uang' },
              rejectedVolume: { type: 'number' },
              remainingVolume: { type: 'number' },
              logCount: { type: 'object', properties: { validated: { type: 'integer' }, submitted: { type: 'integer' }, rejected: { type: 'integer' } } },
              paidAmount: { type: 'number', nullable: true, description: 'Selalu null sampai modul Income ada. null, bukan 0 — 0 terbaca \"sudah ditagih, belum dibayar\".' }
            }}
          }
        }}}}}
      }
    },

    '/projects/construction/{projectId}/sub-projects/{id}/status': {
      put: {
        tags: ['Sub-Projects'], summary: 'Ubah status tahapan',
        description: 'Permission: sub-project:update. Mengaktifkan tahapan yang pendahulunya belum selesai BERHASIL, tapi response memuat `sequenceWarning` berisi daftar tahapan pendahulu yang masih terbuka — urutan tidak diblokir karena ERD menyebut "atau berdasarkan kesepakatan kontrak baru". Yang DIBLOKIR (409) adalah KEBERSAMAAN: dalam satu project hanya satu tahapan boleh `active` — aktifkan tahapan berikutnya setelah yang aktif ditutup (dikonfirmasi 14 Okt 2026). Menutup tahapan DITOLAK 409 kalau masih ada alat teralokasi. **Tahapan selesai = terkunci (L8, dibangun bersama Berkas Project):** `completed` DAN `cancelled` ditolak 409 selama masih ada urusan terbuka — progress `submitted`, request material `submitted`/`waiting_finance_approval`, request alat `submitted`/`equipment_review`, delivery aktif tanpa penerimaan aktif, alokasi `assigned`; pesan menyebut jumlah per jenis. Sesudahnya semua jalur tulis data tahapan menolak 409: ubah/validasi progress, catat/batal mutasi stok, catat/batal penerimaan, ganti surat jalan/batal delivery, validasi/biaya/approve request material, catat/batal jam kerja (sudah sejak 17 Okt). **Arsip penutupan:** di request yang sama, sebelum status berubah, sistem menyusun XLSX `stage-progress`, `stage-equipment`, `stage-material` dari data tahapan (baris kepala: "Diarsipkan saat penutupan <waktu> oleh <user>", status akhir), mengunggahnya, lalu status + baris arsip ditulis dalam SATU transaksi; transaksi gagal → file dihapus. Storage tidak tersedia → 503 dan tahapan TIDAK ditutup (coba lagi). Request ini lebih lambat (±1–3 detik).',
        parameters: [
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: { status: { type: 'string', enum: ['planned','active','completed','cancelled'] } }
        }}}},
        responses: { 200: { description: 'Status diubah. Berisi `sequenceWarning` (null kalau urutannya benar).' },
          409: { description: 'Transisi tidak sah / masih ada alat teralokasi / masih ada urusan terbuka (progress, request, delivery)' },
          503: { description: 'Storage belum dikonfigurasi/tidak tersedia — arsip tidak bisa dibuat, status tidak berubah' } }
      }
    },

    // ========================================
    // 2.3 DAILY PROGRESS LOGS
    // ========================================
    '/projects/sub-projects/{subProjectId}/progress-logs': {
      get: {
        tags: ['Daily Progress'], summary: 'List progress harian',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }
        ],
        responses: { 200: { description: 'Paginated daily progress logs' } }
      },
      post: {
        tags: ['Daily Progress'], summary: 'Input progress harian', description: 'Role: lapangan',
        parameters: [{ in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['progressDate', 'realizedVolume'],
          properties: {
            progressDate: { type: 'string', format: 'date', example: '2026-09-15' },
            realizedVolume: { type: 'number', example: 50 },
            notes: { type: 'string' },
            fieldCondition: { type: 'object', properties: {
              weatherMorning: { type: 'string' }, weatherAfternoon: { type: 'string' },
              fieldConditionNotes: { type: 'string' }, incidentNotes: { type: 'string' }
            }}
          }
        }}}},
        responses: {
          201: { description: 'Created. Response memuat `subProjectProgress` supaya lapangan langsung lihat dampaknya ke progress tahapan.' },
          409: { description: 'Tahapan belum aktif / tanggal itu sudah dicatat' }
        }
      }
    },
    '/projects/sub-projects/{subProjectId}/progress-logs/{id}': {
      get: {
        tags: ['Daily Progress'], summary: 'Detail satu progress harian',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Detail + fieldCondition' } }
      },
      put: {
        tags: ['Daily Progress'], summary: 'Ubah progress harian',
        description: 'Permission: progress:create. DITOLAK 409 kalau log sudah `validated` — angkanya sudah jadi dasar tagihan. Admin harus mencabut validasinya dulu. `progressDate` tidak bisa diubah (bagian identitas unique barisnya).',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            realizedVolume: { type: 'number' }, notes: { type: 'string' },
            fieldCondition: { type: 'object', description: 'Di-upsert — boleh dilengkapi belakangan' }
          }
        }}}},
        responses: { 200: { description: 'Updated' }, 409: { description: 'Log sudah divalidasi' } }
      }
    },
    '/projects/sub-projects/{subProjectId}/progress-logs/{id}/validate': {
      put: {
        tags: ['Daily Progress'], summary: 'Validasi / tolak progress harian (GERBANG TAGIHAN)',
        description: 'Permission: progress:validate — DIPEGANG ADMIN, sengaja TIDAK diberikan ke role lapangan: yang mencatat tidak memvalidasi catatannya sendiri. Inilah gerbang yang memisahkan catatan lapangan dari angka yang boleh menagih klien: hanya baris `validated` yang masuk `billableAmount`. Transisi sah: submitted→validated|rejected, validated→submitted (cabut validasi), rejected→submitted. `notes` disimpan di `validationNotes` (catatan keputusan TERAKHIR): **WAJIB saat `rejected`**, opsional selainnya, dan ditimpa setiap transisi — kembali ke `submitted` tanpa catatan mengosongkannya. Aksi bersamaan pada log yang sama: satu 200, satu 409. Log `submitted` muncul di antrean `GET /approval-queue` (sourceType `progress_log`).',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: { status: { type: 'string', enum: ['submitted','validated','rejected'] }, notes: { type: 'string', description: 'Wajib saat rejected' } }
        }}}},
        responses: {
          200: { description: 'Status diubah. Response memuat `subProjectProgress` — dampak langsung ke angka tagihan.' },
          400: { description: 'Status tidak valid / menolak tanpa `notes`' },
          403: { description: 'Role lapangan — pencatat tidak boleh memvalidasi' },
          409: { description: 'Transisi tidak sah / kalah dari aksi bersamaan' }
        }
      }
    },

    // ========================================
    // 2.4 EXTERNAL RENTAL
    // ========================================
    '/projects/external-rental': {
      get: { tags: ['External Rental'], summary: 'List external rental projects', responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['External Rental'], summary: 'Buat external rental project', description: 'Role: admin',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['rentalProjectName'],
          properties: {
            rentalProjectName: { type: 'string' },
            clientName: { type: 'string' }, contractNo: { type: 'string' },
            billingMethod: { type: 'string', enum: ['hourly','daily','monthly','contract'] },
            contractStartDate: { type: 'string', format: 'date' }, contractEndDate: { type: 'string', format: 'date' }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/projects/external-rental/{id}': {
      get: { tags: ['External Rental'], summary: 'Detail', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: { tags: ['External Rental'], summary: 'Update', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
    },
    '/projects/external-rental/{id}/status': {
      put: {
        tags: ['External Rental'], summary: 'Ubah status project', description: 'Permission: project:update. Tidak ada hard delete — project dibatalkan lewat status `cancelled`, yang bersifat FINAL. Menutup (`completed`/`cancelled`) ditolak 409 selama masih ada request alat `submitted`/`equipment_review` (L8). Sesudahnya jam kerja, pembatalannya, dan operator unit terkunci (409). Menutup membuat arsip `rental-timesheet` — satu XLSX per pool item yang pernah terikat unit — dalam transaksi yang sama (503 kalau storage tidak tersedia, status tidak berubah).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: { status: { type: 'string', enum: ['planned','active','completed','cancelled'] } } } }}},
        responses: { 200: { description: 'Status diubah' }, 409: { description: 'Transisi tidak sah' } }
      }
    },

    // ========================================
    // 2.5 EXTERNAL SUPPLY
    // ========================================
    '/projects/external-supply': {
      get: { tags: ['External Supply'], summary: 'List external supply projects', responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['External Supply'], summary: 'Buat external supply project', description: 'Role: admin',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['supplyProjectName'],
          properties: {
            supplyProjectName: { type: 'string' },
            clientName: { type: 'string' }, contractNo: { type: 'string' },
            contractStartDate: { type: 'string', format: 'date' }, contractEndDate: { type: 'string', format: 'date' },
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/projects/external-supply/{id}': {
      get: { tags: ['External Supply'], summary: 'Detail', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: { tags: ['External Supply'], summary: 'Update', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
    },
    '/projects/external-supply/{id}/status': {
      put: {
        tags: ['External Supply'], summary: 'Ubah status project', description: 'Permission: project:update. Tidak ada hard delete — project dibatalkan lewat status `cancelled`, yang bersifat FINAL. Menutup (`completed`/`cancelled`) ditolak 409 selama masih ada request material `submitted`/`waiting_finance_approval` atau delivery aktif tanpa penerimaan aktif (L8). Sesudahnya validasi/approve request material, ganti surat jalan/batal delivery, dan catat/batal penerimaan terkunci (409). Menutup membuat arsip `supply-deliveries` dalam transaksi yang sama (503 kalau storage tidak tersedia, status tidak berubah).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: { status: { type: 'string', enum: ['planned','active','completed','cancelled'] } } } }}},
        responses: { 200: { description: 'Status diubah' }, 409: { description: 'Transisi tidak sah' } }
      }
    },

    // ========================================
    // 2.6 EQUIPMENT POOL & ALLOCATIONS
    // ========================================
    '/projects/equipment-pools': {
      get: {
        tags: ['Equipment Pool & Material Pool'], summary: 'List equipment pool', description: 'Permission: equipment-pool:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'ownerType', schema: { type: 'string', enum: ['construction_project','external_rental_project'] } },
          { in: 'query', name: 'constructionProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'externalRentalProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['draft','active','closed','cancelled'] } }
        ],
        responses: { 200: { description: 'Paginated list' } }
      },
      post: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Buat equipment pool',
        description: 'Permission: equipment-pool:create (Divisi Alat). `poolCode` DIBUAT SISTEM (POOL-000001). Generic untuk construction_project ATAU external_rental_project — isi FK yang sesuai owner_type, CHECK constraint database menolak kombinasi lain.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['ownerType'],
          properties: {
            ownerType: { type: 'string', enum: ['construction_project','external_rental_project'] },
            constructionProjectId: { type: 'integer' }, externalRentalProjectId: { type: 'integer' }
          }
        }}}},
        responses: { 201: { description: 'Created' }, 400: { description: 'FK owner tidak diisi sesuai ownerType' } }
      }
    },
    '/projects/equipment-pools/{id}': {
      get: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Detail pool + daftar item',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail dengan array items' } }
      }
    },
    '/projects/equipment-pools/{id}/status': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Ubah status pool', description: 'Permission: equipment-pool:update. Menutup/membatalkan DITOLAK 409 kalau masih ada item berstatus assigned.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['draft','active','closed','cancelled'] } }
        }}}},
        responses: { 200: { description: 'Status diubah' }, 409: { description: 'Transisi tidak sah / masih ada item assigned' } }
      }
    },
    '/projects/equipment-pools/{id}/items': {
      post: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Tambah item ke pool',
        description: 'Permission: equipment-pool:update (Divisi Alat). Jalur MANUAL, di luar Request Alat (item hasil approval Request Alat dibuat sistem, dengan `equipmentRequestItemId` terisi). Status awal `available`, MELEWATI `pending` dari enum ERD. `equipmentItemId` opsional: boleh "TBD" (unit ditentukan belakangan lewat bind-unit). Unit yang dikirim wajib aktif, tidak maintenance/retired, dan tidak sedang terikat pool item lain.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentTypeId'],
          properties: {
            equipmentTypeId: { type: 'integer' },
            equipmentItemId: { type: 'integer', description: 'Opsional — kosongkan untuk unit TBD' },
            requestedQuantity: { type: 'integer', default: 1 }
          }
        }}}},
        responses: { 201: { description: 'Created' }, 409: { description: 'Unit tidak aktif / maintenance / retired / sudah terikat pool item lain' } }
      }
    },
    '/projects/equipment-pools/{id}/items/{itemId}/bind-unit': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Ikat unit spesifik ke pool item TBD',
        description: 'Permission: equipment-pool:update. Hanya untuk pool item yang belum punya equipmentItemId dan masih berstatus available.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentItemId'], properties: { equipmentItemId: { type: 'integer' } }
        }}}},
        responses: { 200: { description: 'Updated' }, 409: { description: 'Sudah terikat unit / status bukan available' } }
      }
    },
    '/projects/equipment-pools/{id}/items/{itemId}/operator': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Set operator unit rental',
        description: 'Permission: equipment-pool:update (Divisi Alat). Satu nama operator per unit per kontrak rental — dasar timesheet & tagihan. `operatorName` WAJIB dikirim: teks (di-trim, maks 150) atau `null`/string kosong untuk menghapus. Hanya pool milik external rental project (400 untuk pool konstruksi). Terkunci (409) kalau kontrak rental `completed`/`cancelled` atau pool item `rejected`/`cancelled`. Sejak 17 Okt 2026 — menggantikan operator yang dititipkan FE di notes Request Alat. Nilainya tampil sebagai `operatorName` di setiap pool item.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['operatorName'], properties: { operatorName: { type: 'string', nullable: true, maxLength: 150, example: 'Ahmad Suganda' } }
        }}}},
        responses: {
          200: { description: 'Pool item dengan `operatorName` terbaru' },
          400: { description: 'operatorName tidak dikirim / lebih dari 150 karakter / pool milik construction project' },
          404: { description: 'Pool atau pool item tidak ditemukan' },
          409: { description: 'Kontrak rental ditutup / pool item rejected atau cancelled' }
        }
      }
    },
    '/projects/equipment-pools/{id}/items/{itemId}/close': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Tutup pool item manual (completed/cancelled)',
        description: 'Permission: equipment-pool:update. DITOLAK 409 kecuali status saat ini "available" — item yang "assigned" harus diselesaikan lewat alokasinya dulu, bukan ditutup langsung.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['completed','cancelled'] } }
        }}}},
        responses: { 200: { description: 'Updated' }, 409: { description: 'Status bukan available' } }
      }
    },
    '/projects/material-pools': {
      get: {
        tags: ['Equipment Pool & Material Pool'], summary: 'List material pool', description: 'Permission: material-pool:read',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'ownerType', schema: { type: 'string', enum: ['construction_project', 'external_supply_project'] } },
          { in: 'query', name: 'constructionProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'externalSupplyProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['draft', 'active', 'closed', 'cancelled'] } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Buat material pool',
        description: 'Permission: material-pool:create (Admin). Generic seperti equipment pool: tepat satu FK sesuai ownerType (dijaga CHECK). `poolCode` dibuat sistem (MPL-000001). Tidak ada supplier di header pool — supplier milik delivery (keputusan D2).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ownerType'], properties: {
          ownerType: { type: 'string', enum: ['construction_project', 'external_supply_project'] },
          constructionProjectId: { type: 'integer' }, externalSupplyProjectId: { type: 'integer' },
        } } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'FK owner salah/ganda' }, 404: { description: 'Owner tidak ditemukan' } },
      },
    },
    '/projects/material-pools/{id}': {
      get: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Detail material pool + daftar material',
        description: 'Permission: material-pool:read. Satu baris per jenis material. Tiap item memuat `unit` dari jenis materialnya — tampilkan di samping setiap angka kuantitas. Tidak ada penghitung total_* (keputusan D3): jumlahan request/delivery/receipt dihitung saat dibaca begitu modulnya ada.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } },
      },
    },
    '/projects/material-pools/{id}/status': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Ubah status material pool',
        description: 'Permission: material-pool:update. draft → active/cancelled, active → closed/cancelled; closed & cancelled final. Atomik: aksi bersamaan yang kalah 409.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['draft', 'active', 'closed', 'cancelled'] } } } } } },
        responses: { 200: { description: 'Diubah' }, 409: { description: 'Transisi tidak sah' } },
      },
    },
    '/projects/material-pools/{id}/items': {
      post: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Tambah material ke pool',
        description: 'Permission: material-pool:update. Satu jenis material sekali per pool (409 kalau sudah ada). Jenis material harus aktif. `unit` DITOLAK 400 — satuan milik jenis material (keputusan D1). Pool harus draft/active.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['materialTypeId'], properties: { materialTypeId: { type: 'integer' }, notes: { type: 'string' } } } } } },
        responses: { 201: { description: 'Ditambahkan' }, 409: { description: 'Sudah ada / material nonaktif / pool tertutup' } },
      },
    },
    '/projects/material-pools/{id}/items/{itemId}': {
      delete: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Hapus material dari pool',
        description: 'Permission: material-pool:update. Pool harus draft/active. Mulai RM-2, material yang sudah dirujuk request/inventori tidak bisa dihapus.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }, { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Dihapus' } },
      },
    },
    '/projects/sub-projects/{subProjectId}/allocations': {
      get: {
        tags: ['Equipment Pool & Material Pool'], summary: 'List alokasi alat pada satu tahapan', description: 'Permission: allocation:read',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['assigned','completed','returned','cancelled'] } }
        ],
        responses: { 200: { description: 'Array alokasi' } }
      },
      post: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Alokasikan pool item ke tahapan (SUMBER KEBENARAN PENUGASAN)',
        description: 'Permission: allocation:create (Divisi Alat). Pool item WAJIB berstatus available DAN sudah terikat unit (409 kalau belum — alokasi tanpa unit tidak akan pernah bisa diikat, karena bind-unit hanya menerima pool item available), tahapan WAJIB active. Pool item dan alokasi bergerak BERSAMA dalam satu transaksi — pool item langsung jadi `assigned` di saat yang sama. `equipmentItemId` KOLOM TERKELOLA SISTEM, diturunkan dari pool item.',
        parameters: [{ in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentPoolItemId'], properties: { equipmentPoolItemId: { type: 'integer' } }
        }}}},
        responses: { 201: { description: 'Created' }, 409: { description: 'Pool item bukan available / tahapan tidak active' } }
      }
    },
    '/projects/sub-projects/{subProjectId}/allocations/{id}/receive': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Konfirmasi unit diterima di lokasi',
        description: 'Permission: allocation:receive — DIPEGANG LAPANGAN, terpisah dari allocation:create (Divisi Alat) yang mengalokasikan. BUKAN perubahan status (tetap `assigned`) — hanya mengisi receivedAt/receivedBy, menggantikan nilai enum `received_at_site` yang dihapus dari ERD.',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'Updated' }, 409: { description: 'Status bukan assigned / sudah pernah dikonfirmasi' } }
      }
    },
    '/projects/sub-projects/{subProjectId}/allocations/{id}/status': {
      put: {
        tags: ['Equipment Pool & Material Pool'], summary: 'Tutup alokasi: completed, returned, atau cancelled',
        description: 'Permission: allocation:update (Divisi Alat). Pool item dibebaskan kembali ke `available` dalam transaksi yang SAMA, pada ketiga status tujuan — satu pool item bisa dipakai beberapa alokasi berurutan (1:N pada ERD). Semua tiga status bersifat FINAL untuk alokasi tersebut.',
        parameters: [
          { in: 'path', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['completed','returned','cancelled'] } }
        }}}},
        responses: { 200: { description: 'Updated' }, 409: { description: 'Transisi tidak sah' } }
      }
    },

    // ========================================
    // 3. DIVISI ALAT
    // ========================================
    '/equipment/types': {
      get: {
        tags: ['Equipment Types'], summary: 'List jenis alat', description: 'Permission: equipment:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { $ref: '#/components/parameters/SearchParam' },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated list jenis alat + itemCount + nextAssetCode (preview kode unit berikutnya)', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Equipment Types'], summary: 'Tambah jenis alat', description: 'Role: divisi_alat. Permission: equipment:create',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['typeCode', 'typeName'],
          properties: {
            typeCode: { type: 'string', example: 'EXC', description: 'Huruf, angka, underscore, strip. Unik & immutable.' },
            typeName: { type: 'string', example: 'Excavator' },
            description: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi gagal' }, 409: { description: 'typeCode sudah ada' } }
      }
    },
    '/equipment/types/{id}': {
      get: {
        tags: ['Equipment Types'], summary: 'Detail jenis alat', description: 'Permission: equipment:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail' }, 404: { description: 'Tidak ditemukan' } }
      },
      put: {
        tags: ['Equipment Types'], summary: 'Update jenis alat', description: 'Permission: equipment:update. Field `typeCode` immutable.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: {
          type: 'object', properties: { typeName: { type: 'string' }, description: { type: 'string' }, isActive: { type: 'boolean' } }
        }}}},
        responses: { 200: { description: 'Updated' }, 404: { description: 'Tidak ditemukan' } }
      },
      delete: {
        tags: ['Equipment Types'], summary: 'Hapus jenis alat', description: 'Permission: equipment:delete. Ditolak kalau masih dipakai unit alat — nonaktifkan saja.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Deleted' }, 409: { description: 'Masih dipakai unit alat' } }
      }
    },
    '/equipment/items': {
      get: {
        tags: ['Equipment Items'], summary: 'List unit alat', description: 'Permission: equipment:read. Setiap baris memuat field turunan `assignment` (backlog C3): penugasan alat dibaca dari sub_project_equipment_allocations / equipment_pool_items, BUKAN dari current_status — current_status murni KONDISI alat. Bernilai null kalau alat sedang tidak ditugaskan.', description: 'Permission: equipment:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'typeId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['operational','maintenance','retired'] } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
          { $ref: '#/components/parameters/SearchParam' }
        ],
        responses: { 200: { description: 'Paginated list', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Equipment Items'], summary: 'Tambah unit alat', description: 'Role: divisi_alat. Permission: equipment:create. `assetCode` DIBUAT OTOMATIS oleh sistem dengan format SSB-{typeCode}-{NNN} (mis. SSB-EXC-001) — kiriman manual ditolak 400. Status awal `operational` dan otomatis tercatat di status log.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentTypeId'],
          properties: {
            equipmentTypeId: { type: 'integer' },
            plateNumber: { type: 'string', description: 'Nullable — hanya alat berplat (dump truck dsb) yang mengisinya' }, serialNumber: { type: 'string' },
            brand: { type: 'string' }, model: { type: 'string' },
            manufactureYear: { type: 'integer', example: 2019 },
            defaultHourlyRate: { type: 'number', example: 500000, description: 'Default rate income alat; modul Income tetap pakai rate_snapshot sendiri' },
            rateNotes: { type: 'string' }, notes: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created, assetCode terisi otomatis' }, 400: { description: 'Validasi gagal' }, 400: { description: 'Validasi gagal / assetCode dikirim' }, 404: { description: 'Jenis alat tidak ditemukan' }, 409: { description: 'assetCode sudah dipakai / jenis alat nonaktif' } }
      }
    },
    '/equipment/items/{id}': {
      get: {
        tags: ['Equipment Items'], summary: 'Detail unit alat + status history + ringkasan workhour', description: 'Permission: equipment:read. statusHistory berisi 10 perubahan status terakhir.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail + statusHistory + workhourSummary' }, 404: { description: 'Tidak ditemukan' } }
      },
      put: {
        tags: ['Equipment Items'], summary: 'Update unit alat', description: 'Permission: equipment:update. `assetCode` tidak bisa diubah (ditolak 400). `currentStatus` TIDAK bisa diubah di sini — pakai PUT /equipment/items/{id}/status. `rateUpdatedAt` otomatis terisi saat defaultHourlyRate berubah.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            equipmentTypeId: { type: 'integer' }, assetCode: { type: 'string' },
            plateNumber: { type: 'string' }, serialNumber: { type: 'string' },
            brand: { type: 'string' }, model: { type: 'string' },
            manufactureYear: { type: 'integer' }, defaultHourlyRate: { type: 'number' },
            rateNotes: { type: 'string' }, notes: { type: 'string' }, isActive: { type: 'boolean' }
          }
        }}}},
        responses: { 200: { description: 'Updated' }, 400: { description: 'assetCode dikirim' }, 404: { description: 'Tidak ditemukan' } }
      },
      delete: {
        tags: ['Equipment Items'], summary: 'Soft delete unit alat', description: 'Permission: equipment:delete. Set isActive=false (penghapusan administratif, bukan penanda alat rusak/pensiun). Ditolak kalau alat sedang `maintenance`.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Dinonaktifkan' }, 409: { description: 'Alat sedang terpakai / sudah nonaktif' } }
      }
    },
    '/equipment/items/{id}/status': {
      put: {
        tags: ['Equipment Items'], summary: 'Ubah status alat', description: 'Permission: equipment:update. Satu-satunya jalur ubah status; setiap perubahan ditulis ke equipment_status_logs. `maintenance` mencakup rusak, perbaikan, dan perawatan — penyebabnya dibedakan lewat `sourceType` (damage_log vs maintenance_record). Kolom ini memuat KONDISI alat saja. Penugasan proyek tidak ada di sini — sumbernya sub_project_equipment_allocations pada modul Project.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: {
            status: { type: 'string', enum: ['operational','maintenance','retired'] },
            notes: { type: 'string', example: 'Masuk bengkel untuk servis 500 jam' },
            sourceType: { type: 'string', example: 'manual', description: 'equipment_request | workhour | maintenance_record | damage_log | manual. Default: manual' },
            sourceId: { type: 'integer', description: 'ID dokumen sumber kalau perubahan status berasal dari modul lain' }
          }
        }}}},
        responses: { 200: { description: 'Status diubah' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Status sama dengan sekarang / alat nonaktif' } }
      }
    },
    '/equipment/items/{id}/status-logs': {
      get: {
        tags: ['Equipment Items'], summary: 'Riwayat perubahan status alat', description: 'Permission: equipment:read',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' }
        ],
        responses: { 200: { description: 'Paginated status logs', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      }
    },
    '/equipment/workhour-logs': {
      post: {
        tags: ['Workhour Logs'], summary: 'Catat jam kerja alat', description: 'Role: lapangan. Permission: workhour:create. Menambah total_workhour alat DAN menggerakkan hitung mundur maintenance setting aktif, dalam satu transaksi. Response memuat `maintenanceImpact`. DITOLAK kalau alat berstatus `maintenance` atau `retired`. KONTEKS WAJIB per sourceType (backlog C1, berubah 4 Okt 2026 — `projectId`/`subProjectId` SUDAH TIDAK DIPAKAI dan ditolak 400): `internal_project` wajib `subProjectEquipmentAllocationId` dan dilarang mengirim `equipmentPoolItemId`; `external_rental` wajib `equipmentPoolItemId` dari pool milik external rental project dan dilarang mengirim allocation id; `manual_adjustment` tanpa konteks, dan HANYA di sini `equipmentItemId` wajib diisi. Untuk dua sourceType pertama `equipmentItemId` adalah KOLOM TERKELOLA SISTEM yang diturunkan dari alokasi/pool item — mengirimnya dengan nilai tidak cocok ditolak 400, kosongkan saja. Konteks yang belum terikat unit spesifik ditolak 409. **Sejak 17 Okt 2026:** (1) jam boleh dicatat selama PEKERJAANNYA masih berjalan — `internal_project`: alokasi `assigned`/`completed`/`returned` DAN tahapan `active` (catatan terlambat setelah alat ditarik tetap bisa); `external_rental`: pool item `available`/`completed` DAN kontrak rental `active`. Tahapan/kontrak yang ditutup = terkunci (409). (2) `startedAt` & `stoppedAt` berpasangan; kalau diisi, `totalWorkhour` WAJIB = rentang − jeda (toleransi 0,01 jam) — juga dijaga CHECK database. (3) Batas 24 jam/alat/hari dihitung setelah baris alat dikunci, jadi input bersamaan tidak bisa sama-sama lolos. (4) Log tidak bisa diubah — salah input dibatalkan lewat `PUT /equipment/workhour-logs/{id}/void` lalu dicatat ulang. Untuk timesheet rental pakai `POST /equipment/workhour-logs/rental-sheet` (semua sesi satu transaksi).',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['workDate', 'totalWorkhour', 'sourceType'],
          properties: {
            sourceType: { type: 'string', enum: ['internal_project', 'external_rental', 'manual_adjustment'] },
            subProjectEquipmentAllocationId: { type: 'integer', description: 'WAJIB untuk sourceType internal_project' },
            equipmentPoolItemId: { type: 'integer', description: 'WAJIB untuk sourceType external_rental' },
            equipmentItemId: { type: 'integer', description: 'WAJIB untuk manual_adjustment. Untuk sourceType lain diturunkan sistem — kosongkan.' },
            workDate: { type: 'string', format: 'date', example: '2026-10-03' },
            startedAt: { type: 'string', format: 'date-time' }, stoppedAt: { type: 'string', format: 'date-time' },
            pausedDurationMinutes: { type: 'integer', default: 0, description: 'Jeda yang tidak dihitung jam kerja. Tidak boleh melebihi rentang startedAt-stoppedAt.' },
            totalWorkhour: { type: 'number', example: 8, description: 'Lebih dari 0, maksimal 24. Akumulasi per alat per hari juga dibatasi 24 jam. Kalau startedAt/stoppedAt diisi, wajib = rentang − jeda.' },
            workSession: { type: 'string', enum: ['pagi', 'siang', 'overtime'], nullable: true, description: 'HANYA untuk external_rental (selain itu 400). Opsional di endpoint ini; satu sesi per pool item per tanggal (409 kalau sudah ada).' },
            description: { type: 'string' }
          }
        }}}},
        responses: {
          201: { description: 'Created. Response berisi data log + `maintenanceImpact`: array setting yang counternya bergerak, masing-masing dengan settingId, aspectCode, remainingValue, status, dan statusChanged.' },
          400: { description: 'Validasi gagal / tanggal di masa depan / konteks tidak sesuai sourceType / equipmentItemId tidak cocok konteksnya / projectId-subProjectId dikirim (sudah tidak dipakai)' },
          404: { description: 'Unit alat, alokasi, atau pool item tidak ditemukan' },
          409: { description: 'Alat nonaktif / maintenance / retired / total jam melebihi 24 / alokasi cancelled / tahapan atau kontrak rental sudah ditutup / pool item tidak pernah jalan / konteks belum terikat unit spesifik / sesi sudah tercatat' }
        }
      }
    },
    '/equipment/workhour-logs/rental-sheet': {
      post: {
        tags: ['Workhour Logs'], summary: 'Catat timesheet rental satu unit satu tanggal (1–3 sesi)',
        description: 'Permission: workhour:create. Semua sesi masuk dalam SATU transaksi — satu gagal, semua batal (menggantikan beberapa POST terpisah). `totalWorkhour` per sesi DIHITUNG SISTEM dari `stoppedAt − startedAt − pausedDurationMinutes`; mengirimnya ditolak 400. Sesi dikirim apa adanya seperti dipilih di form (tidak ditebak dari jam). Aturan konteks sama dengan POST /equipment/workhour-logs untuk external_rental.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentPoolItemId', 'workDate', 'sessions'],
          properties: {
            equipmentPoolItemId: { type: 'integer', description: 'Pool item milik external rental project, sudah terikat unit' },
            workDate: { type: 'string', format: 'date', example: '2026-10-06' },
            sessions: {
              type: 'array', minItems: 1, maxItems: 3,
              items: {
                type: 'object', required: ['workSession', 'startedAt', 'stoppedAt'],
                properties: {
                  workSession: { type: 'string', enum: ['pagi', 'siang', 'overtime'] },
                  startedAt: { type: 'string', format: 'date-time', example: '2026-10-06T01:00:00.000Z' },
                  stoppedAt: { type: 'string', format: 'date-time', example: '2026-10-06T05:00:00.000Z' },
                  pausedDurationMinutes: { type: 'integer', default: 0 },
                  description: { type: 'string' }
                }
              }
            }
          }
        }}}},
        responses: {
          201: { description: '`data.logs` (log per sesi) + `data.maintenanceImpact`' },
          400: { description: 'Sesi ganda dalam satu kiriman / jam bertumpuk / jeda melebihi rentang / jam bersih 0 / totalWorkhour dikirim / pool item milik construction project' },
          404: { description: 'Pool item tidak ditemukan' },
          409: { description: 'Sesi sudah tercatat untuk tanggal itu (batalkan dulu) / kontrak tidak active / pool item tidak pernah jalan / alat nonaktif-maintenance-retired / melebihi 24 jam' }
        }
      }
    },
    '/equipment/workhour-logs/{id}/void': {
      put: {
        tags: ['Workhour Logs'], summary: 'Batalkan log jam kerja yang salah input',
        description: 'Permission: workhour:update (Lapangan, Divisi Alat). Log tidak pernah diubah atau dihapus: koreksi = batalkan lalu catat ulang. Dalam satu transaksi: log ditandai `isVoided` (+ alasan, siapa, kapan), `total_workhour` alat dikurangi, dan counter servis dikurangi HANYA pada setting aktif yang mulai menghitung sebelum log itu dibuat (`counterStartedAt`) — jam yang sudah "terhapus" oleh servis tidak dikurangi dua kali. Ditolak 409 kalau tahapan/kontrak rental pemilik log sudah ditutup. `manual_adjustment` selalu bisa dibatalkan.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['reason'], properties: { reason: { type: 'string', example: 'Salah ketik jam selesai' } }
        }}}},
        responses: {
          200: { description: 'Log yang sudah dibatalkan + `maintenanceImpact` (setting yang counternya ditarik)' },
          400: { description: 'Alasan kosong' },
          404: { description: 'Log tidak ditemukan' },
          409: { description: 'Sudah dibatalkan / tahapan atau kontrak sudah ditutup' }
        }
      }
    },
    '/equipment/items/{itemId}/workhour-logs': {
      get: {
        tags: ['Workhour Logs'], summary: 'List workhour per alat', description: 'Permission: workhour:read. Response menyertakan `summary.totalWorkhourInRange` untuk seluruh rentang filter, bukan hanya halaman aktif.',
        parameters: [
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'sourceType', schema: { type: 'string', enum: ['internal_project', 'external_rental', 'manual_adjustment'] } },
          { in: 'query', name: 'includeVoided', schema: { type: 'boolean', default: false }, description: 'Default log yang dibatalkan TIDAK ditampilkan. `summary` tidak pernah menjumlahkannya.' }
        ],
        responses: { 200: { description: 'Paginated workhour logs + summary. Tiap log memuat `workSession`, `isVoided`, `voidReason`, `voidedAt`, `voidedBy`.' }, 404: { description: 'Unit alat tidak ditemukan' } }
      }
    },
    '/equipment/maintenance/aspects': {
      get: {
        tags: ['Maintenance'], summary: 'List aspek maintenance', description: 'Permission: maintenance:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { $ref: '#/components/parameters/SearchParam' },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated list aspek + settingCount', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Maintenance'], summary: 'Tambah aspek maintenance', description: 'Role: divisi_alat. Permission: maintenance:create. SEMUA threshold berbasis JAM KERJA alat — kolom `unit` tidak ada. Ambang TIDAK diatur di aspek: `defaultThresholdValue` ditolak 400 (sejak 16 Okt 2026 ambang per jenis alat — lihat /equipment/types/{typeId}/maintenance-thresholds/{aspectId}).',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['aspectCode', 'aspectName'],
          properties: {
            aspectCode: { type: 'string', example: 'OLI-MSN', description: 'Unik dan immutable' },
            aspectName: { type: 'string', example: 'Ganti Oli Mesin' },
            warningLeadValue: { type: 'number', example: 50, default: 50, description: 'Sisa jam saat status berubah jadi warning. Default 50.' },
            description: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi gagal' }, 409: { description: 'aspectCode sudah ada' } }
      }
    },
    '/equipment/maintenance/aspects/{id}': {
      get: {
        tags: ['Maintenance'], summary: 'Detail aspek maintenance', description: 'Permission: maintenance:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail' }, 404: { description: 'Tidak ditemukan' } }
      },
      put: {
        tags: ['Maintenance'], summary: 'Update aspek maintenance', description: 'Permission: maintenance:update. `aspectCode` immutable. Mengubah `warningLeadValue` otomatis menghitung ulang status SEMUA setting yang memakai aspek ini.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            aspectName: { type: 'string' },
            warningLeadValue: { type: 'number' }, description: { type: 'string' }, isActive: { type: 'boolean' }
          }
        }}}},
        responses: { 200: { description: 'Updated' }, 400: { description: 'aspectCode dikirim / validasi gagal' }, 404: { description: 'Tidak ditemukan' } }
      },
      delete: {
        tags: ['Maintenance'], summary: 'Hapus aspek maintenance', description: 'Permission: maintenance:delete. Ditolak kalau masih berlaku untuk jenis alat atau dipakai setting alat — nonaktifkan saja.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Deleted' }, 409: { description: 'Masih dipakai setting' } }
      }
    },
    '/equipment/maintenance-settings': {
      get: {
        tags: ['Maintenance'], summary: 'Dashboard setting maintenance lintas alat', description: 'Permission: maintenance:read. Dipakai untuk daftar "alat yang perlu servis". Urut dari status paling mendesak.',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'equipmentItemId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['normal','warning','due','overdue','inactive'] } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated settings. Tiap item memuat `remainingValue` (hitung mundur jam menuju jatuh tempo, negatif = sudah lewat) dan `progressPercent`.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      }
    },
    '/equipment/maintenance-settings/{id}': {
      get: {
        tags: ['Maintenance'], summary: 'Detail setting maintenance', description: 'Permission: maintenance:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail + remainingValue + status' }, 404: { description: 'Tidak ditemukan' } }
      },
      put: {
        tags: ['Maintenance'], summary: 'Update setting maintenance', description: 'Permission: maintenance:update. Hanya `isActive` (mis. unit ini tidak punya komponen tersebut). `thresholdValue` DITOLAK — ambang mengikuti jenis alat. `currentValueSinceReset` dan `status` dikelola sistem. Mengaktifkan setting yang aspeknya tidak berlaku lagi untuk jenisnya → 409. Setting tidak bisa dihapus: dibuat & dinonaktifkan otomatis mengikuti ambang jenis. **Sejak 17 Okt 2026: mengaktifkan LAGI setting yang nonaktif memulai hitungan dari 0** (`counterStartedAt` = sekarang) — jam kerja tidak dihitung selama nonaktif, jadi angka lamanya basi; sama dengan setting yang diaktifkan ulang oleh sinkronisasi ambang jenis.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: {
          type: 'object', properties: { isActive: { type: 'boolean' } }
        }}}},
        responses: { 200: { description: 'Updated, status dihitung ulang' }, 400: { description: 'Field terkelola sistem / thresholdValue dikirim' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Aspek tidak berlaku untuk jenis alat ini' } }
      }
    },
    '/equipment/items/{itemId}/maintenance-settings': {
      get: {
        tags: ['Maintenance'], summary: 'List maintenance setting per alat', description: 'Permission: maintenance:read',
        parameters: [
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['normal','warning','due','overdue','inactive'] } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated settings milik alat ini' }, 404: { description: 'Unit alat tidak ditemukan' } }
      }
    },
    // Ambang servis per jenis alat × aspek (16 Okt 2026) — dipakai layar ambang Divisi Alat.
    // Setting per unit tidak lagi dibuat manual (POST /items/{itemId}/maintenance-settings dihapus).
    '/equipment/maintenance-thresholds': {
      get: {
        tags: ['Maintenance'], summary: 'List ambang servis per jenis alat × aspek',
        description: 'Permission: maintenance:read. Satu baris = aspek itu berlaku untuk jenis itu, dengan ambang jam kerjanya. Semua unit jenis itu memakai ambang ini (`thresholdValue` di setting unit adalah turunannya).',
        parameters: [{ in: 'query', name: 'equipmentTypeId', schema: { type: 'integer' } }],
        responses: { 200: { description: 'Array { id, equipmentTypeId, maintenanceAspectId, thresholdValue, equipmentType, maintenanceAspect, updatedAt }' } }
      }
    },
    '/equipment/types/{typeId}/maintenance-thresholds/{aspectId}': {
      put: {
        tags: ['Maintenance'], summary: 'Tambah / ubah ambang servis satu jenis alat',
        description: 'Permission: maintenance:update. Upsert. Diterapkan ke SEMUA unit jenis itu di transaksi yang sama: unit lama langsung memakai angka baru (status dihitung ulang, hitungan jam tetap); unit yang belum punya setting aspek ini dibuatkan dengan hitungan mulai 0. Unit yang didaftarkan kemudian otomatis ikut. Aspek nonaktif → 409.',
        parameters: [{ in: 'path', name: 'typeId', required: true, schema: { type: 'integer' } }, { in: 'path', name: 'aspectId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['thresholdValue'], properties: { thresholdValue: { type: 'number', example: 250, description: 'Jam kerja antar servis, > 0' } } } } } },
        responses: { 200: { description: 'Disimpan & diterapkan' }, 404: { description: 'Jenis / aspek tidak ditemukan' }, 409: { description: 'Aspek nonaktif' } }
      },
      delete: {
        tags: ['Maintenance'], summary: 'Hapus ambang servis dari jenis alat',
        description: 'Permission: maintenance:update. Aspek tidak berlaku lagi untuk jenis ini: setting unitnya dinonaktifkan (riwayat servis tetap). Menambahkan ambangnya lagi mengaktifkan kembali setting itu dengan hitungan mulai 0.',
        parameters: [{ in: 'path', name: 'typeId', required: true, schema: { type: 'integer' } }, { in: 'path', name: 'aspectId', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Dihapus' }, 404: { description: 'Ambang tidak ada' } }
      }
    },
    '/equipment/maintenance-records': {
      get: {
        tags: ['Maintenance'], summary: 'List riwayat maintenance', description: 'Permission: maintenance:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'equipmentItemId', schema: { type: 'integer' } },
          { in: 'query', name: 'maintenanceType', schema: { type: 'string', enum: ['routine','repair','replacement','inspection','adjustment'] } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['completed','cancelled'] } },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }
        ],
        responses: { 200: { description: 'Paginated records', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Maintenance'], summary: 'Catat tindakan maintenance', description: 'Role: divisi_alat. Permission: maintenance:create. Dicatat SETELAH pekerjaan selesai. Kalau `maintenanceSettingId` diisi, counter setting itu direset ke 0 dan hitung mundur mulai lagi dari threshold. `maintenanceCode` dibuat sistem (MTN-000001).',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentItemId', 'maintenanceType', 'maintenanceDate', 'actionDescription'],
          properties: {
            equipmentItemId: { type: 'integer', description: 'Wajib. Selalu terisi supaya riwayat per alat utuh.' },
            maintenanceSettingId: { type: 'integer', nullable: true, description: 'Isi kalau tindakan ini mereset jadwal servis. Harus milik alat yang sama.' },
            damageLogId: { type: 'integer', nullable: true, description: 'FK menyusul di batch Damage Log' },
            purchaseRequestId: { type: 'integer', nullable: true, description: 'Header PR asal biaya; baris item ditelusuri lewat damageLogId/maintenanceSettingId' },
            maintenanceType: { type: 'string', enum: ['routine','repair','replacement','inspection','adjustment'] },
            maintenanceDate: { type: 'string', format: 'date', example: '2026-09-13' },
            workhourAtMaintenance: { type: 'number', description: 'Default ke total jam alat saat ini kalau dikosongkan' },
            actionDescription: { type: 'string', example: 'Ganti oli mesin + filter oli' },
            performedBy: { type: 'string', example: 'Bengkel Jaya Motor' }
          }
        }}}},
        responses: {
          201: { description: 'Created + setting terkait direset' }, 400: { description: 'Validasi gagal / tanggal di masa depan' },
          404: { description: 'Alat / setting tidak ditemukan' }, 409: { description: 'Setting milik alat lain' }
        }
      }
    },
    '/equipment/maintenance-records/{id}': {
      get: {
        tags: ['Maintenance'], summary: 'Detail riwayat maintenance', description: 'Permission: maintenance:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail' }, 404: { description: 'Tidak ditemukan' } }
      }
    },
    '/equipment/maintenance-records/{id}/cancel': {
      put: {
        tags: ['Maintenance'], summary: 'Batalkan riwayat maintenance salah input', description: 'Permission: maintenance:update. CATATAN: counter setting TIDAK dikembalikan otomatis, karena jam kerja sudah berjalan sejak reset. Koreksi lewat thresholdValue atau record baru.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: {
          type: 'object', properties: { notes: { type: 'string', example: 'Salah pilih unit alat' } }
        }}}},
        responses: { 200: { description: 'Dibatalkan' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Sudah dibatalkan sebelumnya' } }
      }
    },
    '/equipment/items/{itemId}/maintenance-records': {
      get: {
        tags: ['Maintenance'], summary: 'Riwayat maintenance per alat', description: 'Permission: maintenance:read. Memakai kolom equipment_item_id sehingga record dari damage log pun tetap ikut terbawa.',
        parameters: [
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'maintenanceType', schema: { type: 'string', enum: ['routine','repair','replacement','inspection','adjustment'] } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['completed','cancelled'] } },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }
        ],
        responses: { 200: { description: 'Paginated records milik alat ini' }, 404: { description: 'Unit alat tidak ditemukan' } }
      }
    },
    '/equipment/damage-logs': {
      get: {
        tags: ['Damage Logs'], summary: 'List laporan kerusakan', description: 'Permission: damage:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { $ref: '#/components/parameters/SearchParam' },
          { in: 'query', name: 'equipmentItemId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['reported','resolved','cancelled'] } },
          { in: 'query', name: 'stopsOperation', schema: { type: 'boolean' }, description: 'true = hanya kerusakan yang menghentikan alat' },
          { in: 'query', name: 'sparePartSource', schema: { type: 'string', enum: ['warehouse','supplier'] } },
          { in: 'query', name: 'mechanicTeam', schema: { type: 'string', enum: ['internal','external'] } },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }
        ],
        responses: { 200: { description: 'Paginated list. `stopsOperation` adalah sumber badge Crash Level di UI (true = Danger/Berhenti, false = Minor/Masih Jalan).', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Damage Logs'], summary: 'Catat laporan kerusakan', description: 'Role: divisi_alat. Permission: damage:create. Laporan dari Lapangan masuk di luar sistem (telepon), Divisi Alat yang mengetik. `damageCode` dibuat sistem (DMG-000001). Kalau `stopsOperation` true, status alat otomatis jadi `maintenance` dan jam kerjanya tidak bisa diinput lagi.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentItemId', 'damageDate', 'description', 'sparePartSource', 'mechanicTeam'],
          properties: {
            equipmentItemId: { type: 'integer' },
            damageDate: { type: 'string', format: 'date', example: '2026-09-18', description: 'Tanggal KEJADIAN, bukan tanggal input. Tidak boleh di masa depan.' },
            description: { type: 'string', example: 'Kebocoran oli hidrolik pada seal silinder boom utama' },
            sparePartSource: { type: 'string', enum: ['warehouse','supplier'], description: 'supplier berarti butuh Purchase Request lebih dulu' },
            mechanicTeam: { type: 'string', enum: ['internal','external'], description: 'Mekanik didatangkan ke alat, alat tidak ditarik ke bengkel' },
            stopsOperation: { type: 'boolean', default: false, description: 'Centang "Alat Berhenti Operasi" di form' },
            projectId: { type: 'integer', nullable: true, description: 'FK menyusul saat modul Project dibangun' },
            subProjectId: { type: 'integer', nullable: true }
          }
        }}}},
        responses: {
          201: { description: 'Created' }, 400: { description: 'Validasi gagal / tanggal di masa depan' },
          404: { description: 'Unit alat tidak ditemukan' }, 409: { description: 'Alat nonaktif atau sudah pensiun' }
        }
      }
    },
    '/equipment/damage-logs/{id}': {
      get: {
        tags: ['Damage Logs'], summary: 'Detail laporan + tindakan yang sudah dikerjakan', description: 'Permission: damage:read',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail + array maintenanceRecords yang lahir dari laporan ini' }, 404: { description: 'Tidak ditemukan' } }
      },
      put: {
        tags: ['Damage Logs'], summary: 'Ralat laporan', description: 'Permission: damage:update. HANYA selama status `reported` — setelah selesai, keputusan sparepart dan mekanik sudah dieksekusi di lapangan. Mengubah `stopsOperation` ikut menggerakkan status alat.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            description: { type: 'string' }, damageDate: { type: 'string', format: 'date' },
            sparePartSource: { type: 'string', enum: ['warehouse','supplier'] },
            mechanicTeam: { type: 'string', enum: ['internal','external'] },
            stopsOperation: { type: 'boolean' }
          }
        }}}},
        responses: { 200: { description: 'Updated' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Laporan sudah selesai atau dibatalkan' } }
      }
    },
    '/equipment/damage-logs/{id}/resolve': {
      put: {
        tags: ['Damage Logs'], summary: 'Selesaikan kerusakan', description: 'Permission: damage:update. WAJIB mengisi tindakan — satu maintenance record otomatis dibuat dengan `damageLogId` terisi, supaya riwayat alat tidak bolong. Kalau laporan ini yang menghentikan alat dan tidak ada laporan lain yang masih menghentikannya, status alat kembali `operational`.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['maintenanceType', 'actionDescription'],
          properties: {
            maintenanceType: { type: 'string', enum: ['routine','repair','replacement','inspection','adjustment'], description: 'Umumnya `repair`. `inspection` untuk kasus "diperiksa, ternyata tidak ada kerusakan".' },
            actionDescription: { type: 'string', example: 'Ganti seal silinder boom dan isi ulang oli hidrolik' },
            performedBy: { type: 'string', example: 'Bengkel Jaya Motor', description: 'Nama mekanik atau bengkel, melengkapi mechanicTeam' },
            maintenanceDate: { type: 'string', format: 'date', description: 'Default hari ini' },
            maintenanceSettingId: { type: 'integer', nullable: true, description: 'Isi kalau perbaikan sekalian mereset jadwal servis, mis. olinya ikut diganti' }
          }
        }}}},
        responses: {
          200: { description: 'Selesai + maintenance record tercipta' }, 400: { description: 'Validasi gagal' },
          404: { description: 'Laporan / setting tidak ditemukan' }, 409: { description: 'Laporan sudah selesai / setting milik alat lain' }
        }
      }
    },
    '/equipment/damage-logs/{id}/cancel': {
      put: {
        tags: ['Damage Logs'], summary: 'Batalkan laporan salah input', description: 'Permission: damage:update. Hanya dari status `reported`. Kalau laporan ini menghentikan alat, status alat dikembalikan.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string', example: 'Salah pilih unit alat' } } } } } },
        responses: { 200: { description: 'Dibatalkan' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Sudah selesai atau sudah dibatalkan' } }
      }
    },
    '/equipment/items/{itemId}/damage-logs': {
      get: {
        tags: ['Damage Logs'], summary: 'Riwayat kerusakan per alat', description: 'Permission: damage:read',
        parameters: [
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['reported','resolved','cancelled'] } },
          { in: 'query', name: 'stopsOperation', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Paginated riwayat kerusakan alat ini' }, 404: { description: 'Unit alat tidak ditemukan' } }
      }
    },
    // BELUM DIIMPLEMENTASI — kontrak target Batch 4. Struktur item mengikuti
    // order_category: satu order satu kategori, array item disesuaikan.
    // Lihat docs/claude_knowledge/purchase-request-schema.md
    '/equipment/purchase-requests': {
      get: { tags: ['Purchase Requests'], summary: 'List purchase requests', parameters: [ { $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'orderCategory', schema: { type: 'string', enum: ['repair','maintenance','stock'] } }, { in: 'query', name: 'status', schema: { type: 'string', enum: ['submitted','rejected_by_admin','waiting_finance_approval','rejected_by_finance','approved','cancelled'] } } ], responses: { 200: { description: 'Paginated list (header saja)' } } },
      post: {
        tags: ['Purchase Requests'], summary: 'Ajukan order pembelian', description: 'Role: divisi_alat. Array item yang dikirim WAJIB cocok dengan orderCategory — validator menolak kalau tidak.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['requestDate', 'orderCategory'],
          properties: {
            requestDate: { type: 'string', format: 'date' },
            orderCategory: { type: 'string', enum: ['repair', 'maintenance', 'stock'] },
            repairItems: {
              type: 'array', description: 'Wajib & hanya untuk orderCategory=repair. Satu entri per kerusakan.',
              items: { type: 'object', required: ['damageLogId'], properties: {
                damageLogId: { type: 'integer' },
                serviceFee: { type: 'number', default: 0, description: '0 kalau mekanik internal' },
                description: { type: 'string' },
                spareparts: { type: 'array', items: { type: 'object', required: ['itemName', 'quantity', 'estimatedUnitPrice'], properties: {
                  itemName: { type: 'string' }, quantity: { type: 'number' }, estimatedUnitPrice: { type: 'number' }
                } } }
              } }
            },
            maintenanceItems: {
              type: 'array', description: 'Wajib & hanya untuk orderCategory=maintenance. Satu entri per aspek.',
              items: { type: 'object', required: ['maintenanceSettingId', 'estimatedPrice'], properties: {
                maintenanceSettingId: { type: 'integer', description: 'Setting = unit alat x aspek maintenance' },
                estimatedPrice: { type: 'number' }
              } }
            },
            stockItems: {
              type: 'array', description: 'Wajib & hanya untuk orderCategory=stock.',
              items: { type: 'object', required: ['itemName', 'quantity', 'estimatedUnitPrice'], properties: {
                itemName: { type: 'string' }, quantity: { type: 'number' }, estimatedUnitPrice: { type: 'number' }
              } }
            }
          }
        }}}},
        responses: { 201: { description: 'Created. Total dihitung sistem. Kalau melebihi saldo Kas Alat, response menyertakan `balanceWarning` berisi saldo, kekurangan, dan pesannya — peringatan, BUKAN blokir.' } }
      }
    },
    '/equipment/purchase-requests/{id}': {
      get: { tags: ['Purchase Requests'], summary: 'Detail header + item sesuai kategorinya', description: 'Saat status `waiting_finance_approval`, response menyertakan `balanceProjection` (saldo sekarang, nominal diajukan, saldo setelah pencairan — boleh negatif) untuk layar approval Finance.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: {
        tags: ['Purchase Requests'], summary: 'Ubah order', description: 'Role: divisi_alat, hanya pengaju sendiri, dan hanya selama status `submitted`. Array item yang dikirim MENGGANTI seluruh isi sebelumnya (bukan menambah). orderCategory tidak bisa diubah — batalkan dan buat order baru.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          requestDate: { type: 'string', format: 'date' },
          repairItems: { type: 'array', description: 'Hanya untuk order berkategori repair', items: { type: 'object' } },
          maintenanceItems: { type: 'array', description: 'Hanya untuk order berkategori maintenance', items: { type: 'object' } },
          stockItems: { type: 'array', description: 'Hanya untuk order berkategori stock', items: { type: 'object' } }
        } } } } },
        responses: { 200: { description: 'Updated' }, 409: { description: 'Status bukan submitted, atau mencoba mengubah orderCategory' } }
      }
    },
    '/equipment/purchase-requests/{id}/validate': {
      put: { tags: ['Purchase Requests'], summary: 'Admin validasi', description: 'Permission: purchase-request:validate (Admin). submitted -> waiting_finance_approval. `notes` opsional, disimpan di `adminNotes`.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Validated' } } }
    },
    '/equipment/purchase-requests/{id}/approve': {
      put: { tags: ['Purchase Requests'], summary: 'Finance approve + cairkan', description: 'Permission: purchase-request:approve (Finance). Atomik: approval bersamaan hanya satu yang lolos (sisanya 409), dan database menolak baris kas kedua untuk order yang sama. Nominal aktual per baris WAJIB diisi, bukan menyalin estimasi. Boleh menyebabkan saldo Kas Alat negatif. Admin yang memvalidasi order ini tidak boleh menyetujuinya walau juga memegang role finance (403, pemisahan tugas).', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          notes: { type: 'string', description: 'Opsional, disimpan di `financeNotes`' },
          approvedRepairItems: { type: 'array', items: { type: 'object', properties: { repairItemId: { type: 'integer' }, approvedServiceFee: { type: 'number' }, spareparts: { type: 'array', items: { type: 'object', properties: { sparepartId: { type: 'integer' }, approvedTotalPrice: { type: 'number' } } } } } } },
          approvedMaintenanceItems: { type: 'array', items: { type: 'object', properties: { itemId: { type: 'integer' }, approvedPrice: { type: 'number' } } } },
          approvedStockItems: { type: 'array', items: { type: 'object', properties: { itemId: { type: 'integer' }, approvedTotalPrice: { type: 'number' } } } }
        } } } } },
        responses: { 200: { description: 'Approved. total_approved_amount dijumlahkan dari baris, lalu cash-out Kas Alat dibuat dalam transaksi yang SAMA — kategori kasnya diturunkan dari orderCategory. Response menyertakan cashTransactionCreated + cashTransaction.' } } }
    },
    '/equipment/purchase-requests/{id}/reject': {
      put: { tags: ['Purchase Requests'], summary: 'Tolak order', description: 'Permission: purchase-request:validate (saat submitted) atau purchase-request:approve (saat waiting_finance_approval) — diperiksa per permission, bukan nama role. Penolakan bersamaan dengan aksi lain: yang kalah 409. **`notes` WAJIB** (alasan penolakan) — disimpan di `adminNotes` kalau ditolak Admin, `financeNotes` kalau ditolak Finance.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Rejected' }, 400: { description: 'Tanpa `notes`' } } }
    },
    '/equipment/purchase-requests/{id}/cancel': {
      put: { tags: ['Purchase Requests'], summary: 'Batalkan order', description: 'Role: divisi_alat, hanya pengaju sendiri, dan hanya SEBELUM approved. Order yang sudah approved ditolak 409 karena dananya sudah dicairkan — siapa yang berwenang mencatat dana kembali masuk belum diputuskan, jadi ditutup untuk MVP. Sementara ini pengembaliannya dicatat manual di Kas Alat sebagai cash-in `adjustment` kategori "Koreksi Masuk".', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Cancelled' } } }
    },
    // Kas Alat — Batch 5. Saldo TIDAK disimpan per baris, melainkan dijumlahkan
    // saat dibaca: SUM(cash_in) - SUM(cash_out) atas baris yang tidak dibatalkan.
    // Lihat docs/kas-alat-kombinasi-transaksi.md §2.
    '/equipment/cash/balance': {
      get: {
        tags: ['Kas Divisi Alat'], summary: 'Saldo Kas Alat saat ini',
        description: 'Permission: cash:read. Dihitung saat dibaca dari seluruh riwayat; baris yang dibatalkan (isVoided) tidak ikut. Saldo BOLEH negatif.',
        responses: { 200: { description: 'Saldo', content: { 'application/json': { schema: {
          type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: {
            balance: { type: 'number', description: 'totalIn - totalOut. Bisa negatif.' },
            totalIn: { type: 'number' }, totalOut: { type: 'number' }
          } } }
        } } } } }
      }
    },
    '/equipment/cash/summary': {
      get: {
        tags: ['Kas Divisi Alat'], summary: 'Saldo + mutasi periode + rincian per kategori',
        description: 'Permission: cash:read. `balance` SELALU seluruh riwayat (uang yang benar-benar ada); dateFrom/dateTo hanya menyaring `period` dan `byCategory`.',
        parameters: [
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' } }
        ],
        responses: { 200: { description: 'Ringkasan kas' } }
      }
    },
    '/equipment/cash/categories': {
      get: {
        tags: ['Kas Divisi Alat'], summary: 'List kategori kas',
        description: 'Permission: cash:read. Master kategori, dikelola Divisi Alat. `orderCategory` memetakan kategori order purchase request ke kategori kas ini — kategori kas TIDAK dipilih user saat order dicairkan, melainkan diturunkan dari pemetaan ini.',
        parameters: [
          { in: 'query', name: 'transactionType', schema: { type: 'string', enum: ['cash_in','cash_out'] } },
          { in: 'query', name: 'orderCategory', schema: { type: 'string', enum: ['repair','maintenance','stock'] } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } }
        ],
        responses: { 200: { description: 'Daftar kategori + transactionCount per kategori' } }
      },
      post: {
        tags: ['Kas Divisi Alat'], summary: 'Tambah kategori kas',
        description: 'Permission: cash:create. `orderCategory` hanya boleh pada kategori cash_out — purchase request tidak pernah menambah kas — dan satu kategori order hanya boleh menunjuk satu kategori kas.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['categoryName', 'transactionType'],
          properties: {
            categoryName: { type: 'string', maxLength: 150, example: 'Perbaikan Alat' },
            transactionType: { type: 'string', enum: ['cash_in', 'cash_out'] },
            orderCategory: { type: 'string', enum: ['repair', 'maintenance', 'stock'], nullable: true, description: 'Opsional. Hanya untuk cash_out.' },
            description: { type: 'string', nullable: true }
          }
        }}}},
        responses: { 201: { description: 'Created' }, 409: { description: 'Nama+arah sudah ada, atau orderCategory sudah dipetakan ke kategori lain' } }
      }
    },
    '/equipment/cash/categories/{id}': {
      put: {
        tags: ['Kas Divisi Alat'], summary: 'Ubah kategori kas',
        description: 'Permission: cash:update. `transactionType` TIDAK bisa diubah — riwayat yang sudah memakainya akan berubah arti. Nonaktifkan lalu buat kategori baru.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          categoryName: { type: 'string', maxLength: 150 },
          orderCategory: { type: 'string', enum: ['repair', 'maintenance', 'stock'], nullable: true },
          description: { type: 'string', nullable: true },
          isActive: { type: 'boolean' }
        } } } } },
        responses: { 200: { description: 'Updated' }, 409: { description: 'Mencoba mengubah arah kategori, atau orderCategory bentrok' } }
      },
      delete: {
        tags: ['Kas Divisi Alat'], summary: 'Hapus kategori kas',
        description: 'Permission: cash:delete. Hanya kategori yang BELUM dipakai transaksi. Yang sudah dipakai ditolak 409 — nonaktifkan dengan isActive=false supaya riwayatnya tetap terbaca.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Deleted' }, 409: { description: 'Kategori sudah dipakai transaksi' } }
      }
    },
    '/equipment/cash/transactions': {
      get: {
        tags: ['Kas Divisi Alat'], summary: 'List transaksi kas',
        description: 'Permission: cash:read. Baris yang dibatalkan disembunyikan kecuali includeVoided=true — ringkasan yang lupa memfilternya akan langsung salah.',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { in: 'query', name: 'transactionType', schema: { type: 'string', enum: ['cash_in','cash_out'] } },
          { in: 'query', name: 'categoryId', schema: { type: 'integer' } },
          { in: 'query', name: 'sourceType', schema: { type: 'string', enum: ['opening_balance','equipment_income_claim','equipment_purchase_request','manual_expense','adjustment'] } },
          { in: 'query', name: 'dateFrom', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'dateTo', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'includeVoided', schema: { type: 'boolean', default: false } },
          { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Cocokkan transactionCode atau keterangan' }
        ],
        responses: { 200: { description: 'Paginated. Tiap baris punya isSystemGenerated — baris sistem tidak bisa diubah/dibatalkan lewat endpoint ini.' } }
      },
      post: {
        tags: ['Kas Divisi Alat'], summary: 'Catat transaksi kas manual',
        description: 'Permission: cash:create (divisi_alat). TANPA approval — prerogatif Divisi Alat untuk kebutuhan tak terduga (keputusan 25 Sep 2026). `sourceType` hanya menerima opening_balance, manual_expense, adjustment: baris dari purchase request dan klaim pendapatan WAJIB dibuat sistem, kalau tidak orang bisa mencatat cash-in klaim fiktif. Arah uang per sumber: opening_balance=cash_in, manual_expense=cash_out, adjustment=keduanya. Kategori harus searah dengan transaksinya.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['transactionDate', 'transactionType', 'categoryId', 'amount', 'sourceType', 'description'],
          properties: {
            transactionDate: { type: 'string', format: 'date', description: 'Tidak boleh di masa depan. Tanggal mundur DIBOLEHKAN — tidak ada rantai saldo yang bisa rusak.' },
            transactionType: { type: 'string', enum: ['cash_in', 'cash_out'] },
            categoryId: { type: 'integer' },
            amount: { type: 'number', description: 'Harus > 0. Arah uang ditentukan transactionType, bukan tanda nominal.' },
            sourceType: { type: 'string', enum: ['opening_balance', 'manual_expense', 'adjustment'] },
            description: { type: 'string', description: 'Wajib — tanpa ini baris kas tidak bisa ditelusuri' }
          }
        }}}},
        responses: {
          201: { description: 'Created. transactionCode dibuat sistem (KAS-NNNNNN).' },
          400: { description: 'Arah uang tidak cocok dengan sumber atau kategorinya' },
          403: { description: 'sourceType milik sistem dicoba dicatat manual' }
        }
      }
    },
    '/equipment/cash/transactions/{id}': {
      get: { tags: ['Kas Divisi Alat'], summary: 'Detail transaksi kas', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: {
        tags: ['Kas Divisi Alat'], summary: 'Ubah transaksi kas manual',
        description: 'Permission: cash:update. HANYA baris manual — baris bersumber purchase request / klaim pendapatan ditolak 409: kalau ordernya salah, yang dibatalkan ordernya. `transactionType` dan `sourceType` tidak bisa diubah karena keduanya menentukan arti baris; batalkan lalu catat yang benar. Mengedit baris lama MENGUBAH saldo periode lalu — harga yang diterima sadar atas keputusan tidak menyimpan saldo per baris.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          transactionDate: { type: 'string', format: 'date' },
          categoryId: { type: 'integer' },
          amount: { type: 'number' },
          description: { type: 'string' }
        } } } } },
        responses: { 200: { description: 'Updated' }, 409: { description: 'Baris sistem, atau baris sudah dibatalkan' } }
      }
    },
    '/equipment/cash/transactions/{id}/void': {
      put: {
        tags: ['Kas Divisi Alat'], summary: 'Batalkan transaksi kas manual',
        description: 'Permission: cash:update. Barisnya TIDAK dihapus — jejaknya tetap ada beserta alasannya, tapi tidak ikut dihitung ke saldo. Hanya baris manual.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['voidReason'],
          properties: { voidReason: { type: 'string', maxLength: 500 } }
        }}}},
        responses: { 200: { description: 'Voided' }, 409: { description: 'Baris sistem, atau sudah dibatalkan sebelumnya' } }
      }
    },

    // ========================================
    // 3b. MATERIAL MASTER (Request Material RM-1)
    // ========================================
    '/materials/units': {
      get: {
        tags: ['Material Master'], summary: 'Daftar satuan baku',
        description: 'Permission: material:read. Sumber dropdown satuan di FE — daftar yang SAMA dengan validator. "rit" sengaja tidak ada: konversikan ke m³ saat input.',
        responses: { 200: { description: 'Array string satuan' } },
      },
    },
    '/materials/types': {
      get: {
        tags: ['Material Master'], summary: 'List jenis material', description: 'Permission: material:read',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' }, { in: 'query', name: 'search', schema: { type: 'string' } }, { in: 'query', name: 'isActive', schema: { type: 'boolean' } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Material Master'], summary: 'Tambah jenis material',
        description: 'Permission: material:create (Admin). `materialCode` disimpan uppercase dan unik. `materialName` unik tanpa melihat huruf besar-kecil. `unit` dari daftar baku — SATU-SATUNYA tempat satuan disimpan; semua kuantitas request/delivery/receipt mengikutinya (keputusan D1).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['materialCode', 'materialName', 'unit'], properties: {
          materialCode: { type: 'string', example: 'PSR-URUG' }, materialName: { type: 'string', example: 'Pasir Urug' },
          unit: { type: 'string', enum: ['m³', 'ton', 'kg', 'liter', 'sak', 'roll', 'batang', 'unit'] }, description: { type: 'string' },
        } } } } },
        responses: { 201: { description: 'Created' }, 409: { description: 'Kode/nama sudah ada' } },
      },
    },
    '/materials/types/{id}': {
      get: { tags: ['Material Master'], summary: 'Detail jenis material', description: 'Permission: material:read', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: {
        tags: ['Material Master'], summary: 'Ubah jenis material',
        description: 'Permission: material:update. `materialCode` tidak bisa diubah. `unit` TERKUNCI begitu jenis material dipakai di pool (409) — mengubah m³ ke ton membuat angka lama terbaca salah; buat jenis material baru. Nonaktifkan lewat `isActive=false`.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          materialName: { type: 'string' }, unit: { type: 'string', enum: ['m³', 'ton', 'kg', 'liter', 'sak', 'roll', 'batang', 'unit'] }, description: { type: 'string' }, isActive: { type: 'boolean' },
        } } } } },
        responses: { 200: { description: 'Diperbarui' }, 409: { description: 'Satuan terkunci / nama sudah ada' } },
      },
    },
    '/materials/suppliers': {
      get: {
        tags: ['Material Master'], summary: 'List supplier', description: 'Permission: supplier:read',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' }, { in: 'query', name: 'search', schema: { type: 'string' } }, { in: 'query', name: 'isActive', schema: { type: 'boolean' } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Material Master'], summary: 'Tambah supplier',
        description: 'Permission: supplier:create (Admin). Nama unik tanpa melihat huruf besar-kecil.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['supplierName'], properties: {
          supplierName: { type: 'string', example: 'Quarry Arjawinangun' }, phone: { type: 'string' }, address: { type: 'string' },
        } } } } },
        responses: { 201: { description: 'Created' }, 409: { description: 'Nama sudah ada' } },
      },
    },
    '/materials/suppliers/{id}': {
      get: { tags: ['Material Master'], summary: 'Detail supplier', description: 'Permission: supplier:read', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: {
        tags: ['Material Master'], summary: 'Ubah supplier', description: 'Permission: supplier:update. Nonaktifkan lewat `isActive=false`.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          supplierName: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' }, isActive: { type: 'boolean' },
        } } } } },
        responses: { 200: { description: 'Diperbarui' } },
      },
    },

    // ========================================
    // 4. REQUEST ALAT
    // ========================================
    '/request-alat': {
      get: {
        tags: ['Request Alat'], summary: 'List request alat',
        description: 'Permission: equipment-request:read. `approvalOutcome` (full/partial) dan `rejectedBy` (admin/equipment_division) adalah field TURUNAN — pengganti status `partially_approved` dan `rejected_by_*` dari ERD. `totalApprovedQuantity` null selama belum diputuskan.',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['submitted', 'equipment_review', 'approved', 'rejected', 'cancelled'] } },
          { in: 'query', name: 'requestType', schema: { type: 'string', enum: ['internal_project', 'external_rental'] } },
          { in: 'query', name: 'subProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'externalRentalProjectId', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Request Alat'], summary: 'Buat request alat',
        description: 'Permission: equipment-request:create. `internal_project` (Lapangan, dari sub-project) mulai `submitted` dan melewati review Admin. `external_rental` langsung `equipment_review` karena dibuat Admin — karena itu hanya pemegang equipment-request:review yang boleh membuatnya (403 selain itu). Tepat satu konteks sesuai requestType (dijaga CHECK). Satu jenis alat sekali per request. Tahapan/project yang completed/cancelled ditolak 409. `requestCode` (RQA-NNNNNN), `status`, kolom aktor, dan `approvedQuantity`/`decisionNotes` dikelola sistem — ditolak 400 kalau dikirim.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['requestType', 'items'],
          properties: {
            requestType: { type: 'string', enum: ['internal_project', 'external_rental'] },
            subProjectId: { type: 'integer', description: 'Wajib untuk internal_project, dilarang untuk external_rental' },
            externalRentalProjectId: { type: 'integer', description: 'Wajib untuk external_rental, dilarang untuk internal_project' },
            requestDate: { type: 'string', format: 'date', description: 'Default hari ini; tidak boleh di masa depan' },
            neededDate: { type: 'string', format: 'date', description: 'Tidak boleh sebelum requestDate' },
            locationDetail: { type: 'string' }, requestNotes: { type: 'string' },
            items: { type: 'array', minItems: 1, items: { type: 'object', required: ['equipmentTypeId', 'requestedQuantity'],
              properties: { equipmentTypeId: { type: 'integer' }, requestedQuantity: { type: 'integer', minimum: 1, maximum: 100 }, estimatedWorkhours: { type: 'number' }, itemNotes: { type: 'string' } },
            } },
          },
        } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi gagal' }, 403: { description: 'external_rental tanpa wewenang review' }, 409: { description: 'Konteks sudah ditutup' } },
      },
    },
    '/request-alat/{id}': {
      get: {
        tags: ['Request Alat'], summary: 'Detail request + items',
        description: 'Permission: equipment-request:read. Per item: `decision` (pending/approved/partially_approved/rejected) dan `rejectedQuantity` DITURUNKAN dari approvedQuantity (null = belum diputuskan), plus `poolItems` yang lahir dari item tersebut.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' }, 404: { description: 'Tidak ditemukan' } },
      },
    },
    '/request-alat/{id}/admin-review': {
      put: {
        tags: ['Request Alat'], summary: 'Review Admin (internal_project)',
        description: 'Permission: equipment-request:review. Hanya request internal berstatus `submitted`. `forward` -> equipment_review, `reject` -> rejected (notes wajib). Pengaju tidak boleh mereview request sendiri (403). Dua aksi bersamaan: yang kalah 409.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['forward', 'reject'] }, notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Reviewed' }, 409: { description: 'Bukan antrean Admin / external rental' } },
      },
    },
    '/request-alat/{id}/equipment-review': {
      put: {
        tags: ['Request Alat'], summary: 'Keputusan Divisi Alat',
        description: 'Permission: equipment-request:approve. Hanya status `equipment_review`. SEMUA item wajib diputuskan sekaligus, 0 <= approvedQuantity <= requestedQuantity. Tidak ada field `action`: total disetujui 0 -> `rejected` (notes wajib), selebihnya -> `approved`. Di transaksi yang sama, tiap unit yang disetujui menjadi SATU pool item `available` tanpa unit (pilih unitnya lewat bind-unit sebelum dialokasikan). Pool tujuan: pool draft/active milik project; dibuat otomatis kalau belum ada; kalau ada lebih dari satu, `equipmentPoolId` wajib. Keputusan bersamaan: yang kalah 409, pool item tidak terbuat ganda.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['items'],
          properties: {
            items: { type: 'array', items: { type: 'object', required: ['itemId', 'approvedQuantity'], properties: { itemId: { type: 'integer' }, approvedQuantity: { type: 'integer', minimum: 0 }, decisionNotes: { type: 'string' } } } },
            notes: { type: 'string', description: 'Wajib kalau semua item ditolak' },
            equipmentPoolId: { type: 'integer', description: 'Wajib hanya kalau project punya lebih dari satu pool aktif' },
          },
        } } } },
        responses: { 200: { description: 'Diputuskan' }, 400: { description: 'Item tidak lengkap / kuantitas tidak sah' }, 409: { description: 'Bukan antrean Divisi Alat' } },
      },
    },
    '/request-alat/{id}/cancel': {
      put: {
        tags: ['Request Alat'], summary: 'Batalkan request',
        description: 'Permission: equipment-request:create. Hanya pengaju (403 selain itu), dan hanya selama `submitted`/`equipment_review`. Request approved tidak bisa dibatalkan — pool item-nya ditutup lewat endpoint pool.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Cancelled' }, 409: { description: 'Sudah diproses' } },
      },
    },

    // ========================================
    // 5. REQUEST MATERIAL
    // ========================================
    // RM-2 (pengajuan & meja Admin) + RM-3 (biaya & approval Finance). Delivery
    // dan receipt menyusul di RM-4..RM-5 — lihat docs/keputusan-desain-request-material.md
    '/request-material': {
      get: {
        tags: ['Request Material'], summary: 'List request material',
        description: 'Permission: material-request:read. `rejectedBy` (admin/finance) adalah field TURUNAN — pengganti status rejected_by_* dari ERD (R1). `totalCostAmount` = jumlah rincian biaya, dihitung saat dibaca (0 kalau belum disusun).',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled'] } },
          { in: 'query', name: 'requestType', schema: { type: 'string', enum: ['internal_project', 'external_supply'] } },
          { in: 'query', name: 'subProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'externalSupplyProjectId', schema: { type: 'integer' } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Request Material'], summary: 'Ajukan request material',
        description: 'Permission: material-request:create. `internal_project` dari tahapan berstatus planned/active. `external_supply` dari kontrak yang belum ditutup (tanpa PIC sejak 16 Okt 2026). Material dipilih bebas dari master (tidak wajib ada di pool), harus aktif, sekali per request. Kuantitas dalam SATUAN JENIS MATERIAL — `unit` ditolak 400; konversi (mis. rit → m³) tanggung jawab penginput. Kode MRQ-NNNNNN dibuat sistem.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['requestType', 'items'], properties: {
          requestType: { type: 'string', enum: ['internal_project', 'external_supply'] },
          subProjectId: { type: 'integer', description: 'Wajib untuk internal_project' },
          externalSupplyProjectId: { type: 'integer', description: 'Wajib untuk external_supply' },
          requestDate: { type: 'string', format: 'date', description: 'Default hari ini; tidak boleh di masa depan' },
          neededDate: { type: 'string', format: 'date', description: 'Tidak boleh sebelum requestDate' },
          requestNotes: { type: 'string' },
          items: { type: 'array', minItems: 1, items: { type: 'object', required: ['materialTypeId', 'requestedQuantity'], properties: {
            materialTypeId: { type: 'integer' }, requestedQuantity: { type: 'number', example: 24.5 }, itemNotes: { type: 'string' },
          } } },
        } } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi gagal' }, 409: { description: 'Konteks ditutup / material nonaktif' } },
      },
    },
    '/request-material/{id}': {
      get: {
        tags: ['Request Material'], summary: 'Detail request material',
        description: 'Permission: material-request:read. Tiap item memuat `unit` (dari jenis material), `requestedQuantity`, `adminValidatedQuantity` (null = belum diubah Admin), `effectiveQuantity` (yang berlaku), `materialPoolItemId` (terisi setelah disetujui Finance), serta `deliveredQuantity`/`deliveryCount` (jumlahan delivery aktif) dan `acceptedQuantity` (jumlahan receipt aktif yang diterima baik) — dihitung saat dibaca, boleh melebihi effectiveQuantity. `costs` = rincian biaya, `totalCostAmount` = jumlahnya (tidak disimpan).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } },
      },
    },
    '/request-material/{id}/admin-validation': {
      put: {
        tags: ['Request Material'], summary: 'Admin menyesuaikan kuantitas',
        description: 'Permission: material-request:validate. Hanya status `submitted`; status TIDAK berubah (meneruskan ke Finance lewat submit-to-finance). Kuantitas boleh dikurangi, tidak boleh melebihi permintaan dan tidak boleh 0 (R4, dijaga CHECK). `adminValidatedQuantity: null` mengembalikan ke kuantitas diminta. Pengaju tidak boleh memvalidasi request sendiri.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: {
          items: { type: 'array', items: { type: 'object', required: ['itemId'], properties: {
            itemId: { type: 'integer' }, adminValidatedQuantity: { type: 'number', nullable: true }, adminNotes: { type: 'string' },
          } } },
        } } } } },
        responses: { 200: { description: 'Disimpan' }, 400: { description: 'Melebihi permintaan / item bukan milik request' }, 409: { description: 'Bukan antrean Admin' } },
      },
    },
    '/request-material/{id}/costs': {
      put: {
        tags: ['Request Material'], summary: 'Admin menyusun rincian biaya',
        description: 'Permission: material-request:validate. Hanya status `submitted`; MENGGANTI seluruh daftar (array kosong = mengosongkan). `material_cost` wajib menunjuk satu item request ini lewat `materialRequestItemId` (maksimal satu per item); jenis biaya lain TIDAK boleh menunjuk item. `amount` > 0 (dijaga CHECK). `approvedAmount` ditolak — Finance tidak mengisi nominal aktual. Pengaju tidak boleh menyusun biaya request sendiri.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['costs'], properties: {
          costs: { type: 'array', items: { type: 'object', required: ['costType', 'description', 'amount'], properties: {
            costType: { type: 'string', enum: ['material_cost', 'driver_fee', 'delivery_fee', 'loading_unloading_fee', 'fuel_cost', 'other'] },
            materialRequestItemId: { type: 'integer', nullable: true, description: 'Wajib untuk material_cost, dilarang untuk lainnya' },
            description: { type: 'string' }, amount: { type: 'number', example: 1500000 },
            payeeName: { type: 'string', maxLength: 150 }, notes: { type: 'string' },
          } } },
        } } } } },
        responses: { 200: { description: 'Disimpan' }, 400: { description: 'Item tidak sah / material_cost dobel / nominal tidak sah' }, 409: { description: 'Bukan antrean Admin' } },
      },
    },
    '/request-material/{id}/submit-to-finance': {
      put: {
        tags: ['Request Material'], summary: 'Admin meneruskan paket ke Finance',
        description: 'Permission: material-request:validate. `submitted` → `waiting_finance_approval`. Syarat: setiap item punya tepat satu `material_cost` (400 menyebut item yang kurang). Setelah ini kuantitas dan biaya terkunci.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Diteruskan' }, 400: { description: 'Biaya belum lengkap' }, 409: { description: 'Bukan antrean Admin' } },
      },
    },
    '/request-material/{id}/approve': {
      put: {
        tags: ['Request Material'], summary: 'Finance menyetujui paket dana',
        description: 'Permission: material-request:approve (Finance; super_admin TIDAK). `waiting_finance_approval` → `approved`. Nominal yang disetujui = yang diajukan. Di transaksi yang sama setiap material masuk material pool project (konstruksi: pool construction project tahapan; supply: pool supply project). Pool dibuat otomatis kalau belum ada; lebih dari satu pool aktif → `materialPoolId` wajib. Material yang sudah ada di pool memakai pool item yang sama. Approve ganda / approve + cancel bersamaan: yang kalah 409. Admin yang meneruskan paket ini tidak boleh menyetujuinya walau juga memegang role finance (403, pemisahan tugas).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
          notes: { type: 'string' },
          materialPoolId: { type: 'integer', description: 'Wajib hanya kalau project punya lebih dari satu material pool aktif' },
        } } } } },
        responses: { 200: { description: 'Disetujui' }, 400: { description: 'Pool tidak sah / perlu memilih pool' }, 403: { description: 'Bukan Finance' }, 409: { description: 'Bukan antrean Finance / sudah diproses' } },
      },
    },
    '/request-material/{id}/reject': {
      put: {
        tags: ['Request Material'], summary: 'Tolak request material',
        description: 'Permission diperiksa per status: `submitted` → material-request:validate (Admin); `waiting_finance_approval` → material-request:approve (Finance). Alasan wajib. Tidak ada "kembalikan ke Admin" — revisi = request baru (ERD). Aksi bersamaan: yang kalah 409.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Ditolak' }, 403: { description: 'Tidak berwenang di status ini' } },
      },
    },
    '/request-material/{id}/cancel': {
      put: {
        tags: ['Request Material'], summary: 'Batalkan request material',
        description: 'Permission: material-request:create. Hanya pengaju, selama Finance belum memutuskan (submitted / waiting_finance_approval).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Dibatalkan' }, 409: { description: 'Sudah diputuskan' } },
      },
    },

    // RM-4 — docs/keputusan-desain-request-material.md G1–G5. Form + file surat
    // jalan dikirim dalam SATU multipart (docs/keputusan-desain-lampiran.md L4).
    '/material-deliveries': {
      get: {
        tags: ['Material Delivery'], summary: 'List delivery',
        description: 'Permission: material-request:read. Satu baris = satu surat jalan = satu truk = satu material. `cancelled` tanpa diisi = semua.',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'materialRequestId', schema: { type: 'integer' } },
          { in: 'query', name: 'subProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'externalSupplyProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'supplierId', schema: { type: 'integer' } },
          { in: 'query', name: 'cancelled', schema: { type: 'string', enum: ['true', 'false'] } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Material Delivery'], summary: 'Catat delivery + unggah surat jalan',
        description: 'Permission: material-delivery:create (Divisi Lapangan, konstruksi & supply). Request harus `approved` dan project/tahapan/kontrak belum ditutup (409). File surat jalan WAJIB di field `deliveryNote`: PDF/JPG/PNG/WebP maks 10 MB, jenis diperiksa dari isi file; HEIC ditolak. Kuantitas dalam satuan jenis material (`unit` ditolak). Boleh melebihi kuantitas disetujui. Nomor surat jalan & nomor kendaraan dinormalisasi huruf besar; nomor surat jalan unik per supplier di antara delivery aktif (409). Kode DLV-NNNNNN dibuat sistem.',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object',
          required: ['materialRequestItemId', 'supplierId', 'deliveredQuantity', 'deliveryNoteNumber', 'deliveryNoteDate', 'vehicleNumber', 'driverName', 'deliveryNote'],
          properties: {
            materialRequestItemId: { type: 'integer', description: 'Item request yang dikirim; request-nya diturunkan dari sini' },
            supplierId: { type: 'integer' }, deliveredQuantity: { type: 'number', example: 20.5 },
            deliveryNoteNumber: { type: 'string', maxLength: 100 }, deliveryNoteDate: { type: 'string', format: 'date', description: 'Tidak boleh di masa depan' },
            vehicleNumber: { type: 'string', maxLength: 30 }, driverName: { type: 'string', maxLength: 150 },
            vehicleType: { type: 'string' }, driverPhone: { type: 'string' },
            originLocation: { type: 'string' }, destinationLocation: { type: 'string' }, notes: { type: 'string' },
            deliveryNote: { type: 'string', format: 'binary', description: 'File surat jalan' },
          } } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi / file tidak sah' }, 403: { description: 'Bukan Divisi Lapangan' }, 409: { description: 'Request belum approved / konteks ditutup / nomor surat jalan sudah tercatat' } },
      },
    },
    '/material-deliveries/{id}': {
      get: { tags: ['Material Delivery'], summary: 'Detail delivery', description: 'Permission: material-request:read. `deliveryNoteFile.id` dipakai untuk GET /files/{id}/url. `receipt` = ringkasan receipt aktif (null = belum diterima).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
    },
    '/material-deliveries/{id}/delivery-note': {
      put: {
        tags: ['Material Delivery'], summary: 'Ganti file surat jalan',
        description: 'Permission: material-delivery:create, hanya pencatatnya, delivery belum dibatalkan dan BELUM diterima (409). File lama TIDAK dihapus — status `superseded` dan tetap bisa diunduh.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['deliveryNote'], properties: { deliveryNote: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'Diganti' }, 403: { description: 'Bukan pencatat' }, 409: { description: 'Sudah dibatalkan / diproses bersamaan' } },
      },
    },
    '/material-deliveries/{id}/cancel': {
      put: {
        tags: ['Material Delivery'], summary: 'Batalkan delivery',
        description: 'Permission: material-delivery:create, hanya pencatatnya, alasan wajib, delivery BELUM diterima (409 — batalkan receipt-nya dulu). Tidak ada edit bebas: koreksi = batalkan lalu catat ulang (nomor surat jalan yang sama boleh dipakai lagi). Delivery batal tidak dihitung di total terkirim.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: { 200: { description: 'Dibatalkan' }, 403: { description: 'Bukan pencatat' }, 409: { description: 'Sudah dibatalkan' } },
      },
    },
    // RM-5 — docs/keputusan-desain-request-material.md H1–H6
    '/material-receipts': {
      get: {
        tags: ['Material Receipt'], summary: 'List receipt',
        description: 'Permission: material-request:read. `rejectedQuantity` = received - accepted (turunan, tidak disimpan).',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          ...['materialRequestId', 'materialDeliveryId', 'subProjectId', 'externalSupplyProjectId'].map((name) => ({ in: 'query', name, schema: { type: 'integer' } })),
          { in: 'query', name: 'cancelled', schema: { type: 'string', enum: ['true', 'false'] } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Material Receipt'], summary: 'Catat penerimaan satu delivery + bukti',
        description: 'Permission: material-receipt:create (Divisi Lapangan). Satu receipt AKTIF per delivery (409). Tanpa validasi: sah begitu dicatat. Bukti WAJIB 1–5 file di field `proofs` (PDF/JPG/PNG/WebP, maks 10 MB per file; HEIC ditolak). `acceptedQuantity` ≤ `receivedQuantity`; boleh 0 (semua ditolak). `receivedAt` tidak di masa depan dan tidak sebelum tanggal surat jalan. Supply: `externalReceiverName` WAJIB (penerima di pihak klien — dasar tagihan). Konstruksi: kolom penerima eksternal ditolak; `acceptedQuantity` menjadi stok masuk tahapan. Kode RCV-NNNNNN dibuat sistem. Begitu diterima, delivery tidak bisa dibatalkan/diganti surat jalannya.',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object',
          required: ['materialDeliveryId', 'receivedAt', 'receivedQuantity', 'acceptedQuantity', 'proofs'],
          properties: {
            materialDeliveryId: { type: 'integer' }, receivedAt: { type: 'string', format: 'date-time' },
            receivedQuantity: { type: 'number', description: 'Yang datang' }, acceptedQuantity: { type: 'number', description: 'Yang diterima baik' },
            externalReceiverName: { type: 'string', description: 'Wajib untuk supply, dilarang untuk konstruksi' },
            externalReceiverPhone: { type: 'string' }, notes: { type: 'string' },
            proofs: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', format: 'binary' } },
          } } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi / bukti tidak sah' }, 403: { description: 'Bukan Divisi Lapangan' }, 409: { description: 'Delivery batal / sudah diterima' } },
      },
    },
    '/material-receipts/{id}': {
      get: { tags: ['Material Receipt'], summary: 'Detail receipt', description: 'Permission: material-request:read. `attachments[].id` dipakai untuk GET /files/{id}/url.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
    },
    '/material-receipts/{id}/cancel': {
      put: {
        tags: ['Material Receipt'], summary: 'Batalkan receipt',
        description: 'Permission: material-receipt:create, hanya pencatatnya, alasan wajib. Konstruksi: ditolak 409 kalau material itu sudah terpakai (stok jadi minus). Koreksi = batalkan lalu catat ulang untuk delivery yang sama.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: { 200: { description: 'Dibatalkan' }, 403: { description: 'Bukan pencatat' }, 409: { description: 'Sudah dibatalkan / stok jadi minus' } },
      },
    },
    '/material-stock': {
      get: {
        tags: ['Material Stock'], summary: 'Saldo stok material satu tahapan',
        description: 'Permission: material-stock:read. Per jenis material: `received` (receipt konstruksi aktif) + `adjustmentIn` - `used` - `adjustmentOut` = `balance`. Dihitung saat dibaca — tidak ada kolom saldo. Material supply tidak masuk stok.',
        parameters: [{ in: 'query', name: 'subProjectId', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Array saldo per material' } },
      },
    },
    '/material-stock/movements': {
      get: {
        tags: ['Material Stock'], summary: 'List mutasi stok manual',
        description: 'Permission: material-stock:read. Hanya mutasi manual (used, adjustment_in, adjustment_out). Stok masuk dari penerimaan dibaca lewat GET /material-receipts?subProjectId=.',
        parameters: [{ in: 'query', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'materialTypeId', schema: { type: 'integer' } },
          { in: 'query', name: 'movementType', schema: { type: 'string', enum: ['used', 'adjustment_in', 'adjustment_out'] } }],
        responses: { 200: { description: 'Paginated list' } },
      },
      post: {
        tags: ['Material Stock'], summary: 'Catat pemakaian / koreksi stok',
        description: 'Permission: material-stock:create (Divisi Lapangan). `used` & `adjustment_out` ditolak 409 kalau membuat saldo kurang dari nol (dijaga juga untuk pencatatan bersamaan). Koreksi (`adjustment_*`) wajib `notes`. Kuantitas dalam satuan jenis material (`unit` ditolak).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object',
          required: ['subProjectId', 'materialTypeId', 'movementType', 'quantity', 'movementDate'],
          properties: {
            subProjectId: { type: 'integer' }, materialTypeId: { type: 'integer' },
            movementType: { type: 'string', enum: ['used', 'adjustment_in', 'adjustment_out'] },
            quantity: { type: 'number' }, movementDate: { type: 'string', format: 'date', description: 'Tidak di masa depan' },
            notes: { type: 'string', description: 'Wajib untuk adjustment_*' },
          } } } } },
        responses: { 201: { description: 'Created' }, 400: { description: 'Validasi gagal' }, 409: { description: 'Stok tidak cukup' } },
      },
    },
    '/material-stock/movements/{id}/cancel': {
      put: {
        tags: ['Material Stock'], summary: 'Batalkan mutasi stok',
        description: 'Permission: material-stock:create, hanya pencatatnya, alasan wajib. Salah input dikoreksi dengan membatalkan barisnya (bukan baris lawan) supaya total pemakaian tetap benar. Membatalkan adjustment_in ditolak 409 kalau saldo jadi minus.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
        responses: { 200: { description: 'Dibatalkan' }, 403: { description: 'Bukan pencatat' }, 409: { description: 'Sudah dibatalkan / stok jadi minus' } },
      },
    },
    '/files/{id}/url': {
      get: {
        tags: ['Files'], summary: 'Signed URL untuk membuka/mengunduh lampiran',
        description: 'Permission mengikuti modul pemilik file (surat jalan & bukti penerimaan → material-request:read; berkas project & arsip penutupan → project-file:read). Berkas di sampah → 404 (pulihkan dulu). URL berlaku 5 menit (`expiresInSeconds`); kalau kedaluwarsa, minta lagi. PDF & gambar dibuka inline, lainnya diunduh. File yang sudah diganti (`superseded`) tetap bisa diunduh.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: '{ id, originalName, mimeType, sizeBytes, status, url, expiresInSeconds }' }, 403: { description: 'Tidak berhak membaca modul pemilik' }, 404: { description: 'Tidak ada / tanpa pemilik' } },
      },
    },

    // ========================================
    // PROJECT FILES — Berkas Project (L8, docs/keputusan-desain-lampiran.md)
    // ========================================
    // Kontrak disepakati 17 Okt 2026, pembangunan di commit terpisah.
    // Direktori: Project → (tahapan, konstruksi saja) → folder → berkas.
    // Folder sistem & ekspor TIDAK disimpan: dibaca dari tabel sumber saat diminta.
    '/project-files/projects': {
      get: {
        tags: ['Project Files'], summary: 'Daftar project (3 jenis) + ringkasan berkas',
        description: 'Permission: project-file:read. Halaman awal Files. Semua project konstruksi, rental & supply (termasuk yang selesai/dibatalkan — FE yang menyaring). **Tidak dipaginasi**: puluhan project per tahun. Ringkasan (`folderCount`, `fileCount`, `totalSize`, `lastUploadAt`) hanya menghitung berkas di folder user yang tidak di sampah. `year` = tahun tanggal mulai (kontrak) project, jatuh ke tahun dibuat kalau kosong.',
        parameters: [{ in: 'query', name: 'type', schema: { type: 'string', enum: ['construction', 'rental', 'supply'] } }],
        responses: { 200: { description: 'Array `{ type, id, code, name, clientName, status, year, folderCount, fileCount, totalSize, lastUploadAt }`' } },
      },
    },
    '/project-files/projects/{type}/{projectId}': {
      get: {
        tags: ['Project Files'], summary: 'Direktori satu project',
        description: 'Permission: project-file:read. Satu panggilan memberi seluruh susunan folder. Folder sistem & tahapan muncul sendiri sejak project/tahapan dibuat (dibaca dari tabel sumber, tidak ada baris folder yang dibuat).\n\n' +
          '| Jenis | `folders` (tingkat project) | `stages[].folders` |\n|---|---|---|\n' +
          '| construction | Arsip Penutupan¹ (`project-summary`), folder user | Surat Jalan, Bukti Penerimaan, Arsip Penutupan¹ (`stage-progress`, `stage-equipment`, `stage-material`), folder user |\n' +
          '| supply | Surat Jalan, Bukti Penerimaan, Arsip Penutupan¹ (`supply-deliveries`), folder user | — |\n' +
          '| rental | Arsip Penutupan¹ (`rental-timesheet` per unit), folder user | — |\n\n' +
          '¹ Hanya muncul setelah tahapan/project itu ditutup (`completed` atau `cancelled`). Sebelum itu data diunduh dari halaman sumbernya masing-masing.\n\n' +
          'Folder sistem lampiran modul tampil hanya kalau user memegang permission read modul sumbernya (`material-request:read`). Urutan: sistem, lalu folder user menurut nama.',
        parameters: [
          { in: 'path', name: 'type', required: true, schema: { type: 'string', enum: ['construction', 'rental', 'supply'] } },
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: '`{ project: { type, id, code, name, clientName, status, year }, folders: ProjectFolderEntry[], stages: [{ subProjectId, subProjectType, status, folders: ProjectFolderEntry[] }] }` — `stages` kosong untuk rental/supply', content: { 'application/json': { schema: { type: 'object', properties: {
            project: { type: 'object' },
            folders: { type: 'array', items: { $ref: '#/components/schemas/ProjectFolderEntry' } },
            stages: { type: 'array', items: { type: 'object', properties: { subProjectId: { type: 'integer' }, subProjectType: { type: 'string' }, status: { type: 'string' }, folders: { type: 'array', items: { $ref: '#/components/schemas/ProjectFolderEntry' } } } } },
          } } } } },
          404: { description: 'Project tidak ditemukan' },
        },
      },
    },
    '/project-files/projects/{type}/{projectId}/folders': {
      post: {
        tags: ['Project Files'], summary: 'Buat folder',
        description: 'Permission: project-file:create. Folder SATU tingkat (tidak ada subfolder). `subProjectId` = folder milik tahapan — hanya untuk construction dan wajib tahapan project itu (composite FK). Nama unik per tempat (project atau tahapan yang sama), tanpa membedakan huruf besar/kecil → 409. Tidak dikunci status project/tahapan: dokumen (BAST, dsb.) justru datang setelah selesai.',
        parameters: [
          { in: 'path', name: 'type', required: true, schema: { type: 'string', enum: ['construction', 'rental', 'supply'] } },
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['name'],
          properties: { name: { type: 'string', maxLength: 120, example: 'Gambar Teknik' }, subProjectId: { type: 'integer', nullable: true } },
        } } } },
        responses: { 201: { description: 'ProjectFolderEntry (`kind: user`)' }, 400: { description: 'Nama kosong / subProjectId untuk rental-supply / tahapan bukan milik project' }, 404: { description: 'Project/tahapan tidak ditemukan' }, 409: { description: 'Nama folder sudah dipakai di tempat yang sama' } },
      },
    },
    '/project-files/folders/{id}': {
      patch: {
        tags: ['Project Files'], summary: 'Ubah nama folder',
        description: 'Permission: project-file:update. Hanya `name`. Folder tidak bisa dipindah ke project/tahapan lain.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 120 } } } } } },
        responses: { 200: { description: 'ProjectFolderEntry' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Nama sudah dipakai' } },
      },
      delete: {
        tags: ['Project Files'], summary: 'Hapus folder kosong',
        description: 'Permission: project-file:delete. Hanya kalau BENAR-BENAR kosong — termasuk sampah — supaya berkas yang dipulihkan selalu punya folder. Folder berisi berkas di sampah baru bisa dihapus setelah berkasnya terhapus permanen (30 hari) atau dipulihkan & dipindah.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Dihapus' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Masih berisi berkas (aktif atau di sampah) — pesan menyebut jumlahnya' } },
      },
    },
    '/project-files/folders/{id}/files': {
      get: {
        tags: ['Project Files'], summary: 'Isi folder user',
        description: 'Permission: project-file:read. Berkas di sampah tidak tampil (lihat endpoint trash). Urut terbaru diunggah.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'q', schema: { type: 'string' }, description: 'Cari di nama tampilan, nama file asli, dan deskripsi (tanpa membedakan huruf)' },
          { in: 'query', name: 'kind', schema: { type: 'string', enum: ['image', 'pdf', 'sheet', 'doc', 'cad'] } },
        ],
        responses: { 200: { description: 'Paginated ProjectFile', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } }, 404: { description: 'Folder tidak ditemukan' } },
      },
      post: {
        tags: ['Project Files'], summary: 'Unggah berkas',
        description: 'Permission: project-file:create. multipart/form-data, SATU file di field `file`. Profil `project` (L3): PDF, JPG, PNG, WebP, DWG, XLSX, DOCX — maks 50 MB, jenis diperiksa dari ISI file (bukan ekstensi). `.xls`/`.doc`, HEIC, berkas ber-makro, arsip & executable ditolak 400. File ke storage dulu, lalu satu transaksi DB; DB gagal → file dihapus (L4). Kunci storage `project-files/YYYY/MM/<uuid>.<ext>`.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: {
          type: 'object', required: ['file', 'name'],
          properties: { file: { type: 'string', format: 'binary' }, name: { type: 'string', maxLength: 150 }, description: { type: 'string', maxLength: 500 } },
        } } } },
        responses: { 201: { description: 'ProjectFile' }, 400: { description: 'File tidak ada / jenis atau ukuran tidak diterima / nama kosong' }, 404: { description: 'Folder tidak ditemukan' }, 503: { description: 'Storage belum dikonfigurasi' } },
      },
    },
    '/project-files/files/{id}': {
      get: {
        tags: ['Project Files'], summary: 'Detail berkas',
        description: 'Permission: project-file:read. Berkas di sampah tetap bisa dibaca detailnya (untuk layar sampah), tapi tidak bisa diunduh.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'ProjectFile' }, 404: { description: 'Tidak ditemukan' } },
      },
      patch: {
        tags: ['Project Files'], summary: 'Ubah nama/deskripsi atau pindah folder',
        description: 'Permission: project-file:update. `folderId` = pindah ke folder user lain di PROJECT YANG SAMA (boleh antar tahapan / tingkat project). Isi file tidak bisa diganti dan tidak ada versi — revisi diunggah sebagai berkas baru. Berkas di sampah → 409 (pulihkan dulu).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          name: { type: 'string', maxLength: 150 }, description: { type: 'string', maxLength: 500, nullable: true }, folderId: { type: 'integer' },
        } } } } },
        responses: { 200: { description: 'ProjectFile' }, 400: { description: 'Folder tujuan milik project lain' }, 404: { description: 'Berkas/folder tidak ditemukan' }, 409: { description: 'Berkas di sampah' } },
      },
      delete: {
        tags: ['Project Files'], summary: 'Pindahkan ke sampah',
        description: 'Permission: project-file:delete. Tidak menghapus: `files.status = trashed` + `trashed_by/at`. Dihapus permanen 30 hari setelah masuk sampah (per berkas) oleh pembersih (`npm run files:cleanup`). Lampiran bukti modul lain tidak pernah bisa ke sampah.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'ProjectFile dengan `trashedAt` & `purgeAt`' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'Sudah di sampah' } },
      },
    },
    '/project-files/files/{id}/restore': {
      post: {
        tags: ['Project Files'], summary: 'Pulihkan dari sampah',
        description: 'Permission: project-file:delete. Kembali ke folder asalnya (folder tidak bisa dihapus selama berisi sampah). Atomik: dua permintaan bersamaan → satu 409.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'ProjectFile' }, 404: { description: 'Tidak ditemukan / sudah dihapus permanen' }, 409: { description: 'Tidak di sampah' } },
      },
    },
    '/project-files/projects/{type}/{projectId}/trash': {
      get: {
        tags: ['Project Files'], summary: 'Sampah satu project',
        description: 'Permission: project-file:read. Berkas di sampah dari semua folder user project ini (termasuk folder tahapan), urut paling baru dibuang. Tiap baris memuat `folderName` dan `purgeAt`.',
        parameters: [
          { in: 'path', name: 'type', required: true, schema: { type: 'string', enum: ['construction', 'rental', 'supply'] } },
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: { 200: { description: 'Paginated ProjectFile' }, 404: { description: 'Project tidak ditemukan' } },
      },
    },
    '/project-files/projects/{type}/{projectId}/system-folders/{key}': {
      get: {
        tags: ['Project Files'], summary: 'Isi folder sistem (baca-saja)',
        description: 'Permission: project-file:read (+ `material-request:read` untuk delivery-notes/receipt-proofs). `closing-archive`: arsip XLSX yang dibuat SEKALI saat tahapan (pakai `subProjectId`) atau project (tanpa `subProjectId`) ditutup — tidak bisa diubah, dipindah, atau dibuang ke sampah. Lampiran modul dibaca langsung dari tabel sumber — TIDAK disalin (L7).\n\n' +
          '| archiveKey | Dibuat saat | Isi (satu sheet per baris) |\n|---|---|---|\n' +
          '| `stage-progress` | tahapan ditutup | Kontrak tahapan; progress harian + kondisi lapangan + status validasi |\n' +
          '| `stage-equipment` | tahapan ditutup | Alokasi alat (unit, diterima, status); jam kerja per log + total per unit |\n' +
          '| `stage-material` | tahapan ditutup | Request material + rincian biaya; surat jalan; penerimaan; mutasi stok; saldo per material |\n' +
          '| `project-summary` | project konstruksi ditutup | Rekap tahapan: jenis, status, nilai kontrak, target & volume tervalidasi, progress %, nilai tertagih |\n' +
          '| `supply-deliveries` | supply ditutup | Tanggal, no. surat jalan, jenis kendaraan, nopol, sopir, material, asal, tujuan, volume; total per satuan |\n' +
          '| `rental-timesheet` | rental ditutup (1 file per unit) | Penyewa, periode, alat, operator; per tanggal sesi pagi/siang/overtime (awal, akhir, jam), total jam, hari kerja, keterangan; baris jumlah |\n\n' +
          'Log/dokumen yang dibatalkan tidak ikut. `stage-labor` (tahapan ditutup; Log Pekerja per baris, Rekap per Pekerja, Penugasan) menyusul bersama modul Pekerja — berlaku untuk tahapan yang ditutup sesudahnya.\n\n' +
          '`delivery-notes`: surat jalan aktif tiap delivery (yang sudah diganti tidak tampil). `receipt-proofs`: semua bukti penerimaan. Delivery/receipt yang dibatalkan tetap tampil dengan `cancelled: true` (pembatalan juga riwayat). delivery-notes/receipt-proofs: construction WAJIB `subProjectId` (hidup di tahapan), supply tanpa; rental tidak punya (404). Buka file lewat `GET /api/files/{fileId}/url`.',
        parameters: [
          { in: 'path', name: 'type', required: true, schema: { type: 'string', enum: ['construction', 'rental', 'supply'] } },
          { in: 'path', name: 'projectId', required: true, schema: { type: 'integer' } },
          { in: 'path', name: 'key', required: true, schema: { type: 'string', enum: ['delivery-notes', 'receipt-proofs', 'closing-archive'] } },
          { in: 'query', name: 'subProjectId', schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: { description: 'Paginated. delivery-notes/receipt-proofs: `{ fileId, originalName, mimeType, sizeBytes, kind, uploadedAt, uploadedBy, cancelled, source: { type: "material-delivery"|"material-receipt", id, code, deliveryNoteNumber, materialName, subProjectId, subProjectType } }`. closing-archive: `{ fileId, originalName, mimeType, sizeBytes, uploadedAt, uploadedBy (yang menutup), archiveKey, closedStatus: "completed"|"cancelled", equipmentPoolItemId }` — isi tiap arsip lihat tabel di deskripsi tag/L8' },
          400: { description: 'subProjectId wajib (construction) / dilarang (supply) / bukan tahapan project ini' },
          403: { description: 'Tidak memegang permission read modul sumber' },
          404: { description: 'Project tidak ditemukan / key tidak berlaku untuk jenis project ini' },
        },
      },
    },

    // ========================================
    // 6. APPROVAL CENTER
    // ========================================
    // Dibangun 17 Okt 2026. Keputusan: docs/keputusan-desain-approval-center.md.
    // Approval Center = ANTREAN BACA-SAJA dari VIEW `approval_queue` (UNION ALL tabel sumber).
    // Tidak ada tabel approval_tasks, tidak ada endpoint aksi di sini: approve/reject/validate
    // tetap lewat endpoint modul sumbernya (lihat `actionEndpoints` di tiap baris).
    '/approval-queue': {
      get: {
        tags: ['Approval Center'], summary: 'Antrean dokumen yang menunggu aksi user login',
        description: [
          'Satu endpoint untuk Admin & Finance — tahapnya dipilih lewat `stage`, isinya ditentukan permission (bukan nama role); layar "Approval Center Admin" & "Approval Center Finance" di FE sama-sama memakai endpoint ini. Dibaca dari VIEW `approval_queue`, jadi selalu sama dengan status di tabel sumber (tidak ada salinan yang perlu disinkronkan).',
          '',
          'Tanpa permission khusus. Baris tampil hanya kalau user memegang **permission aksi** tahap itu:',
          '',
          '| sourceType | stage | Masuk antrean saat | Permission | submittedAt |',
          '|---|---|---|---|---|',
          '| `purchase_request` | admin | status `submitted` | `purchase-request:validate` | `created_at` |',
          '| `purchase_request` | finance | status `waiting_finance_approval` | `purchase-request:approve` | `admin_validated_at` |',
          '| `material_request` | admin | status `submitted` | `material-request:validate` | `created_at` |',
          '| `material_request` | finance | status `waiting_finance_approval` | `material-request:approve` | `admin_reviewed_at` |',
          '| `equipment_request` | admin | status `submitted` (hanya `internal_project`) | `equipment-request:review` | `created_at` |',
          '| `progress_log` | admin | status `submitted` | `progress:validate` | `updated_at` |',
          '',
          'Keputusan Divisi Alat atas Request Alat (`equipment_review`) **tidak** masuk — ERD Approval Center membatasi diri pada Admin & Finance.',
          '',
          '**Dokumen yang tidak boleh Anda proses disembunyikan**: yang Anda ajukan/catat sendiri, dan untuk tahap finance yang Anda teruskan sendiri di tahap admin. Endpoint sumber tetap penjaga sebenarnya (403).',
          '',
          'super_admin tidak memegang permission aksi, jadi antreannya selalu kosong — memantau dilakukan lewat list tiap modul.',
          '',
          'Urutan default `oldest` (FIFO): yang paling lama menunggu di atas. Tahap finance Income/Klaim Alat/Finance Field menyusul sebagai `sourceType` baru tanpa mengubah bentuk response.',
        ].join('\n'),
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'stage', schema: { type: 'string', enum: ['admin', 'finance'] }, description: 'Kosong = semua tahap yang boleh Anda proses' },
          { in: 'query', name: 'sourceType', schema: { type: 'string', enum: ['purchase_request', 'material_request', 'equipment_request', 'progress_log'] } },
          { in: 'query', name: 'search', schema: { type: 'string' }, description: 'Cocokkan `referenceCode` atau `context` (tidak peka huruf besar-kecil)' },
          { in: 'query', name: 'sort', schema: { type: 'string', enum: ['oldest', 'newest'], default: 'oldest' } },
        ],
        responses: {
          200: {
            description: 'Paginated (bentuk `paginated()` standar)',
            content: { 'application/json': { schema: { type: 'object', properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: { $ref: '#/components/schemas/ApprovalQueueItem' } },
              meta: { type: 'object', properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, totalPages: { type: 'integer' } } },
            } } } },
          },
          400: { description: 'Nilai `stage`/`sourceType`/`sort` tidak dikenal' },
        },
      },
    },
    '/approval-queue/summary': {
      get: {
        tags: ['Approval Center'], summary: 'Jumlah antrean per jenis — untuk badge tab & menu',
        description: 'Aturan visibilitas sama persis dengan `GET /approval-queue`. Kombinasi yang boleh Anda proses tetap muncul walau jumlahnya 0, supaya FE bisa menentukan tab mana yang ditampilkan dari response ini (bukan dari nama role).',
        responses: { 200: { description: 'Jumlah per tahap & jenis', content: { 'application/json': { schema: { type: 'object', properties: {
          success: { type: 'boolean' },
          data: { type: 'object', properties: {
            total: { type: 'integer', example: 7 },
            items: { type: 'array', items: { type: 'object', properties: {
              stage: { type: 'string', enum: ['admin', 'finance'] },
              sourceType: { type: 'string', example: 'material_request' },
              count: { type: 'integer', example: 3 },
              oldestSubmittedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Untuk menandai antrean yang mengendap' },
            } } },
          } },
        } } } } } },
      },
    },

    // ========================================
    // 7. INCOME
    // ========================================
    '/income/records': {
      get: { tags: ['Income Records'], summary: 'List income records', parameters: [ { $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'projectSourceType', schema: { type: 'string', enum: ['construction_project','external_rental','external_supply'] } }, { in: 'query', name: 'status', schema: { type: 'string' } } ], responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['Income Records'], summary: 'Buat income record', description: 'Role: admin. Construction: progress billing per sub-project. Rental: workhour-based. Supply: material receipt-based.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['projectSourceType', 'billingPeriodStart', 'billingPeriodEnd', 'items'],
          properties: {
            projectSourceType: { type: 'string', enum: ['construction_project','external_rental','external_supply'] },
            constructionProjectId: { type: 'integer' }, externalRentalProjectId: { type: 'integer' }, externalSupplyProjectId: { type: 'integer' },
            billingPeriodStart: { type: 'string', format: 'date' }, billingPeriodEnd: { type: 'string', format: 'date' },
            adminNotes: { type: 'string' },
            items: { type: 'array', items: { type: 'object', required: ['incomeComponentType', 'sourceType', 'quantity', 'unit', 'rateSnapshot', 'subtotalAmount', 'rateSource'],
              properties: {
                incomeComponentType: { type: 'string', enum: ['material_income','equipment_income','contract_progress_income'] },
                sourceType: { type: 'string', enum: ['material_receipt_item','equipment_workhour_log','contract_progress'] },
                subProjectId: { type: 'integer', description: 'Wajib untuk contract_progress' },
                materialReceiptItemId: { type: 'integer' }, equipmentWorkhourLogId: { type: 'integer' }, equipmentItemId: { type: 'integer' },
                description: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' },
                rateSnapshot: { type: 'number' }, subtotalAmount: { type: 'number' },
                rateSource: { type: 'string', enum: ['manual_input','equipment_default_rate','manual_override','contract_reference'] },
                rateNotes: { type: 'string' }
              }
            }}
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/income/records/{id}': { get: { tags: ['Income Records'], summary: 'Detail + items + payments', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } } },
    '/income/records/{id}/verify': { put: { tags: ['Income Records'], summary: 'Finance verify', description: 'Role: finance. Triggers GL journal.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Verified + journal created' } } } },
    '/income/records/{id}/reject': { put: { tags: ['Income Records'], summary: 'Finance reject', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Rejected' } } } },
    '/income/records/{incomeRecordId}/payments': {
      get: { tags: ['Income Payments'], summary: 'List payments per income record', parameters: [{ in: 'path', name: 'incomeRecordId', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Array' } } },
      post: { tags: ['Income Payments'], summary: 'Catat pembayaran client', description: 'Role: finance. Triggers GL journal.',
        parameters: [{ in: 'path', name: 'incomeRecordId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['paymentDate', 'amount'], properties: { paymentDate: { type: 'string', format: 'date' }, amount: { type: 'number' }, payerName: { type: 'string' }, paymentMethod: { type: 'string' }, referenceNumber: { type: 'string' }, proofFile: { type: 'string', format: 'binary' } } } } } },
        responses: { 201: { description: 'Created + journal' } } }
    },
    '/income/claimable-items': {
      get: { tags: ['Equipment Income Claims'], summary: 'List equipment income items siap diklaim', description: 'Role: divisi_alat', responses: { 200: { description: 'Array of claimable items' } } }
    },
    '/income/claims': {
      get: { tags: ['Equipment Income Claims'], summary: 'List equipment income claims', parameters: [{ $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'status', schema: { type: 'string' } }], responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['Equipment Income Claims'], summary: 'Submit klaim pendapatan alat', description: 'Role: divisi_alat',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['claimType', 'periodStart', 'periodEnd', 'items'],
          properties: {
            claimType: { type: 'string', enum: ['regular', 'adjustment_only'] },
            periodStart: { type: 'string', format: 'date' }, periodEnd: { type: 'string', format: 'date' },
            items: { type: 'array', items: { type: 'object', properties: {
              itemType: { type: 'string', enum: ['workhour_income', 'correction_adjustment'] },
              incomeRecordItemId: { type: 'integer' }, equipmentItemId: { type: 'integer' },
              workDate: { type: 'string', format: 'date' }, workhoursSnapshot: { type: 'number' },
              hourlyRateSnapshot: { type: 'number' }, subtotalAmountSnapshot: { type: 'number' },
              correctionRequestId: { type: 'integer' }, adjustmentAmount: { type: 'number' }
            }}}
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/income/claims/{id}': { get: { tags: ['Equipment Income Claims'], summary: 'Detail claim + items', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } } },
    '/income/claims/{id}/approve': { put: { tags: ['Equipment Income Claims'], summary: 'Finance approve claim', description: 'Role: finance. Triggers GL journal + cash-in Kas Alat.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Approved + journal + cash transaction' } } } },
    '/income/claims/{id}/reject': { put: { tags: ['Equipment Income Claims'], summary: 'Finance reject claim', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Rejected' } } } },

    // ========================================
    // 7b. PEKERJA & LOG TENAGA KERJA — docs/skema-tenaga-kerja-harian.md P1–P11
    // ========================================
    '/workers': {
      get: {
        tags: ['Pekerja'], summary: 'List master pekerja',
        description: 'Permission: worker:read. Master GLOBAL — pekerja yang sama dipakai lintas tahapan & project. `search` mencocokkan nama, kode, atau NIK.',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' }, { $ref: '#/components/parameters/SearchParam' }],
        responses: { 200: { description: 'Paginated Worker' } },
      },
      post: {
        tags: ['Pekerja'], summary: 'Daftarkan pekerja',
        description: 'Permission: worker:create (Admin, Lapangan). Cukup `fullName` — pekerja sekali-datang bisa dibuat langsung dari layar input log (P6). `workerCode` dibuat sistem (ditolak kalau dikirim). NIK opsional, 16 digit, unik di antara yang terisi (409).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fullName'], properties: {
          fullName: { type: 'string', maxLength: 150 }, idNumber: { type: 'string', pattern: '^[0-9]{16}$' }, phone: { type: 'string', maxLength: 30 },
          defaultRole: { type: 'string', maxLength: 100 }, joinedAt: { type: 'string', format: 'date', description: 'Tidak di masa depan' }, notes: { type: 'string' },
        } } } } },
        responses: { 201: { description: 'Worker' }, 400: { description: 'Validasi gagal / workerCode dikirim' }, 409: { description: 'NIK sudah terdaftar' } },
      },
    },
    '/workers/{id}': {
      get: {
        tags: ['Pekerja'], summary: 'Detail pekerja + riwayat penugasan',
        description: 'Permission: worker:read. Worker + `assignments` (WorkerAssignment per tahapan, dengan kode project & jenis tahapan) + `laborSummary` per tahapan: `{ subProjectId, loggedDays, totalWage }` — menjawab "bekerja berapa hari di mana".',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Worker + assignments + laborSummary' }, 404: { description: 'Tidak ditemukan' } },
      },
      put: {
        tags: ['Pekerja'], summary: 'Ubah identitas pekerja',
        description: 'Permission: worker:update. Field sama dengan POST, semua opsional; `idNumber: null` mengosongkan NIK. Perbaikan nama ikut tampil di log lama (log merujuk master, P6); upah & peran di log TIDAK berubah.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          fullName: { type: 'string', maxLength: 150 }, idNumber: { type: 'string', nullable: true, pattern: '^[0-9]{16}$' }, phone: { type: 'string', nullable: true },
          defaultRole: { type: 'string', nullable: true }, joinedAt: { type: 'string', format: 'date', nullable: true }, notes: { type: 'string', nullable: true },
        } } } } },
        responses: { 200: { description: 'Worker' }, 409: { description: 'NIK sudah terdaftar' } },
      },
      delete: {
        tags: ['Pekerja'], summary: 'Hapus pekerja (salah input)',
        description: 'Permission: worker:delete (Admin). Hanya kalau belum punya penugasan maupun baris log — selain itu 409.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Dihapus' }, 409: { description: 'Sudah punya penugasan / tercatat di log' } },
      },
    },
    '/worker-assignments': {
      get: {
        tags: ['Pekerja'], summary: 'List penugasan',
        description: 'Permission: worker:read. Wajib salah satu: `subProjectId` (daftar pekerja tahapan — layar WorkersPage) atau `projectWorkerId`. `activeOn=YYYY-MM-DD` = hanya yang bertugas pada tanggal itu (startDate ≤ tanggal ≤ endDate/kosong) — dipakai FE untuk mengisi awal log harian. `active=true|false` = relatif hari ini. Tanpa paginasi kalau `subProjectId` diisi (satu tahapan = puluhan baris).',
        parameters: [
          { in: 'query', name: 'subProjectId', schema: { type: 'integer' } },
          { in: 'query', name: 'projectWorkerId', schema: { type: 'integer' } },
          { in: 'query', name: 'workerType', schema: { type: 'string', enum: ['contract', 'daily'] } },
          { in: 'query', name: 'active', schema: { type: 'string', enum: ['true', 'false'] } },
          { in: 'query', name: 'activeOn', schema: { type: 'string', format: 'date' } },
          { $ref: '#/components/parameters/SearchParam' },
        ],
        responses: { 200: { description: 'Array WorkerAssignment (+ `summary`: total, aktif, upah harian aktif)' }, 400: { description: 'subProjectId / projectWorkerId wajib salah satu' } },
      },
      post: {
        tags: ['Pekerja'], summary: 'Tugaskan pekerja ke tahapan',
        description: 'Permission: worker:create. Tahapan `planned`/`active` (409 selainnya, termasuk ditutup). Satu penugasan per (tahapan, pekerja) — 409 kalau sudah ada (ubah yang ada, mis. kosongkan endDate untuk memanggil kembali). Penugasan opsional untuk pekerja harian; log tetap bisa mencatat pekerja tanpa penugasan.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subProjectId', 'projectWorkerId', 'workerType', 'dailyWage', 'startDate'], properties: {
          subProjectId: { type: 'integer' }, projectWorkerId: { type: 'integer' },
          workerType: { type: 'string', enum: ['contract', 'daily'] }, assignedRole: { type: 'string', maxLength: 100 },
          dailyWage: { type: 'number', minimum: 1 }, startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date', description: '≥ startDate' }, notes: { type: 'string' },
        } } } } },
        responses: { 201: { description: 'WorkerAssignment' }, 400: { description: 'Validasi gagal' }, 404: { description: 'Tahapan / pekerja tidak ditemukan' }, 409: { description: 'Sudah ditugaskan / tahapan tidak planned-active' } },
      },
    },
    '/worker-assignments/{id}': {
      get: { tags: ['Pekerja'], summary: 'Detail penugasan', description: 'Permission: worker:read.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'WorkerAssignment' } } },
      put: {
        tags: ['Pekerja'], summary: 'Ubah penugasan / keluarkan dari tahapan',
        description: 'Permission: worker:update. `subProjectId` & `projectWorkerId` tidak bisa diubah (400). "Keluarkan" = isi `endDate`; panggil kembali = `endDate: null`. Mengubah `dailyWage` TIDAK mengubah log yang sudah tercatat (upah disimpan per baris log). Tahapan ditutup → 409. Saat tahapan ditutup, penugasan dengan endDate kosong diisi tanggal penutupan otomatis.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          workerType: { type: 'string', enum: ['contract', 'daily'] }, assignedRole: { type: 'string', nullable: true },
          dailyWage: { type: 'number', minimum: 1 }, startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date', nullable: true }, notes: { type: 'string', nullable: true },
        } } } } },
        responses: { 200: { description: 'WorkerAssignment' }, 409: { description: 'Tahapan ditutup' } },
      },
      delete: {
        tags: ['Pekerja'], summary: 'Hapus penugasan (salah input)',
        description: 'Permission: worker:delete (Admin). Hanya kalau pekerja itu belum pernah tercatat di log tahapan ini — selain itu 409 (keluarkan lewat endDate).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Dihapus' }, 409: { description: 'Sudah tercatat di log / tahapan ditutup' } },
      },
    },
    '/labor-logs': {
      get: {
        tags: ['Log Tenaga Kerja'], summary: 'List log per tahapan',
        description: 'Permission: labor-log:read. Urut workDate terbaru. Tiap log memuat `summary` (total orang, kontrak/harian, lembur, total upah) tanpa items. `projectWorkerId` = log yang memuat pekerja itu. Response juga memuat `periodSummary` atas SEMUA log yang cocok filter (bukan hanya halaman ini).',
        parameters: [
          { in: 'query', name: 'subProjectId', required: true, schema: { type: 'integer' } },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'projectWorkerId', schema: { type: 'integer' } },
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: { 200: { description: 'Paginated LaborLog (tanpa items) + periodSummary' } },
      },
      post: {
        tags: ['Log Tenaga Kerja'], summary: 'Catat log harian (header + semua pekerja sekaligus)',
        description: 'Permission: labor-log:create (Lapangan). Satu transaksi (P9). Tahapan harus `active` dan belum ditutup (409); `workDate` tidak di masa depan; satu log per (tahapan, tanggal) — 409, ubah yang ada. `items` minimal 1; tiap baris WAJIB `projectWorkerId` (P6 — pekerja baru dibuat dulu lewat POST /workers), tidak boleh dobel dalam satu log (400), dan pekerja yang sama tidak boleh sudah tercatat di log LAIN pada tanggal yang sama di tahapan/project mana pun (409 menyebut tahapannya, P10). `workerRole`/`workerType`/`dailyWage` dikirim apa adanya — FE mengisinya awal dari penugasan (`GET /worker-assignments?subProjectId=&activeOn=`). Total TIDAK dikirim (dihitung; ditolak kalau dikirim).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subProjectId', 'workDate', 'items'], properties: {
          subProjectId: { type: 'integer' }, workDate: { type: 'string', format: 'date' }, notes: { type: 'string' },
          items: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'object', required: ['projectWorkerId', 'workerRole', 'workerType', 'dailyWage'], properties: {
            projectWorkerId: { type: 'integer' }, workerRole: { type: 'string', maxLength: 100 },
            workerType: { type: 'string', enum: ['contract', 'daily'] }, dailyWage: { type: 'number', minimum: 1 },
            overtimeAmount: { type: 'number', minimum: 0, default: 0, description: 'Rupiah; alasan di taskNotes (P7)' }, taskNotes: { type: 'string' },
          } } },
        } } } } },
        responses: { 201: { description: 'LaborLog dengan items' }, 400: { description: 'Validasi gagal / pekerja dobel dalam log' }, 404: { description: 'Tahapan / pekerja tidak ditemukan' }, 409: { description: 'Tahapan tidak aktif atau ditutup / log tanggal itu sudah ada / pekerja sudah tercatat di log lain tanggal itu' } },
      },
    },
    '/labor-logs/{id}': {
      get: {
        tags: ['Log Tenaga Kerja'], summary: 'Detail log + semua pekerja',
        description: 'Permission: labor-log:read. Items diurut nama; tiap baris memuat `assignmentDailyWage` & `wageDiffersFromAssignment`.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'LaborLog dengan items' }, 404: { description: 'Tidak ditemukan' } },
      },
      put: {
        tags: ['Log Tenaga Kerja'], summary: 'Ubah log — kirim DAFTAR LENGKAP pekerja',
        description: 'Permission: labor-log:update (Lapangan). `items` (kalau dikirim) = daftar lengkap; server menyelaraskan per projectWorkerId: yang ada diubah (id baris tetap), yang baru dibuat, yang tidak dikirim dihapus (P9). Aturan baris sama dengan POST. `subProjectId` & `workDate` tidak bisa diubah (400) — salah tanggal = hapus lalu catat ulang (P8). Tahapan ditutup → 409. `updatedBy` dicatat. (Sesi klaim: log yang sudah diklaim akan ditolak 409.)',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {
          notes: { type: 'string', nullable: true },
          items: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'object', required: ['projectWorkerId', 'workerRole', 'workerType', 'dailyWage'], properties: {
            projectWorkerId: { type: 'integer' }, workerRole: { type: 'string' }, workerType: { type: 'string', enum: ['contract', 'daily'] },
            dailyWage: { type: 'number', minimum: 1 }, overtimeAmount: { type: 'number', minimum: 0 }, taskNotes: { type: 'string', nullable: true },
          } } },
        } } } } },
        responses: { 200: { description: 'LaborLog dengan items' }, 400: { description: 'Validasi gagal' }, 409: { description: 'Tahapan ditutup / pekerja sudah tercatat di log lain tanggal itu' } },
      },
      delete: {
        tags: ['Log Tenaga Kerja'], summary: 'Hapus log beserta barisnya',
        description: 'Permission: labor-log:delete (Lapangan). Tahapan ditutup → 409. (Sesi klaim: log yang sudah diklaim akan ditolak 409.)',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Dihapus' }, 409: { description: 'Tahapan ditutup' } },
      },
    },

    // ========================================
    // 8. FINANCE FIELD & LABOR
    // ========================================
    '/finance-field/operational-requests': {
      get: { tags: ['Finance Field'], summary: 'List operational requests', parameters: [{ $ref: '#/components/parameters/PageParam' }], responses: { 200: { description: 'Paginated list' } } },
      post: { tags: ['Finance Field'], summary: 'Buat request operasional', description: 'Role: lapangan',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subProjectId', 'requestDate', 'requestCategory', 'items'], properties: { subProjectId: { type: 'integer' }, requestDate: { type: 'string', format: 'date' }, requestCategory: { type: 'string', enum: ['bbm','konsumsi','operasional','emergency','other'] }, items: { type: 'array', items: { type: 'object' } } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/finance-field/operational-requests/{id}/approve': { put: { tags: ['Finance Field'], summary: 'Admin approve', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Approved' } } } },
    '/finance-field/expense-reports': {
      post: { tags: ['Finance Field'], summary: 'Submit expense report', description: 'Role: lapangan',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { operationalRequestId: { type: 'integer' }, reportDate: { type: 'string', format: 'date' }, items: { type: 'string', description: 'JSON array' }, attachments: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/finance-field/expense-reports/{id}/validate': { put: { tags: ['Finance Field'], summary: 'Finance validate', description: 'Role: finance. Triggers GL journal.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Validated + journal' } } } },
    '/finance-field/wage-claims': {
      get: { tags: ['Daily Labor'], summary: 'List wage claims', parameters: [{ $ref: '#/components/parameters/PageParam' }], responses: { 200: { description: 'Paginated list' } } },
      post: { tags: ['Daily Labor'], summary: 'Buat wage claim', description: 'Role: lapangan',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subProjectId', 'claimPeriodStart', 'claimPeriodEnd', 'dailyLaborLogIds'], properties: { subProjectId: { type: 'integer' }, claimPeriodStart: { type: 'string', format: 'date' }, claimPeriodEnd: { type: 'string', format: 'date' }, dailyLaborLogIds: { type: 'array', items: { type: 'integer' } } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/finance-field/wage-claims/{id}/approve': { put: { tags: ['Daily Labor'], summary: 'Admin approve wage claim', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Approved' } } } },
    '/finance-field/wage-claims/{claimId}/payment-proofs': {
      post: { tags: ['Daily Labor'], summary: 'Submit bukti pembayaran upah', description: 'Role: lapangan',
        parameters: [{ in: 'path', name: 'claimId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { proofDate: { type: 'string', format: 'date' }, totalPaidAmount: { type: 'number' }, attachments: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/finance-field/payment-proofs/{id}/validate': { put: { tags: ['Daily Labor'], summary: 'Finance validate proof', description: 'Role: finance. Triggers GL journal.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Validated + journal' } } } },

    // ========================================
    // 9. FINANCE ACCOUNTING
    // ========================================
    '/finance-accounting/coa': {
      get: { tags: ['Chart of Accounts'], summary: 'List COA', parameters: [{ in: 'query', name: 'accountType', schema: { type: 'string', enum: ['asset','liability','equity','revenue','expense'] } }, { in: 'query', name: 'isActive', schema: { type: 'boolean' } }], responses: { 200: { description: 'Array' } } },
      post: { tags: ['Chart of Accounts'], summary: 'Tambah akun', description: 'Role: finance',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['accountCode', 'accountName', 'accountType', 'normalBalance'], properties: { accountCode: { type: 'string' }, accountName: { type: 'string' }, accountType: { type: 'string', enum: ['asset','liability','equity','revenue','expense'] }, normalBalance: { type: 'string', enum: ['debit','credit'] }, parentAccountId: { type: 'integer' }, isDivisionAccount: { type: 'boolean' } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/finance-accounting/coa/{id}': {
      put: { tags: ['Chart of Accounts'], summary: 'Update akun', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Chart of Accounts'], summary: 'Nonaktifkan akun', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Deactivated' } } }
    },
    '/finance-accounting/journals': {
      get: { tags: ['Journal Entries'], summary: 'List jurnal', parameters: [ { $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'ledgerScope', schema: { type: 'string' } }, { in: 'query', name: 'status', schema: { type: 'string', enum: ['draft','posted','cancelled'] } }, { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } } ], responses: { 200: { description: 'Paginated list' } } },
      post: { tags: ['Journal Entries'], summary: 'Manual journal entry', description: 'Role: finance',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['journalDate', 'lines'], properties: { journalDate: { type: 'string', format: 'date' }, description: { type: 'string' }, lines: { type: 'array', items: { type: 'object', required: ['accountId'], properties: { accountId: { type: 'integer' }, debitAmount: { type: 'number', default: 0 }, creditAmount: { type: 'number', default: 0 }, description: { type: 'string' } } } } } } } } },
        responses: { 201: { description: 'Created as draft' } } }
    },
    '/finance-accounting/journals/{id}': { get: { tags: ['Journal Entries'], summary: 'Detail jurnal + lines', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } } },
    '/finance-accounting/journals/{id}/post': { put: { tags: ['Journal Entries'], summary: 'Post jurnal', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Posted' } } } },
    '/finance-accounting/corrections': {
      get: { tags: ['Financial Corrections'], summary: 'List corrections', parameters: [{ $ref: '#/components/parameters/PageParam' }], responses: { 200: { description: 'Paginated list' } } },
      post: { tags: ['Financial Corrections'], summary: 'Buat correction request', description: 'Role: finance',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['sourceType', 'sourceId', 'correctionMethod', 'reason'], properties: { sourceType: { type: 'string' }, sourceId: { type: 'integer' }, correctionMethod: { type: 'string', enum: ['reverse_and_replace','delta_adjustment'] }, originalAmount: { type: 'number' }, correctedAmount: { type: 'number' }, reason: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } } }
    },

    // ========================================
    // 10. PAYROLL
    // ========================================
    '/payroll/employees': {
      get: { tags: ['Employees'], summary: 'List karyawan tetap', parameters: [{ $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/SearchParam' }], responses: { 200: { description: 'Paginated list' } } },
      post: { tags: ['Employees'], summary: 'Tambah karyawan', description: 'Role: admin',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['employeeCode', 'fullName', 'position', 'joinDate'], properties: { employeeCode: { type: 'string' }, fullName: { type: 'string' }, position: { type: 'string' }, department: { type: 'string' }, joinDate: { type: 'string', format: 'date' }, baseSalary: { type: 'number' }, bankAccountNo: { type: 'string' }, bankName: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/payroll/employees/{id}': {
      get: { tags: ['Employees'], summary: 'Detail karyawan', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: { tags: ['Employees'], summary: 'Update karyawan', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } }
    },
    '/payroll/periods': {
      get: { tags: ['Payroll'], summary: 'List periode payroll', responses: { 200: { description: 'Array' } } },
      post: { tags: ['Payroll'], summary: 'Buat periode payroll', description: 'Role: finance',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['periodCode', 'periodName', 'startDate', 'endDate'], properties: { periodCode: { type: 'string' }, periodName: { type: 'string' }, startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/payroll/periods/{id}/calculate': { post: { tags: ['Payroll'], summary: 'Hitung gaji semua karyawan', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Calculated' } } } },
    '/payroll/periods/{id}/approve': { put: { tags: ['Payroll'], summary: 'Approve payroll', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Approved' } } } },
    '/payroll/periods/{id}/pay': { put: { tags: ['Payroll'], summary: 'Tandai sudah dibayar', description: 'Role: finance. Triggers GL journal.', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Paid + journal' } } } },
    '/payroll/periods/{id}/slips': { get: { tags: ['Payroll'], summary: 'List slip gaji', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Array of salary slips' } } } }
  }
};

module.exports = swaggerSpec;
