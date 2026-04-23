const fs = require('fs');
const path = require('path');

const filesToFix = [
    'ClientesPage.jsx',
    'CotizacionesMagnaPage.jsx',
    'DevolucionesPage.jsx',
    'InventarioFisicoPage.jsx',
    'PagoComisionesPage.jsx',
    'SuplidoresPage.jsx',
    'UpdateLocationPage.jsx',
    'VendedoresPage.jsx'
];

for (const file of filesToFix) {
    const filePath = path.join(__dirname, 'src', 'pages', file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');

    // Fix the bad import order
    const badPattern = "import {\nimport { useAuth } from '@/contexts/SupabaseAuthContext';";
    if (content.includes(badPattern)) {
        content = content.replace(badPattern, "import { useAuth } from '@/contexts/SupabaseAuthContext';\nimport {");
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed bad import in ${file}`);
    } else {
        // sometimes it might be "import { \nimport { useAuth } from '@/contexts/SupabaseAuthContext';"
        // let's use regex
        const regex = /import\s*\{\s*\n\s*import \{ useAuth \} from '@\/contexts\/SupabaseAuthContext';/g;
        if (regex.test(content)) {
            content = content.replace(regex, "import { useAuth } from '@/contexts/SupabaseAuthContext';\nimport {");
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed bad import in ${file} with regex`);
        }
    }
}
