-- 0024_models_keywords.sql — thêm từ khoá nhận diện cho dòng xe
ALTER TABLE crm_thacoauto.models
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN crm_thacoauto.models.keywords IS
  'Biệt danh nhận diện dòng xe (admin nhập). Tên dòng xe luôn là từ khoá mặc định trong logic dò.';
