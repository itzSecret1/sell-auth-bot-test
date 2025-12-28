#!/usr/bin/env node
/**
 * Script de diagnóstico para encontrar el archivo con error de sintaxis
 */

console.log('🔍 Diagnóstico de errores de sintaxis...\n');

// Intentar importar cada archivo uno por uno
const filesToCheck = [
  './index.js',
  './routes/oauth.js',
  './utils/OAuth2Manager.js',
  './utils/VerifiedUsers.js',
  './utils/config.js',
  './utils/GuildConfig.js',
  './classes/Api.js',
  './classes/Bot.js'
];

async function checkFile(filePath) {
  try {
    console.log(`✅ Verificando: ${filePath}`);
    await import(filePath);
    console.log(`   ✓ OK\n`);
    return true;
  } catch (error) {
    console.error(`   ❌ ERROR en ${filePath}:`);
    console.error(`   ${error.message}`);
    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(0, 5);
      stackLines.forEach(line => console.error(`   ${line}`));
    }
    console.error('');
    return false;
  }
}

async function diagnose() {
  for (const file of filesToCheck) {
    const success = await checkFile(file);
    if (!success) {
      console.error(`\n❌ El error está en: ${file}`);
      process.exit(1);
    }
  }
  console.log('✅ Todos los archivos principales están correctos');
  console.log('⚠️  El error podría estar en un archivo importado por uno de estos archivos');
}

diagnose().catch(console.error);

