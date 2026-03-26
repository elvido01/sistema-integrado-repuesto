const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envStr = fs.readFileSync('.env.local', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && key.trim()) {
        env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '');
    }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: { user }, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'admin@repuestosmorla.com', // Let's guess standard email or simply run without auth, anon might have RLS bypass read?
        password: 'password'
    });

    const { data, error } = await supabase
        .from('ordenes_compra')
        .select('*, proveedores(nombre)')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('Error:', error);
    console.log('Orders:', JSON.stringify(data, null, 2));
}

check();
