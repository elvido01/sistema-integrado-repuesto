import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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

async function main() {
    const { data: o, error: oe } = await supabase.from('ordenes_compra').select('*').order('created_at', { ascending: false }).limit(2);
    console.log('Orders Error:', oe);
    console.log('Latest Orders:', o);

    if (o && o.length > 0) {
        const { data: od, error: ode } = await supabase.from('ordenes_compra_detalle').select('*').eq('orden_compra_id', o[0].id);
        console.log('Details Error:', ode);
        console.log('Latest Order Details:', od);
    }
}
main();
