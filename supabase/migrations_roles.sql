-- 1. Crear tabla de perfiles (roles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'seller' CHECK (role IN ('admin', 'seller')),
  created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- 2. Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Usuarios pueden ver su propio perfil" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Admins pueden ver todos los perfiles" 
  ON public.profiles FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Solo admins pueden actualizar perfiles" 
  ON public.profiles FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Crear tabla de permisos por módulo
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  can_view boolean DEFAULT true,
  can_edit boolean DEFAULT false,
  UNIQUE(user_id, module_key)
);

-- 4. Habilitar RLS en user_module_permissions
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Políticas para user_module_permissions
CREATE POLICY "Usuarios pueden ver sus propios permisos" 
  ON public.user_module_permissions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins pueden ver todos los permisos" 
  ON public.user_module_permissions FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Solo admins pueden modificar permisos" 
  ON public.user_module_permissions FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Trigger para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'seller');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- NOTA: Para el primer usuario (tu cuenta), deberás ejecutar manualmente:
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'TU_USER_ID';
