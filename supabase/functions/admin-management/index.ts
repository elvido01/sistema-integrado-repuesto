// @ts-nocheck
// deno-lint-ignore-file
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // Get the caller's JWT to verify they are an admin.
        // OJO: si el navegador no tiene sesion viva, supabase-js manda la ANON
        // KEY en lugar del token del usuario. Es un JWT valido, asi que llega
        // hasta aqui y solo revienta en getUser. Por eso el mensaje habla de la
        // sesion y no de permisos: quien lo ve tiene que volver a entrar.
        const authHeader = req.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '').trim();

        if (!token) {
            return new Response(JSON.stringify({ error: 'Falta el token de sesion. Vuelve a entrar al sistema.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

        if (userError || !user) {
            return new Response(JSON.stringify({
                error: 'Tu sesion se vencio. Cierra sesion y vuelve a entrar para hacer este cambio.',
                detalle: userError?.message ?? 'getUser no devolvio usuario',
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        // Verify admin role in profiles table
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('role, tenant_id, is_superadmin')
            .eq('id', user.id)
            .single();

        if (profileError || (profile?.role !== 'admin' && !profile?.is_superadmin)) {
            return new Response(JSON.stringify({ error: 'Forbidden: Only admins can manage users' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }

        const { action, targetUserId, updates } = await req.json();

        if (!action || !targetUserId) {
            return new Response(JSON.stringify({ error: 'Missing action or targetUserId' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        // ── CREATE USER ──────────────────────────────────────────
        if (action === 'create_user') {
            const { email, password, full_name, role, tenant_id: requestedTenantId } = updates;

            if (!email || !password) {
                return new Response(JSON.stringify({ error: 'Email y contraseña son requeridos' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Fase 0.3: bloquear tenant override no autorizado.
            // - admin normal: solo puede crear usuarios en su propio tenant
            // - superadmin: puede crear en otro tenant pero se audita
            const isSuperadmin = !!profile?.is_superadmin;
            const requestsOtherTenant =
                requestedTenantId &&
                profile?.tenant_id &&
                requestedTenantId !== profile.tenant_id;

            if (requestsOtherTenant && !isSuperadmin) {
                return new Response(
                    JSON.stringify({
                        error: 'Forbidden: solo super admin puede crear usuarios en otro tenant',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 403,
                    }
                );
            }

            // Resolucion del tenant destino:
            //  - admin: siempre profile.tenant_id (ignora cualquier requestedTenantId)
            //  - superadmin sin tenant propio: usa requestedTenantId (caso onboarding)
            //  - superadmin con tenant propio: usa requestedTenantId si vino, sino su tenant
            const callerTenantId = isSuperadmin
                ? requestedTenantId || profile?.tenant_id || null
                : profile?.tenant_id || null;

            if (!callerTenantId) {
                return new Response(
                    JSON.stringify({ error: 'No se pudo resolver tenant destino para el nuevo usuario' }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    }
                );
            }

            // Audit log cuando superadmin opera cross-tenant
            if (isSuperadmin && requestsOtherTenant) {
                console.log(
                    `[admin-management][AUDIT] superadmin ${user.id} (tenant ${profile?.tenant_id ?? 'none'}) crea usuario en tenant ${callerTenantId}`
                );
            }

            // Multi-empresa: si el usuario YA existe (creado en otra empresa),
            // "crearlo" aqui significa VINCULARLO a esta empresa
            // (usuarios_empresas) para que entre con su misma clave.
            const { data: existente } = await supabaseClient
                .from('profiles')
                .select('id, tenant_id, full_name')
                .eq('email', email)
                .maybeSingle();
            if (existente?.id) {
                const ueRolExist = role === 'admin' ? 'admin' : 'vendedor';
                const { error: linkError } = await supabaseClient
                    .from('usuarios_empresas')
                    .upsert({
                        user_id: existente.id,
                        tenant_id: callerTenantId,
                        rol: ueRolExist,
                    }, { onConflict: 'user_id,tenant_id' });
                if (linkError) throw linkError;
                return new Response(JSON.stringify({
                    message: `El usuario ya existía (${existente.full_name || email}) y fue vinculado a esta empresa: entra con su misma clave y puede cambiar de empresa desde el sidebar.`,
                    linked: true,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            // Create user via admin API → auto-confirms email, no email sent
            const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Mark email as confirmed immediately
                user_metadata: {
                    full_name: full_name || '',
                    role: role || 'seller',
                },
            });

            if (createError) throw createError;

            // Upsert the profile row so it's linked to the same tenant
            if (newUser?.user) {
                const { error: profileUpsertError } = await supabaseClient
                    .from('profiles')
                    .upsert({
                        id: newUser.user.id,
                        email: email,
                        full_name: full_name || '',
                        role: role || 'seller',
                        tenant_id: callerTenantId,
                    }, { onConflict: 'id' });

                if (profileUpsertError) {
                    console.error('Profile upsert error:', profileUpsertError);
                }

                // Also create usuarios_empresas record (used by get_user_tenant RPC)
                if (callerTenantId) {
                    // Map profiles role → usuarios_empresas rol (different allowed values)
                    const ueRol = role === 'admin' ? 'admin' : 'vendedor';
                    const { error: ueError } = await supabaseClient
                        .from('usuarios_empresas')
                        .upsert({
                            user_id: newUser.user.id,
                            tenant_id: callerTenantId,
                            rol: ueRol,
                        }, { onConflict: 'user_id,tenant_id' });
                    if (ueError) {
                        console.error('usuarios_empresas upsert error:', ueError);
                    }
                }
            }

            return new Response(JSON.stringify({ message: 'Usuario creado exitosamente', user: newUser?.user }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ── UPDATE USER ─────────────────────────────────────────
        if (action === 'update_user') {
            const { email, password, full_name } = updates;

            // Usuario/correo ocupado por OTRA cuenta → mensaje claro
            // (los emails son unicos en todo el sistema, cross-empresa)
            if (email) {
                const { data: dueno } = await supabaseClient
                    .from('profiles')
                    .select('id, full_name')
                    .eq('email', email)
                    .neq('id', targetUserId)
                    .maybeSingle();
                if (dueno?.id) {
                    return new Response(JSON.stringify({
                        error: `Ese usuario/correo ya está ocupado por "${dueno.full_name || email}". Elige otro nombre de usuario.`,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    });
                }
            }

            const authUpdates: any = {};
            // email_confirm: el cambio aplica de inmediato (los usuarios
            // internos @usuario.motoflow.app no reciben correos de confirmacion)
            if (email) { authUpdates.email = email; authUpdates.email_confirm = true; }
            if (password) authUpdates.password = password;

            // Update Auth User
            if (Object.keys(authUpdates).length > 0) {
                const { error: updateAuthError } = await supabaseClient.auth.admin.updateUserById(
                    targetUserId,
                    authUpdates
                );
                if (updateAuthError) throw updateAuthError;
            }

            // Update Profile (nombre y/o email — la pantalla de usuarios lee
            // profiles.email, por eso el correo tambien se refleja aqui)
            const profileUpdates: any = {};
            if (full_name) profileUpdates.full_name = full_name;
            if (email) profileUpdates.email = email;
            if (Object.keys(profileUpdates).length > 0) {
                const { error: updateProfileError } = await supabaseClient
                    .from('profiles')
                    .update(profileUpdates)
                    .eq('id', targetUserId);
                if (updateProfileError) throw updateProfileError;
            }

            return new Response(JSON.stringify({ message: 'User updated successfully' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ── DELETE USER ─────────────────────────────────────────
        if (action === 'delete_user') {
            // Delete from auth (cascades to profiles if FK is set)
            const { error: deleteError } = await supabaseClient.auth.admin.deleteUser(targetUserId);
            if (deleteError) throw deleteError;

            // Also clean up profile row just in case
            await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', targetUserId);

            return new Response(JSON.stringify({ message: 'Usuario eliminado exitosamente' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        return new Response(JSON.stringify({ error: 'Unsupported action' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
