import { execSync } from 'child_process';
import { existsSync } from 'fs';

const REPO_URL = 'https://github.com/itzSecret1/sell-auth-bot-test2.git';

try {
  console.log('🔄 Verificando repositorio Git...\n');

  // Verificar si git está disponible
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch (e) {
    console.error('❌ Git no está instalado o no está en el PATH');
    console.log('\n📝 Por favor, ejecuta estos comandos manualmente:\n');
    console.log('git add .');
    console.log('git commit -m "Add ticket system, confirmation system, and hosting options"');
    console.log(`git remote add origin ${REPO_URL}`);
    console.log('git branch -M main');
    console.log('git push -u origin main');
    process.exit(1);
  }

  // Verificar si es un repositorio git
  if (!existsSync('.git')) {
    console.log('📦 Inicializando repositorio Git...');
    execSync('git init', { stdio: 'inherit' });
  }

  // Agregar todos los archivos
  console.log('📝 Agregando archivos...');
  execSync('git add .', { stdio: 'inherit' });

  // Verificar si hay cambios
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (!status.trim()) {
      console.log('✅ No hay cambios para hacer commit');
      process.exit(0);
    }
  } catch (e) {
    // Continuar
  }

  // Hacer commit
  console.log('💾 Haciendo commit...');
  const commitMessage = 'Add ticket system, confirmation system, and hosting options\n\n- Added ticket panel command and ticket management system\n- Added confirmation system for orders > 5 items\n- Made replace command always public\n- Added pending orders system\n- Updated staff references to trial staff\n- Added hosting options documentation';
  
  try {
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️  No hay cambios nuevos para hacer commit');
  }

  // Configurar remote si no existe
  try {
    execSync('git remote get-url origin', { stdio: 'ignore' });
    console.log('✅ Remote ya configurado');
  } catch (e) {
    console.log('🔗 Configurando remote...');
    try {
      execSync(`git remote add origin ${REPO_URL}`, { stdio: 'inherit' });
    } catch (addError) {
      // Si ya existe, actualizar
      execSync(`git remote set-url origin ${REPO_URL}`, { stdio: 'inherit' });
    }
  }

  // Configurar branch
  try {
    execSync('git branch -M main', { stdio: 'inherit' });
  } catch (e) {
    // Branch ya existe o no hay commits
  }

  // Push
  console.log('🚀 Haciendo push a GitHub...');
  try {
    execSync('git push -u origin main', { stdio: 'inherit' });
    console.log('\n✅ ¡Cambios subidos exitosamente a GitHub!');
    console.log(`🔗 Repositorio: ${REPO_URL}`);
  } catch (pushError) {
    console.log('\n⚠️  Error al hacer push. Intentando con force...');
    try {
      execSync('git push -u origin main --force', { stdio: 'inherit' });
      console.log('\n✅ ¡Cambios subidos exitosamente a GitHub!');
    } catch (forceError) {
      console.error('\n❌ Error al hacer push. Por favor, ejecuta manualmente:');
      console.log('git push -u origin main');
      console.log('\nO si necesitas forzar:');
      console.log('git push -u origin main --force');
      process.exit(1);
    }
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n📝 Por favor, ejecuta estos comandos manualmente:\n');
  console.log('git add .');
  console.log('git commit -m "Add ticket system and confirmation system"');
  console.log(`git remote add origin ${REPO_URL}`);
  console.log('git branch -M main');
  console.log('git push -u origin main');
  process.exit(1);
}

