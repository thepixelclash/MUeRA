-- Optional stack name so a user can group their own PDFs (notes, subjects, topics).
alter table public.documents add column if not exists stack text check (stack is null or length(stack) <= 100);
