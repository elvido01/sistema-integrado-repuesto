const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Check if it has a hardcoded MotoFlow title
    const titleRegex = /<title>(.*?) - MotoFlow<\/title>/g;
    if (titleRegex.test(content)) {
        // Replace the title
        content = content.replace(titleRegex, "<title>$1 — {empresa?.nombre || 'Sistema'}</title>");
        modified = true;

        // Ensure useAuth is imported
        if (!content.includes("useAuth")) {
            // Very hacky, let's just not do this if useAuth isn't imported, but most pages have it
            console.log(`Warning: useAuth not found in ${filePath}`);
        }

        // Ensure empresa is extracted from useAuth
        // Look for const { ... } = useAuth();
        const useAuthRegex = /const\s+\{([^}]+)\}\s*=\s*useAuth\(\)/g;
        let match;
        let authFound = false;
        
        while ((match = useAuthRegex.exec(content)) !== null) {
            authFound = true;
            const vars = match[1];
            if (!vars.includes('empresa')) {
                const newVars = vars + ', empresa';
                content = content.replace(match[0], `const {${newVars}} = useAuth()`);
            }
        }

        if (!authFound) {
             // Let's add it if not found, right after the component declaration
             // This is harder with regex, let's look for `useToast` or `const ... = () => {`
             console.log(`Warning: useAuth call not found in ${filePath}`);
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${path.basename(filePath)}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx')) {
            processFile(fullPath);
        }
    }
}

walkDir(pagesDir);
console.log('Done.');
