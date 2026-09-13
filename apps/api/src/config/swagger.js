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
    { name: 'Approval Center', description: 'Approval terpusat lintas modul' },
    { name: 'Income Records', description: 'Pencatatan pendapatan dan billing' },
    { name: 'Income Payments', description: 'Pembayaran client' },
    { name: 'Equipment Income Claims', description: 'Klaim pendapatan alat oleh Divisi Alat' },
    { name: 'Finance Field', description: 'Pengeluaran operasional lapangan' },
    { name: 'Daily Labor', description: 'Upah harian dan klaim pembayaran' },
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
        tags: ['Auth'], summary: 'Register user baru', security: [],
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
          409: { description: 'Melepas super_admin aktif terakhir' }
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
          409: { description: 'Melepas super_admin aktif terakhir' }
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
        tags: ['Roles'], summary: 'Set ulang permission role', description: 'Permission: role:update. Mengganti semua permission role dengan daftar yang dikirim (untuk halaman matrix).',
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
        description: 'Role: admin',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['projectCode', 'projectName'],
          properties: {
            projectCode: { type: 'string', example: 'PRJ-001' },
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
      delete: {
        tags: ['Construction Projects'], summary: 'Cancel construction project', description: 'Role: admin',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Cancelled' } }
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
              subProjectId: { type: 'integer' }, targetVolume: { type: 'number' },
              realizedVolume: { type: 'number' }, progressPercentage: { type: 'number' },
              contractValue: { type: 'number' }, billedAmount: { type: 'number' },
              paidAmount: { type: 'number' }, remainingAmount: { type: 'number' }
            }}
          }
        }}}}}
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
        responses: { 201: { description: 'Created' } }
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
          type: 'object', required: ['rentalProjectCode', 'rentalProjectName'],
          properties: {
            rentalProjectCode: { type: 'string' }, rentalProjectName: { type: 'string' },
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
      delete: { tags: ['External Rental'], summary: 'Cancel', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Cancelled' } } }
    },

    // ========================================
    // 2.5 EXTERNAL SUPPLY
    // ========================================
    '/projects/external-supply': {
      get: { tags: ['External Supply'], summary: 'List external supply projects', responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['External Supply'], summary: 'Buat external supply project', description: 'Role: admin',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['supplyProjectCode', 'supplyProjectName'],
          properties: {
            supplyProjectCode: { type: 'string' }, supplyProjectName: { type: 'string' },
            clientName: { type: 'string' }, contractNo: { type: 'string' },
            contractStartDate: { type: 'string', format: 'date' }, contractEndDate: { type: 'string', format: 'date' }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/projects/external-supply/{id}': {
      get: { tags: ['External Supply'], summary: 'Detail', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: { tags: ['External Supply'], summary: 'Update', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['External Supply'], summary: 'Cancel', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Cancelled' } } }
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
        tags: ['Equipment Items'], summary: 'List unit alat', description: 'Permission: equipment:read',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'typeId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['available','assigned','delivered_to_location','received_at_site','in_use','maintenance','damaged','retired'] } },
          { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
          { $ref: '#/components/parameters/SearchParam' }
        ],
        responses: { 200: { description: 'Paginated list', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } } } }
      },
      post: {
        tags: ['Equipment Items'], summary: 'Tambah unit alat', description: 'Role: divisi_alat. Permission: equipment:create. `assetCode` DIBUAT OTOMATIS oleh sistem dengan format SSB-{typeCode}-{NNN} (mis. SSB-EXC-001) — hanya super_admin yang boleh mengirimnya manual. Status awal `available` dan otomatis tercatat di status log.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentTypeId'],
          properties: {
            equipmentTypeId: { type: 'integer' },
            assetCode: { type: 'string', example: 'SSB-EXC-007', description: 'HANYA super_admin. Kosongkan agar sistem yang membuat. Kalau kodenya mengikuti pola generate, counter jenis alat ikut dimajukan.' },
            plateNumber: { type: 'string', description: 'Nullable — hanya alat berplat (dump truck dsb) yang mengisinya' }, serialNumber: { type: 'string' },
            brand: { type: 'string' }, model: { type: 'string' },
            manufactureYear: { type: 'integer', example: 2019 },
            defaultHourlyRate: { type: 'number', example: 500000, description: 'Default rate income alat; modul Income tetap pakai rate_snapshot sendiri' },
            rateNotes: { type: 'string' }, notes: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created, assetCode terisi otomatis' }, 400: { description: 'Validasi gagal' }, 403: { description: 'assetCode manual dikirim oleh non-super_admin' }, 404: { description: 'Jenis alat tidak ditemukan' }, 409: { description: 'assetCode sudah dipakai / jenis alat nonaktif' } }
      }
    },
    '/equipment/items/{id}': {
      get: {
        tags: ['Equipment Items'], summary: 'Detail unit alat + status history + ringkasan workhour', description: 'Permission: equipment:read. statusHistory berisi 10 perubahan status terakhir.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Detail + statusHistory + workhourSummary' }, 404: { description: 'Tidak ditemukan' } }
      },
      put: {
        tags: ['Equipment Items'], summary: 'Update unit alat', description: 'Permission: equipment:update. `assetCode` hanya bisa diubah super_admin. `currentStatus` TIDAK bisa diubah di sini — pakai PUT /equipment/items/{id}/status. `rateUpdatedAt` otomatis terisi saat defaultHourlyRate berubah.',
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
        responses: { 200: { description: 'Updated' }, 403: { description: 'Ubah assetCode oleh non-super_admin' }, 404: { description: 'Tidak ditemukan' }, 409: { description: 'assetCode sudah dipakai' } }
      },
      delete: {
        tags: ['Equipment Items'], summary: 'Soft delete unit alat', description: 'Permission: equipment:delete. Set isActive=false. Ditolak kalau alat sedang assigned/delivered/received/in_use.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Dinonaktifkan' }, 409: { description: 'Alat sedang terpakai / sudah nonaktif' } }
      }
    },
    '/equipment/items/{id}/status': {
      put: {
        tags: ['Equipment Items'], summary: 'Ubah status alat', description: 'Permission: equipment:update. Satu-satunya jalur ubah status; setiap perubahan ditulis ke equipment_status_logs.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['status'],
          properties: {
            status: { type: 'string', enum: ['available','assigned','delivered_to_location','received_at_site','in_use','maintenance','damaged','retired'] },
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
        tags: ['Workhour Logs'], summary: 'Catat jam kerja alat', description: 'Role: lapangan. Permission: workhour:create. Menambah total_workhour alat dalam satu transaksi.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentItemId', 'workDate', 'totalWorkhour', 'sourceType'],
          properties: {
            equipmentItemId: { type: 'integer' },
            projectId: { type: 'integer', description: 'Diisi untuk sourceType internal_project. FK menyusul saat modul Project dibangun.' },
            subProjectId: { type: 'integer' },
            workDate: { type: 'string', format: 'date', example: '2026-09-11' },
            startedAt: { type: 'string', format: 'date-time' }, stoppedAt: { type: 'string', format: 'date-time' },
            totalWorkhour: { type: 'number', example: 8, description: 'Lebih dari 0, maksimal 24. Akumulasi per alat per hari juga dibatasi 24 jam.' },
            sourceType: { type: 'string', enum: ['internal_project', 'external_rental', 'manual_adjustment'] },
            description: { type: 'string' }
          }
        }}}},
        responses: {
          201: { description: 'Created' }, 400: { description: 'Validasi gagal / tanggal di masa depan' },
          404: { description: 'Unit alat tidak ditemukan' }, 409: { description: 'Alat nonaktif / total jam per hari melebihi 24' }
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
          { in: 'query', name: 'sourceType', schema: { type: 'string', enum: ['internal_project', 'external_rental', 'manual_adjustment'] } }
        ],
        responses: { 200: { description: 'Paginated workhour logs + summary' }, 404: { description: 'Unit alat tidak ditemukan' } }
      }
    },
    '/equipment/maintenance/aspects': {
      get: { tags: ['Maintenance'], summary: 'List aspek maintenance', responses: { 200: { description: 'Array' } } },
      post: {
        tags: ['Maintenance'], summary: 'Tambah aspek maintenance', description: 'Role: divisi_alat',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['aspectCode', 'aspectName', 'unit'],
          properties: { aspectCode: { type: 'string', example: 'OLI-MSN' }, aspectName: { type: 'string', example: 'Oli Mesin' }, unit: { type: 'string', example: 'hour' }, defaultThresholdValue: { type: 'number', example: 250 } }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/equipment/items/{itemId}/maintenance-settings': {
      get: { tags: ['Maintenance'], summary: 'List maintenance settings per alat', parameters: [{ in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Array' } } },
      post: {
        tags: ['Maintenance'], summary: 'Tambah maintenance setting', description: 'Role: divisi_alat',
        parameters: [{ in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['maintenanceAspectId', 'thresholdValue'],
          properties: { maintenanceAspectId: { type: 'integer' }, thresholdValue: { type: 'number' }, warningValue: { type: 'number' } }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/equipment/maintenance-records': {
      post: {
        tags: ['Maintenance'], summary: 'Catat tindakan maintenance', description: 'Role: divisi_alat',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['maintenanceDate', 'actionType'],
          properties: {
            maintenanceSettingId: { type: 'integer', nullable: true }, damageLogId: { type: 'integer', nullable: true },
            purchaseRequestItemId: { type: 'integer', nullable: true },
            maintenanceDate: { type: 'string', format: 'date' }, workhourAtMaintenance: { type: 'number' },
            actionType: { type: 'string', enum: ['inspection','service','replacement','reset','repair'] },
            description: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created + maintenance setting reset' } }
      }
    },
    '/equipment/damage-logs': {
      get: {
        tags: ['Damage Logs'], summary: 'List laporan kerusakan',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['reported','under_review','in_maintenance','resolved','cancelled'] } },
          { in: 'query', name: 'damageLevel', schema: { type: 'string', enum: ['low','medium','high','critical'] } }
        ],
        responses: { 200: { description: 'Paginated list' } }
      },
      post: {
        tags: ['Damage Logs'], summary: 'Laporkan kerusakan', description: 'Role: divisi_alat, lapangan',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: {
          type: 'object', required: ['equipmentItemId', 'damageDate', 'damageLevel', 'description'],
          properties: {
            equipmentItemId: { type: 'integer' }, projectId: { type: 'integer' }, subProjectId: { type: 'integer' },
            damageDate: { type: 'string', format: 'date-time' },
            damageLevel: { type: 'string', enum: ['low','medium','high','critical'] },
            description: { type: 'string' }, attachments: { type: 'array', items: { type: 'string', format: 'binary' } }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/equipment/damage-logs/{id}/resolve': {
      put: {
        tags: ['Damage Logs'], summary: 'Tandai kerusakan resolved', description: 'Role: divisi_alat',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { resolutionNotes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Resolved' } }
      }
    },
    '/equipment/purchase-requests': {
      get: { tags: ['Purchase Requests'], summary: 'List purchase requests', parameters: [ { $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'status', schema: { type: 'string' } } ], responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['Purchase Requests'], summary: 'Ajukan servis/sparepart', description: 'Role: divisi_alat',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['requestDate', 'purpose', 'items'],
          properties: {
            requestDate: { type: 'string', format: 'date' }, purpose: { type: 'string' }, description: { type: 'string' },
            items: { type: 'array', items: { type: 'object', required: ['itemType', 'itemName', 'quantity', 'unit', 'estimatedUnitPrice'],
              properties: {
                maintenanceSettingId: { type: 'integer', nullable: true }, damageLogId: { type: 'integer', nullable: true },
                itemType: { type: 'string', enum: ['service','sparepart','consumable','other'] },
                itemName: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' },
                estimatedUnitPrice: { type: 'number' }
              }
            }}
          }
        }}}},
        responses: { 201: { description: 'Created with items' } }
      }
    },
    '/equipment/purchase-requests/{id}': {
      get: { tags: ['Purchase Requests'], summary: 'Detail + items + status', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } }
    },
    '/equipment/purchase-requests/{id}/validate': {
      put: { tags: ['Purchase Requests'], summary: 'Admin validasi', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Validated' } } }
    },
    '/equipment/purchase-requests/{id}/approve': {
      put: { tags: ['Purchase Requests'], summary: 'Finance approve', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { approvedItems: { type: 'array', items: { type: 'object', properties: { itemId: { type: 'integer' }, approvedAmount: { type: 'number' } } } }, notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Approved' } } }
    },
    '/equipment/purchase-requests/{id}/reject': {
      put: { tags: ['Purchase Requests'], summary: 'Tolak purchase request', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Rejected' } } }
    },
    '/equipment/purchase-requests/{id}/complete': {
      put: { tags: ['Purchase Requests'], summary: 'Tandai selesai', description: 'Role: divisi_alat', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Completed' } } }
    },
    '/equipment/cash/balance': {
      get: { tags: ['Kas Divisi Alat'], summary: 'Saldo kas alat saat ini', responses: { 200: { description: 'Balance', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { currentBalance: { type: 'number' }, lastTransactionDate: { type: 'string' } } } } } } } } } }
    },
    '/equipment/cash/transactions': {
      get: { tags: ['Kas Divisi Alat'], summary: 'List transaksi kas', parameters: [ { $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'direction', schema: { type: 'string', enum: ['in','out'] } }, { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } } ], responses: { 200: { description: 'Paginated transactions' } } }
    },

    // ========================================
    // 4. REQUEST ALAT
    // ========================================
    '/request-alat': {
      get: { tags: ['Request Alat'], summary: 'List request alat', parameters: [ { $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'status', schema: { type: 'string' } }, { in: 'query', name: 'requestType', schema: { type: 'string', enum: ['internal_project','external_rental'] } } ], responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['Request Alat'], summary: 'Buat request alat', description: 'Role: lapangan',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['requestType', 'requestDate', 'items'],
          properties: {
            requestType: { type: 'string', enum: ['internal_project', 'external_rental'] },
            subProjectId: { type: 'integer', description: 'Wajib untuk internal_project' },
            externalRentalProjectId: { type: 'integer', description: 'Wajib untuk external_rental' },
            requestDate: { type: 'string', format: 'date' }, neededDate: { type: 'string', format: 'date' },
            locationDetail: { type: 'string' }, requestNotes: { type: 'string' },
            items: { type: 'array', items: { type: 'object', required: ['equipmentTypeId', 'requestedQuantity'],
              properties: { equipmentTypeId: { type: 'integer' }, requestedQuantity: { type: 'integer' }, estimatedWorkhours: { type: 'number' }, itemNotes: { type: 'string' } }
            }}
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/request-alat/{id}': { get: { tags: ['Request Alat'], summary: 'Detail request + items', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } } },
    '/request-alat/{id}/admin-review': {
      put: { tags: ['Request Alat'], summary: 'Admin review', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['forward', 'reject'] }, notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Reviewed' } } }
    },
    '/request-alat/{id}/equipment-review': {
      put: { tags: ['Request Alat'], summary: 'Divisi Alat review', description: 'Role: divisi_alat', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['approve', 'partially_approve', 'reject'] }, items: { type: 'array', items: { type: 'object', properties: { itemId: { type: 'integer' }, approvedQuantity: { type: 'integer' }, assignedEquipmentIds: { type: 'array', items: { type: 'integer' } } } } }, notes: { type: 'string' } } } } } },
        responses: { 200: { description: 'Reviewed' } } }
    },

    // ========================================
    // 5. REQUEST MATERIAL
    // ========================================
    '/request-material': {
      get: { tags: ['Request Material'], summary: 'List request material', parameters: [{ $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'status', schema: { type: 'string' } }], responses: { 200: { description: 'Paginated list' } } },
      post: {
        tags: ['Request Material'], summary: 'Buat request material', description: 'Role: lapangan',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['subProjectId', 'requestDate', 'items'],
          properties: {
            subProjectId: { type: 'integer' }, requestDate: { type: 'string', format: 'date' },
            items: { type: 'array', items: { type: 'object', required: ['materialTypeId', 'requestedQuantity', 'unit'],
              properties: { materialTypeId: { type: 'integer' }, requestedQuantity: { type: 'number' }, unit: { type: 'string' }, notes: { type: 'string' } }
            }}
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/request-material/{id}': { get: { tags: ['Request Material'], summary: 'Detail', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail + items + funding status' } } } },
    '/request-material/{id}/funding-request': {
      post: { tags: ['Request Material'], summary: 'Admin buat funding request ke Finance', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', properties: { materialRequestItemId: { type: 'integer' }, fundingCategory: { type: 'string', enum: ['material_cost','delivery_fee','driver_fee','fuel_cost','other'] }, estimatedAmount: { type: 'number' } } } } } } } } },
        responses: { 201: { description: 'Created' } } }
    },
    '/request-material/{id}/funding-approve': { put: { tags: ['Request Material'], summary: 'Finance approve funding', description: 'Role: finance', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Approved' } } } },
    '/request-material/{id}/deliveries': {
      post: { tags: ['Request Material'], summary: 'Catat pengiriman', description: 'Role: admin', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 201: { description: 'Created' } } }
    },
    '/request-material/deliveries/{deliveryId}/receipts': {
      post: { tags: ['Request Material'], summary: 'Lapangan input penerimaan material', description: 'Role: lapangan', parameters: [{ in: 'path', name: 'deliveryId', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { items: { type: 'string', description: 'JSON array of receipt items' }, attachments: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
        responses: { 201: { description: 'Created' } } }
    },

    // ========================================
    // 6. APPROVAL CENTER
    // ========================================
    '/approvals': {
      get: { tags: ['Approval Center'], summary: 'List pending approvals untuk user login',
        parameters: [{ $ref: '#/components/parameters/PageParam' }, { in: 'query', name: 'sourceType', schema: { type: 'string' } }, { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending','approved','rejected'] } }],
        responses: { 200: { description: 'Paginated approval items' } } }
    },
    '/approvals/{id}': { get: { tags: ['Approval Center'], summary: 'Detail approval + source data', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } } },
    '/approvals/{id}/approve': { put: { tags: ['Approval Center'], summary: 'Approve', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Approved' } } } },
    '/approvals/{id}/reject': { put: { tags: ['Approval Center'], summary: 'Reject', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'string' } } } } } }, responses: { 200: { description: 'Rejected' } } } },

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
