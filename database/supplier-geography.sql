-- Additive classification for supplier headquarters; routes remain separate.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS region text;
UPDATE public.suppliers SET country='China',city='宁波',region='东亚',updated_at=now() WHERE supplier_code='TIEDADA-NB' AND coalesce(country,'')='';
UPDATE public.suppliers SET region='欧洲',updated_at=now() WHERE supplier_code='PL-GOGLOB-5372673471' AND coalesce(region,'')='';
