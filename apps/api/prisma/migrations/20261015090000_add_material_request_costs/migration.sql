-- CreateEnum
CREATE TYPE "material_cost_type" AS ENUM ('material_cost', 'driver_fee', 'delivery_fee', 'loading_unloading_fee', 'fuel_cost', 'other');

-- CreateTable
CREATE TABLE "material_request_costs" (
    "id" SERIAL NOT NULL,
    "material_request_id" INTEGER NOT NULL,
    "cost_type" "material_cost_type" NOT NULL,
    "material_request_item_id" INTEGER,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payee_name" VARCHAR(150),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_request_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_request_costs_material_request_item_id_key" ON "material_request_costs"("material_request_item_id");

-- CreateIndex
CREATE INDEX "material_request_costs_material_request_id_cost_type_idx" ON "material_request_costs"("material_request_id", "cost_type");

-- AddForeignKey
ALTER TABLE "material_request_costs" ADD CONSTRAINT "material_request_costs_material_request_id_fkey" FOREIGN KEY ("material_request_id") REFERENCES "material_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_costs" ADD CONSTRAINT "material_request_costs_material_request_item_id_fkey" FOREIGN KEY ("material_request_item_id") REFERENCES "material_request_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK (Prisma tidak bisa menyatakannya) — F3
-- material_cost WAJIB menunjuk item; jenis biaya lain TIDAK boleh menunjuk item
ALTER TABLE "material_request_costs" ADD CONSTRAINT "material_request_costs_item_check"
  CHECK ((cost_type = 'material_cost') = (material_request_item_id IS NOT NULL));

-- Nominal selalu positif
ALTER TABLE "material_request_costs" ADD CONSTRAINT "material_request_costs_amount_check"
  CHECK (amount > 0);

-- RLS tanpa policy: tutup REST API publik Supabase (berlaku sejak 14 Okt 2026)
ALTER TABLE "material_request_costs" ENABLE ROW LEVEL SECURITY;
