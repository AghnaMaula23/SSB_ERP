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
      get: { tags: ['Equipment Types'], summary: 'List jenis alat', responses: { 200: { description: 'Array' } } },
      post: {
        tags: ['Equipment Types'], summary: 'Tambah jenis alat', description: 'Role: divisi_alat',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['typeCode', 'typeName'],
          properties: { typeCode: { type: 'string', example: 'EXC' }, typeName: { type: 'string', example: 'Excavator' }, description: { type: 'string' } }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/equipment/types/{id}': {
      put: { tags: ['Equipment Types'], summary: 'Update jenis alat', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Equipment Types'], summary: 'Hapus jenis alat', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Deleted' } } }
    },
    '/equipment/items': {
      get: {
        tags: ['Equipment Items'], summary: 'List unit alat',
        parameters: [
          { $ref: '#/components/parameters/PageParam' }, { $ref: '#/components/parameters/LimitParam' },
          { in: 'query', name: 'typeId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['available','assigned','in_use','maintenance','damaged','retired'] } },
          { $ref: '#/components/parameters/SearchParam' }
        ],
        responses: { 200: { description: 'Paginated list' } }
      },
      post: {
        tags: ['Equipment Items'], summary: 'Tambah unit alat', description: 'Role: divisi_alat',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentTypeId', 'assetCode'],
          properties: {
            equipmentTypeId: { type: 'integer' }, assetCode: { type: 'string', example: 'EXC-001' },
            plateNumber: { type: 'string' }, serialNumber: { type: 'string' },
            brand: { type: 'string' }, model: { type: 'string' },
            manufactureYear: { type: 'integer' }, defaultHourlyRate: { type: 'number', example: 500000 },
            notes: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/equipment/items/{id}': {
      get: { tags: ['Equipment Items'], summary: 'Detail unit alat + status + maintenance summary', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Detail' } } },
      put: { tags: ['Equipment Items'], summary: 'Update unit alat', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Equipment Items'], summary: 'Soft delete unit alat', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Deleted' } } }
    },
    '/equipment/workhour-logs': {
      post: {
        tags: ['Workhour Logs'], summary: 'Catat jam kerja alat', description: 'Role: lapangan',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['equipmentItemId', 'workDate', 'startedAt', 'totalWorkhour', 'sourceType'],
          properties: {
            equipmentItemId: { type: 'integer' }, subProjectEquipmentAllocationId: { type: 'integer' },
            equipmentPoolItemId: { type: 'integer' },
            workDate: { type: 'string', format: 'date' },
            startedAt: { type: 'string', format: 'date-time' }, stoppedAt: { type: 'string', format: 'date-time' },
            pausedDurationMinutes: { type: 'integer', default: 0 },
            totalWorkhour: { type: 'number', example: 8 },
            sourceType: { type: 'string', enum: ['internal_project', 'external_rental'] },
            description: { type: 'string' }
          }
        }}}},
        responses: { 201: { description: 'Created' } }
      }
    },
    '/equipment/items/{itemId}/workhour-logs': {
      get: {
        tags: ['Workhour Logs'], summary: 'List workhour per alat',
        parameters: [
          { in: 'path', name: 'itemId', required: true, schema: { type: 'integer' } },
          { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' } }
        ],
        responses: { 200: { description: 'Array of workhour logs' } }
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
