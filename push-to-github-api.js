import { Octokit } from '@octokit/rest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_OWNER = 'itzSecret1';
const REPO_NAME = 'sell-auth-bot-test2';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;

// Archivos y carpetas a ignorar
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.env',
  '.cache',
  'attached_assets',
  '.replit',
  'push-to-github.js',
  'push-to-github-api.js',
  'push-changes.js',
  '.gitignore'
];

function getAllFiles(dir, baseDir = dir, fileList = []) {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const relativePath = relative(baseDir, filePath);
    const stat = statSync(filePath);

    // Verificar si debe ignorarse
    const shouldIgnore = IGNORE_PATTERNS.some(pattern => 
      relativePath.includes(pattern) || file === pattern
    );

    if (shouldIgnore) continue;

    if (stat.isDirectory()) {
      getAllFiles(filePath, baseDir, fileList);
    } else {
      fileList.push({
        path: relativePath.replace(/\\/g, '/'), // Normalizar a forward slashes
        fullPath: filePath
      });
    }
  }

  return fileList;
}

async function pushToGitHub() {
  console.log('🚀 Iniciando push a GitHub...\n');
  console.log(`📦 Repositorio: ${REPO_URL}\n`);

  // Necesitamos un token de GitHub
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    console.error('❌ Error: Se necesita un token de GitHub');
    console.log('\n📝 Para obtener un token:');
    console.log('1. Ve a https://github.com/settings/tokens');
    console.log('2. Click en "Generate new token (classic)"');
    console.log('3. Selecciona el scope "repo"');
    console.log('4. Copia el token');
    console.log('\nLuego ejecuta:');
    console.log(`set GITHUB_TOKEN=tu_token_aqui`);
    console.log('node push-to-github-api.js');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  try {
    // Verificar que el repositorio existe
    console.log('🔍 Verificando repositorio...');
    try {
      await octokit.rest.repos.get({
        owner: REPO_OWNER,
        repo: REPO_NAME
      });
      console.log('✅ Repositorio encontrado\n');
    } catch (e) {
      if (e.status === 404) {
        console.error(`❌ Repositorio ${REPO_NAME} no existe`);
        console.log(`\n📝 Crea el repositorio en: https://github.com/new`);
        process.exit(1);
      }
      throw e;
    }

    // Obtener todos los archivos
    console.log('📂 Escaneando archivos...');
    const files = getAllFiles(__dirname);
    console.log(`✅ Encontrados ${files.length} archivos\n`);

    // Obtener el SHA del árbol actual (si existe)
    let baseTree = null;
    try {
      const { data: ref } = await octokit.rest.git.getRef({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        ref: 'heads/main'
      });
      
      const { data: commit } = await octokit.rest.git.getCommit({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        commit_sha: ref.object.sha
      });
      
      baseTree = commit.tree.sha;
      console.log('📋 Repositorio tiene contenido existente, actualizando...\n');
    } catch (e) {
      console.log('📋 Repositorio vacío, creando contenido inicial...\n');
    }

    // Subir archivos en lotes
    const tree = [];
    let uploaded = 0;

    for (const file of files) {
      try {
        const content = readFileSync(file.fullPath, 'utf-8');
        const encodedContent = Buffer.from(content).toString('base64');

        tree.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          content: content
        });

        uploaded++;
        if (uploaded % 10 === 0) {
          console.log(`⬆️  Procesados ${uploaded}/${files.length} archivos...`);
        }
      } catch (e) {
        console.error(`⚠️  Error leyendo ${file.path}: ${e.message}`);
      }
    }

    console.log(`\n📤 Subiendo ${tree.length} archivos a GitHub...\n`);

    // Crear árbol
    const { data: newTree } = await octokit.rest.git.createTree({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      tree: tree,
      base_tree: baseTree
    });

    // Crear commit
    const commitMessage = `Add ticket system, confirmation system, and hosting options

- Added ticket panel command and ticket management system
- Added confirmation system for orders > 5 items
- Made replace command always public
- Added pending orders system
- Updated staff references to trial staff
- Added hosting options documentation`;

    let parentSha = null;
    if (baseTree) {
      try {
        const { data: ref } = await octokit.rest.git.getRef({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          ref: 'heads/main'
        });
        parentSha = ref.object.sha;
      } catch (e) {
        // No hay commits anteriores
      }
    }

    const { data: commit } = await octokit.rest.git.createCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      message: commitMessage,
      tree: newTree.sha,
      parents: parentSha ? [parentSha] : []
    });

    // Actualizar referencia
    try {
      await octokit.rest.git.updateRef({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        ref: 'heads/main',
        sha: commit.sha
      });
    } catch (e) {
      // Si no existe la referencia, crearla
      await octokit.rest.git.createRef({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        ref: 'refs/heads/main',
        sha: commit.sha
      });
    }

    console.log('✅ ¡Push completado exitosamente!');
    console.log(`🔗 Repositorio: ${REPO_URL}`);
    console.log(`📝 Commit: ${commit.sha.substring(0, 7)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('📋 Detalles:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

pushToGitHub();

