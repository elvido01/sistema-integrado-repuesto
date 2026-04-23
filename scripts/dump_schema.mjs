// Schema migration: PRODUCTION → DEV via Supabase database/query API
import fs from 'fs';

const ACCESS_TOKEN = 'sbp_7dd6d35c4dfe60c44628b58b40274becf961eb9d';
const PROD_REF = 'zdvxowpuklbypweyqqki';
const DEV_REF  = 'vvxoxhowupkehycnpwaa';
const API = 'https://api.supabase.com/v1';

const headers = { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' };

async function sql(ref, query) {
  const r = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST', headers, body: JSON.stringify({ query })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`SQL [${ref}]: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  console.log('🔍 Verificando proyectos...');
  const [p1, p2] = await Promise.all([
    fetch(`${API}/projects/${PROD_REF}`, { headers }).then(r => r.json()),
    fetch(`${API}/projects/${DEV_REF}`,  { headers }).then(r => r.json()),
  ]);
  console.log(`   PROD: ${p1.name} (${p1.status})`);
  console.log(`   DEV:  ${p2.name} (${p2.status})`);

  console.log('\n📦 Exportando esquema de producción...');

  // 1. Extensions
  const exts = await sql(PROD_REF, `
    SELECT extname, nspname as schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE extname NOT IN ('plpgsql','pg_stat_statements') ORDER BY extname
  `);

  // 2. Enum types
  const enums = await sql(PROD_REF, `
    SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as vals
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
    GROUP BY t.typname ORDER BY t.typname
  `);

  // 3. Tables with columns
  const tables = await sql(PROD_REF, `
    SELECT t.table_name,
      json_agg(
        json_build_object(
          'name', c.column_name,
          'type', CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END,
          'maxlen', c.character_maximum_length,
          'default', c.column_default,
          'nullable', c.is_nullable,
          'identity', c.is_identity,
          'identity_gen', c.identity_generation
        ) ORDER BY c.ordinal_position
      ) as columns
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name ORDER BY t.table_name
  `);

  // 4. Primary Keys
  const pks = await sql(PROD_REF, `
    SELECT tc.table_name, tc.constraint_name,
      string_agg('"' || kcu.column_name || '"', ', ' ORDER BY kcu.ordinal_position) AS cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name ORDER BY tc.table_name
  `);

  // 5. Unique constraints
  const uqs = await sql(PROD_REF, `
    SELECT tc.table_name, tc.constraint_name,
      string_agg('"' || kcu.column_name || '"', ', ' ORDER BY kcu.ordinal_position) AS cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name ORDER BY tc.table_name
  `);

  // 6. Foreign Keys
  const fks = await sql(PROD_REF, `
    SELECT tc.table_name, tc.constraint_name,
      string_agg('"' || kcu.column_name || '"', ', ' ORDER BY kcu.ordinal_position) AS cols,
      ccu.table_name AS ref_table,
      string_agg('"' || ccu.column_name || '"', ', ' ORDER BY kcu.ordinal_position) AS ref_cols,
      rc.delete_rule, rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name, ccu.table_name, rc.delete_rule, rc.update_rule
    ORDER BY tc.table_name
  `);

  // 7. Indexes
  const idxs = await sql(PROD_REF, `
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE constraint_type IN ('PRIMARY KEY','UNIQUE') AND table_schema = 'public'
      )
    ORDER BY tablename, indexname
  `);

  // 8. Views
  const views = await sql(PROD_REF, `
    SELECT table_name, view_definition
    FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name
  `);

  // 9. Functions (full definition)
  const funcs = await sql(PROD_REF, `
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    ORDER BY p.proname
  `);

  // 10. Triggers
  const trigs = await sql(PROD_REF, `
    SELECT trigger_name, event_manipulation, event_object_table,
           action_timing, action_statement, action_orientation
    FROM information_schema.triggers WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name
  `);

  // 11. RLS Policies
  const policies = await sql(PROD_REF, `
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname
  `);

  // ── Build SQL ─────────────────────────────────────────────────────────────
  let out = `-- ================================================================
-- SCHEMA: SAAS REPUESTAS MORLA → motoflow-dev
-- Generated: ${new Date().toISOString()}
-- ================================================================
SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

`;

  // Extensions
  if (exts.length) {
    out += '-- EXTENSIONS\n';
    exts.forEach(e => { out += `CREATE EXTENSION IF NOT EXISTS "${e.extname}" WITH SCHEMA ${e.schema};\n`; });
    out += '\n';
  }

  // Enums
  if (enums.length) {
    out += '-- ENUM TYPES\n';
    enums.forEach(e => {
      const rawVals = Array.isArray(e.vals) ? e.vals : (e.vals||'').replace(/^{|}$/g,'').split(',').filter(Boolean);
    const vals = rawVals.map(v => `'${v}'`).join(', ');
      out += `DO $$ BEGIN\n  CREATE TYPE public."${e.typname}" AS ENUM (${vals});\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;\n`;
    });
    out += '\n';
  }

  // Tables
  out += '-- TABLES\n';
  for (const t of tables) {
    out += `\nCREATE TABLE IF NOT EXISTS public."${t.table_name}" (\n`;
    const cols = t.columns.map(c => {
      let type = c.type;
      if (c.maxlen) type += `(${c.maxlen})`;
      let def = `  "${c.name}" ${type}`;
      if (c.identity === 'YES') def += ` GENERATED ${c.identity_gen || 'ALWAYS'} AS IDENTITY`;
      else if (c.default) def += ` DEFAULT ${c.default}`;
      if (c.nullable === 'NO') def += ' NOT NULL';
      return def;
    });
    out += cols.join(',\n') + '\n);\n';
  }
  out += '\n';

  // PKs
  if (pks.length) {
    out += '-- PRIMARY KEYS\n';
    pks.forEach(pk => { out += `ALTER TABLE public."${pk.table_name}" ADD CONSTRAINT "${pk.constraint_name}" PRIMARY KEY (${pk.cols});\n`; });
    out += '\n';
  }

  // Unique
  if (uqs.length) {
    out += '-- UNIQUE CONSTRAINTS\n';
    uqs.forEach(u => { out += `ALTER TABLE public."${u.table_name}" ADD CONSTRAINT "${u.constraint_name}" UNIQUE (${u.cols});\n`; });
    out += '\n';
  }

  // FKs
  if (fks.length) {
    out += '-- FOREIGN KEYS\n';
    fks.forEach(fk => {
      out += `ALTER TABLE public."${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY (${fk.cols}) REFERENCES public."${fk.ref_table}" (${fk.ref_cols}) ON DELETE ${fk.delete_rule} ON UPDATE ${fk.update_rule};\n`;
    });
    out += '\n';
  }

  // Indexes
  if (idxs.length) {
    out += '-- INDEXES\n';
    idxs.forEach(i => { out += `${i.indexdef};\n`; });
    out += '\n';
  }

  // Views
  if (views.length) {
    out += '-- VIEWS\n';
    views.forEach(v => { out += `CREATE OR REPLACE VIEW public."${v.table_name}" AS\n${v.view_definition};\n\n`; });
  }

  // Functions
  if (funcs.length) {
    out += '-- FUNCTIONS\n';
    funcs.forEach(f => { out += `${f.def};\n\n`; });
  }

  // Triggers
  if (trigs.length) {
    out += '-- TRIGGERS\n';
    trigs.forEach(tr => {
      out += `CREATE OR REPLACE TRIGGER "${tr.trigger_name}" ${tr.action_timing} ${tr.event_manipulation} ON public."${tr.event_object_table}" FOR EACH ${tr.action_orientation} ${tr.action_statement};\n`;
    });
    out += '\n';
  }

  // RLS
  if (policies.length) {
    const rlsTables = [...new Set(policies.map(p => p.tablename))];
    out += '-- ROW LEVEL SECURITY\n';
    rlsTables.forEach(t => { out += `ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;\n`; });
    out += '\n-- POLICIES\n';
    policies.forEach(p => {
      let def = `CREATE POLICY "${p.policyname}" ON public."${p.tablename}"`;
      def += ` AS ${p.permissive}`;
      def += ` FOR ${p.cmd}`;
      if (p.roles && p.roles !== '{}') def += ` TO ${p.roles.replace(/[{}]/g,'')}`;
      if (p.qual) def += ` USING (${p.qual})`;
      if (p.with_check) def += ` WITH CHECK (${p.with_check})`;
      out += `${def};\n`;
    });
    out += '\n';
  }

  fs.writeFileSync('schema_prod.sql', out);
  console.log(`\n✅ Schema exportado: schema_prod.sql (${Math.round(out.length/1024)} KB)`);
  console.log(`   ext:${exts.length} | enums:${enums.length} | tables:${tables.length} | pks:${pks.length} | fks:${fks.length} | idx:${idxs.length} | views:${views.length} | funcs:${funcs.length} | trigs:${trigs.length} | policies:${policies.length}`);

  // ── Apply to DEV in chunks ────────────────────────────────────────────────
  console.log('\n🚀 Aplicando esquema en motoflow-dev...');

  const sections = [
    { name: 'Extensions', q: exts.map(e => `CREATE EXTENSION IF NOT EXISTS "${e.extname}" WITH SCHEMA ${e.schema};`).join('\n') },
    { name: 'Enums', q: enums.map(e => { const v2 = Array.isArray(e.vals) ? e.vals : (e.vals||'').replace(/^{|}$/g,'').split(',').filter(Boolean); return `DO $$ BEGIN CREATE TYPE public."${e.typname}" AS ENUM (${v2.map(v=>`'${v}'`).join(', ')}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`; }).join('\n') },
  ];

  // Tables one by one
  for (const t of tables) {
    const cols = t.columns.map(c => {
      let type = c.type; if (c.maxlen) type += `(${c.maxlen})`;
      let def = `  "${c.name}" ${type}`;
      if (c.identity === 'YES') def += ` GENERATED ${c.identity_gen || 'ALWAYS'} AS IDENTITY`;
      else if (c.default) def += ` DEFAULT ${c.default}`;
      if (c.nullable === 'NO') def += ' NOT NULL';
      return def;
    });
    sections.push({ name: `Table: ${t.table_name}`, q: `CREATE TABLE IF NOT EXISTS public."${t.table_name}" (\n${cols.join(',\n')}\n);` });
  }

  if (pks.length) sections.push({ name: 'PKs', q: pks.map(pk => `ALTER TABLE public."${pk.table_name}" ADD CONSTRAINT "${pk.constraint_name}" PRIMARY KEY (${pk.cols});`).join('\n') });
  if (uqs.length) sections.push({ name: 'Unique', q: uqs.map(u => `ALTER TABLE public."${u.table_name}" ADD CONSTRAINT "${u.constraint_name}" UNIQUE (${u.cols});`).join('\n') });
  if (fks.length) sections.push({ name: 'FKs', q: fks.map(fk => `ALTER TABLE public."${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY (${fk.cols}) REFERENCES public."${fk.ref_table}" (${fk.ref_cols}) ON DELETE ${fk.delete_rule} ON UPDATE ${fk.update_rule};`).join('\n') });
  if (idxs.length) sections.push({ name: 'Indexes', q: idxs.map(i => `${i.indexdef};`).join('\n') });
  if (views.length) sections.push({ name: 'Views', q: views.map(v => `CREATE OR REPLACE VIEW public."${v.table_name}" AS ${v.view_definition};`).join('\n') });

  // Functions one by one
  for (const f of funcs) {
    sections.push({ name: 'Function', q: `${f.def};` });
  }

  // Triggers
  if (trigs.length) sections.push({ name: 'Triggers', q: trigs.map(tr => `CREATE OR REPLACE TRIGGER "${tr.trigger_name}" ${tr.action_timing} ${tr.event_manipulation} ON public."${tr.event_object_table}" FOR EACH ${tr.action_orientation} ${tr.action_statement};`).join('\n') });

  // RLS
  if (policies.length) {
    const rlsTables = [...new Set(policies.map(p => p.tablename))];
    const rlsQ = rlsTables.map(t => `ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;`).join('\n')
      + '\n' + policies.map(p => {
        let def = `CREATE POLICY "${p.policyname}" ON public."${p.tablename}" AS ${p.permissive} FOR ${p.cmd}`;
        if (p.roles && p.roles !== '{}') def += ` TO ${p.roles.replace(/[{}]/g,'')}`;
        if (p.qual) def += ` USING (${p.qual})`;
        if (p.with_check) def += ` WITH CHECK (${p.with_check})`;
        return def + ';';
      }).join('\n');
    sections.push({ name: 'RLS', q: rlsQ });
  }

  let ok = 0, errors = [];
  for (const s of sections) {
    if (!s.q.trim()) continue;
    try {
      await sql(DEV_REF, s.q);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      errors.push(`${s.name}: ${e.message.slice(0, 150)}`);
      process.stdout.write('x');
    }
  }

  console.log(`\n\n✅ Aplicados: ${ok}/${sections.length} secciones`);
  if (errors.length) {
    console.log(`⚠️  Errores (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log('  -', e));
    fs.writeFileSync('migration_errors.txt', errors.join('\n'));
  }

  console.log('\n🎉 Migración completada. El proyecto motoflow-dev tiene el esquema de producción.');
}

main().catch(e => { console.error('\n❌ Error fatal:', e.message); process.exit(1); });
