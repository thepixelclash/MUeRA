-- Optional pointer to the uploaded file in the user's own Google Drive (drive.file scope).
alter table public.documents add column if not exists drive_file_id text check (drive_file_id is null or length(drive_file_id) <= 200);
