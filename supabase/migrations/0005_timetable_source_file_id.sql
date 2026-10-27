-- Optional pointer to the scanned timetable file in the user's own Google Drive.
alter table public.timetable_slots add column if not exists source_file_id text check (source_file_id is null or length(source_file_id) <= 200);
