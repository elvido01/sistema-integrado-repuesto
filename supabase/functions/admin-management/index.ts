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
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
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
