-- Enable Row Level Security on the table
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure a clean slate and avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.vendedores;
DROP POLICY IF EXISTS "Allow all for authenticated users on vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "Public read access" ON public.vendedores;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.vendedores;

-- Create a policy that allows ALL authenticated users (admins and sellers) to view the vendors list
CREATE POLICY "Enable read access for all authenticated users"
ON public.vendedores FOR SELECT
TO authenticated
USING (true);

-- Ensure the table is accessible
GRANT SELECT ON public.vendedores TO authenticated;
GRANT SELECT ON public.vendedores TO anon; -- For dev/testing if needed, but authenticated is key
