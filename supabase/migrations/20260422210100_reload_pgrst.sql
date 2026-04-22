-- Force PostgREST to reload its schema cache so the new `role` column is visible.
notify pgrst, 'reload schema';
