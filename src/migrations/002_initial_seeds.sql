-- =============================================================================
-- 002_initial_seeds.sql — Baseline seed data for every fresh installation
-- =============================================================================

-- 1. Placeholder branch (triggers setup wizard)
INSERT INTO branches (
  name, code, address, phone,
  booking_deposit_amt, app_operating_mode,
  no_show_grace_min, mod_cutoff_hours,
  timezone, currency, is_active
) VALUES (
  '[Restaurant_Name]', '[BRANCH_CODE]', '[Restaurant_Address]', '[Restaurant_Phone]',
  50.00, 'FULL',
  15, 2,
  'Asia/Kuala_Lumpur', 'MYR', true
) ON CONFLICT (code) DO NOTHING;

-- 2. System roles
INSERT INTO roles (name) VALUES ('admin')   ON CONFLICT (name) DO NOTHING;
INSERT INTO roles (name) VALUES ('manager') ON CONFLICT (name) DO NOTHING;
INSERT INTO roles (name) VALUES ('waiter')  ON CONFLICT (name) DO NOTHING;

-- 3. Operating modes
INSERT INTO operating_modes (name) VALUES ('TABLE_ONLY')  ON CONFLICT (name) DO NOTHING;
INSERT INTO operating_modes (name) VALUES ('MENU_READY')  ON CONFLICT (name) DO NOTHING;
INSERT INTO operating_modes (name) VALUES ('FULL') ON CONFLICT (name) DO NOTHING;

-- 4. Default currency
INSERT INTO currencies (code, name, symbol) VALUES ('MYR', 'Malaysian Ringgit', 'RM')
  ON CONFLICT (code) DO NOTHING;

-- 5. Default vendor_commissions for every branch (decoration + cake, disabled)
INSERT INTO vendor_commissions (branch_id, category, commission_type, commission_value, is_enabled)
SELECT
  b.id,
  c.category,
  'percentage',
  0.00,
  false
FROM branches b
CROSS JOIN (VALUES ('decoration'), ('cake')) AS c(category)
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_commissions vc
  WHERE vc.branch_id = b.id AND vc.category = c.category
);
