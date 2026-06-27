import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentRole } from '@/lib/platform-guard';
import CatalogManager from '@/components/platform/CatalogManager';
import type { BrandRow, ModelRow } from '@/components/settings/types';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const role = await getCurrentRole();
  if (role !== 'platform_owner') redirect('/leads');

  // Danh mục dùng chung toàn hệ thống (brands/models không gắn company_id).
  const service = createServiceClient();
  const [{ data: brands }, { data: models }] = await Promise.all([
    service.from('brands').select('id, name, slug').order('name'),
    service.from('models').select('id, brand_id, name, sort_order, is_active').order('sort_order'),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Thương hiệu &amp; dòng xe</h1>
        <p className="text-sm text-slate-400 mt-0.5">Danh mục dùng chung mọi công ty — chỉ Chủ nền tảng được sửa</p>
      </div>
      <CatalogManager brands={(brands ?? []) as BrandRow[]} models={(models ?? []) as ModelRow[]} />
    </div>
  );
}
