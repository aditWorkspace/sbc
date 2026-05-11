-- 20260422081720_add_row_count_previously_attempted.sql was checked in EMPTY by
-- mistake. Stage D (apollo_samples dedupe) was added to ingestUpload at the
-- same time and writes this column at the end of every upload, but PostgREST
-- rejected those updates with PGRST204 because the column never existed. The
-- update call was fire-and-forget so the failure was silent — every uploads row
-- has been stuck at row_count_admitted=0, status='processing' since April 22.
-- Adding the column now (with `if not exists` so re-running is safe).

alter table uploads
  add column if not exists row_count_previously_attempted int not null default 0;

notify pgrst, 'reload schema';
