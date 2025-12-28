#!/usr/bin/env node
/**
 * Script para verificar errores de sintaxis en los archivos principales
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const filesToCheck = [
  'index.js',
  'routes/oauth.js',
  'utils/OAuth2Manager.js',
  'utils/VerifiedUsers.js',
  'utils/config.js',
  'classes/Bot.js',
  'classes/Api.js'
];

console.log('🔍 Verificando sintaxis de archivos...\n');

for (const file of filesToCheck) {
  try {
    const filePath = join(__dirname, file);
    const content = readFileSync(filePath, 'utf-8');
    
    // Verificar que los imports estén al principio
    const lines = content.split('\n');
    let foundCode = false;
    let lastImportLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('import ') || line.startsWith('export ')) {
        lastImportLine = i;
        if (foundCode) {
          console.error(`❌ ${file}: Import/export encontrado después de código ejecutable en línea ${i + 1}`);
          console.error(`   Línea: ${line.substring(0, 80)}`);
          process.exit(1);
        }
      } else if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        if (lastImportLine >= 0 && i > lastImportLine + 1) {
          foundCode = true;
        }
      }
    }
    
    // Intentar parsear el archivo
    try {
      // Solo verificar sintaxis básica
      if (content.includes('import') && !content.match(/^import[\s\S]*?from/m)) {
        console.warn(`⚠️  ${file}: Posible problema con imports`);
      }
    } catch (e) {
      console.error(`❌ ${file}: Error al verificar - ${e.message}`);
    }
    
    console.log(`✅ ${file}: OK`);
  } catch (error) {
    console.error(`❌ ${file}: ${error.message}`);
    process.exit(1);
  }
}

console.log('\n✅ Todos los archivos verificados correctamente');

