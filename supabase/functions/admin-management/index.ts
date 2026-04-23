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

        // Get the caller's JWT to verify they are an admin
        const authHeader = req.headers.get('Authorization')!;
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

            // Use caller's tenant_id, or the explicitly provided one (for superadmin creating in another tenant)
            const callerTenantId = profile?.tenant_id || requestedTenantId || null;

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

            const authUpdates: any = {};
            if (email) authUpdates.email = email;
            if (password) authUpdates.password = password;

            // Update Auth User
            if (Object.keys(authUpdates).length > 0) {
                const { error: updateAuthError } = await supabaseClient.auth.admin.updateUserById(
                    targetUserId,
                    authUpdates
                );
                if (updateAuthError) throw updateAuthError;
            }

            // Update Profile Name if provided
            if (full_name) {
                const { error: updateProfileError } = await supabaseClient
                    .from('profiles')
                    .update({ full_name })
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
