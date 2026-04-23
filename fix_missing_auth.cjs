const fs = require('fs');
const path = require('path');

const filesToFix = [
    'ClientesPage.jsx',
    'CotizacionesMagnaPage.jsx',
    'CotizacionPage.jsx',
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

    // Add import if not exists
    if (!content.includes('useAuth')) {
        const importStatement = "import { useAuth } from '@/contexts/SupabaseAuthContext';\n";
        // insert after the last import
        const lastImportIndex = content.lastIndexOf('import ');
        const nextLineIndex = content.indexOf('\n', lastImportIndex) + 1;
        content = content.slice(0, nextLineIndex) + importStatement + content.slice(nextLineIndex);

        // Find component definition to add const { empresa } = useAuth();
        // Usually `const ComponentName = () => {`
        const componentName = file.replace('.jsx', '');
        const componentRegex = new RegExp(`const\\s+${componentName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`);
        const match = content.match(componentRegex);

        if (match) {
            const insertIndex = match.index + match[0].length;
            const useAuthCall = "\n  const { empresa } = useAuth();";
            content = content.slice(0, insertIndex) + useAuthCall + content.slice(insertIndex);
        } else {
            console.log(`Could not find component definition for ${file}`);
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Fixed ${file}`);
    }
}
