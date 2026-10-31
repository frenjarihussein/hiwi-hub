CREATE POLICY "tenant files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('attachments','backups') AND (storage.foldername(name))[1] = public.current_tenant_id()::text);
CREATE POLICY "tenant files insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = public.current_tenant_id()::text);
CREATE POLICY "tenant files update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = public.current_tenant_id()::text);
CREATE POLICY "tenant files delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = public.current_tenant_id()::text);