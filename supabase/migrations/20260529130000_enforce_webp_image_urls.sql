-- Enforce WebP image URLs at the database boundary.
-- NOT VALID keeps legacy rows from blocking the migration, but PostgreSQL still
-- enforces the constraint for new inserts and updates after this migration runs.

ALTER TABLE public.products
  ADD CONSTRAINT products_image_url_must_be_webp
  CHECK (
    image_url IS NULL
    OR lower(split_part(image_url, '?', 1)) LIKE '%.webp'
  ) NOT VALID;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_image_url_must_be_webp
  CHECK (
    image_url IS NULL
    OR lower(split_part(image_url, '?', 1)) LIKE '%.webp'
  ) NOT VALID;

-- After converting legacy rows to WebP, run these validations manually:
-- ALTER TABLE public.products VALIDATE CONSTRAINT products_image_url_must_be_webp;
-- ALTER TABLE public.product_variants VALIDATE CONSTRAINT product_variants_image_url_must_be_webp;
