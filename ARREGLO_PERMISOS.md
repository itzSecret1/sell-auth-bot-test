# ✅ Arreglo de Permisos - Bot Discord

## 🎯 Problema Resuelto

**Error:** "You do not have permission to use this command"

**Causa:** El bot no tenía roles configurados en tu servidor de Discord.

---

## 🔧 Cambios Realizados

### 1. **Mejora en el manejo de permisos** (`utils/checkUserIdWhitelist.js`)
- Ahora lanza una excepción descriptiva cuando no hay permisos
- Mejor detección de configuración faltante
- Mensaje de error más claro

### 2. **Mensaje de error mejorado** (`utils/NotWhitelistedException.js`)
- Detecta si el servidor está configurado o no
- Muestra exactamente qué rol se necesita
- Incluye instrucciones de cómo resolver el problema
- Menciona roles configurados con formato Discord

### 3. **Guía de setup rápido** (`GUIA_SETUP_RAPIDO.md`)
- Documentación completa de cómo configurar el bot
- Ejemplos paso a paso
- Solución de problemas comunes
- Tabla de permisos por rol

---

## 📤 Cómo Subir los Cambios a GitHub

### Opción 1: Usando Git Bash o CMD (Recomendado)

```bash
# 1. Abrir Git Bash o CMD en el directorio del proyecto
cd "C:\Users\falso\Downloads\proyects 2025\sellauth bot\sell-auth-bot-test-1"

# 2. Ver archivos modificados
git status

# 3. Agregar archivos modificados
git add utils/checkUserIdWhitelist.js
git add utils/NotWhitelistedException.js
git add GUIA_SETUP_RAPIDO.md
git add ARREGLO_PERMISOS.md

# 4. Crear commit
git commit -m "fix: Mejorar manejo de permisos y mensajes de error

- Actualizar checkUserIdWhitelist para lanzar excepción descriptiva
- Mejorar NotWhitelistedException con mensajes contextuales
- Agregar GUIA_SETUP_RAPIDO.md con instrucciones de configuración
- Agregar ARREGLO_PERMISOS.md con resumen de cambios
- Ahora el error explica exactamente qué rol se necesita y cómo configurar el bot"

# 5. Subir a GitHub
git push origin main

# Si tu rama es master en lugar de main:
# git push origin master
```

### Opción 2: Usando GitHub Desktop

1. Abre **GitHub Desktop**
2. Selecciona el repositorio `sell-auth-bot-test-1`
3. Verás los archivos modificados en la barra lateral izquierda
4. Marca los archivos que quieras incluir:
   - `utils/checkUserIdWhitelist.js`
   - `utils/NotWhitelistedException.js`
   - `GUIA_SETUP_RAPIDO.md`
   - `ARREGLO_PERMISOS.md`
5. Escribe un mensaje de commit en la parte inferior
6. Click en **"Commit to main"**
7. Click en **"Push origin"** (arriba)

### Opción 3: Usando VS Code

1. Abre el proyecto en VS Code
2. Click en el ícono de **Source Control** (3er ícono en la barra lateral)
3. Verás los archivos modificados
4. Haz hover sobre cada archivo y click en el **"+"** para agregar al stage
5. Escribe un mensaje de commit arriba
6. Click en el **✓ (checkmark)** para hacer commit
7. Click en **"..."** → **"Push"**

---

## 🚀 Actualizar el Bot en la KVM

Una vez que hayas subido los cambios a GitHub, actualiza el bot en tu servidor:

### 1. Conectarse a la KVM

```bash
ssh usuario@tu-servidor
```

### 2. Ir al directorio del bot

```bash
cd /ruta/a/tu/bot
# Ejemplo: cd /home/user/sell-auth-bot
```

### 3. Hacer pull de GitHub

```bash
# Ver estado actual
git status

# Pull de los cambios
git pull origin main
# O si tu rama es master:
# git pull origin master
```

### 4. Reiniciar PM2

```bash
# Reiniciar el bot
pm2 restart all

# Ver logs para verificar
pm2 logs --lines 50
```

---

## 🎯 Cómo Usar Después del Arreglo

### 1. Configurar el Bot (PRIMERA VEZ)

Ejecuta este comando **EN DISCORD**:

```
/setup quick 
  admin_role: @Admin
  staff_role: @Staff
```

**¿Quién puede ejecutar `/setup`?**
- Owner del servidor (siempre)
- Usuario con ID `1190738779015757914`
- Usuarios en la whitelist

### 2. Asignar Roles a los Usuarios

Después de configurar, asigna los roles a tus usuarios en Discord:
- Configuración del Servidor → Roles
- Asigna `@Admin` a administradores
- Asigna `@Staff` a empleados/staff

### 3. Usar los Comandos

Ahora los usuarios con los roles configurados podrán usar los comandos:

| Comando | Requiere |
|---------|----------|
| `/replace` | Staff o Admin |
| `/add-stock` | Admin |
| `/ban` | Admin |
| `/sync-variants` | Trial Admin o Admin |
| `/invoice-view` | Viewer, Staff o Admin |

---

## 📊 Mejoras en el Mensaje de Error

### Antes:
```
You do not have permission to use this command.
```

### Ahora:
```
🚫 You do not have permission to use this command.

⚙️ Server Not Configured
This server needs to be set up before you can use `/replace`.

Solution:
• Ask the server owner to run `/setup` to configure roles
• Or ask an administrator to add you to the bot whitelist

Required Role: Staff
```

O si está configurado pero no tienes el rol:

```
🚫 You do not have permission to use this command.

Required Permission: Staff Role

You need the @Staff Support role to use this command.

Who can use this command:
• Server owner (always has access)
• Users with the configured Staff role
• Users with the configured Admin role
• Users in the bot whitelist
```

---

## 🔍 Verificar que Funciona

### 1. En la KVM (después de actualizar):

```bash
pm2 logs --lines 100 | grep "GUILD CONFIG"
```

Deberías ver algo como:
```
[GUILD CONFIG] ✅ Loaded X server configuration(s)
[GUILD CONFIG]   - Guild XXXXX: TuServidor (Admin: ROLE_ID)
```

### 2. En Discord:

Intenta usar un comando que requiera permisos, como `/replace`:
- Si **NO** está configurado → Verás el nuevo mensaje de error descriptivo
- Si **SÍ** está configurado pero no tienes rol → Verás qué rol necesitas
- Si tienes el rol correcto → El comando funcionará ✅

---

## 📝 Archivos Modificados

1. **`utils/checkUserIdWhitelist.js`**
   - Líneas cambiadas: 1-62
   - Cambio principal: Ahora lanza excepción con contexto

2. **`utils/NotWhitelistedException.js`**
   - Líneas cambiadas: 1-52
   - Cambio principal: Constructor acepta parámetros y genera mensaje descriptivo

3. **`GUIA_SETUP_RAPIDO.md`** (NUEVO)
   - Guía completa de configuración
   - Solución de problemas
   - Tabla de permisos

4. **`ARREGLO_PERMISOS.md`** (NUEVO - este archivo)
   - Resumen de cambios
   - Instrucciones de deploy

---

## ✅ Checklist de Deploy

- [ ] Subir cambios a GitHub (ver Opción 1, 2 o 3 arriba)
- [ ] Conectarse a la KVM
- [ ] `git pull origin main` en el directorio del bot
- [ ] `pm2 restart all`
- [ ] Verificar logs: `pm2 logs --lines 50`
- [ ] **EN DISCORD:** Ejecutar `/setup quick` (si no lo has hecho antes)
- [ ] Asignar roles a usuarios en Discord
- [ ] Probar un comando como `/replace`
- [ ] ✅ ¡Debería funcionar!

---

## 🆘 Ayuda

Si tienes problemas:

1. **Revisa los logs del bot:**
   ```bash
   pm2 logs --err --lines 50
   ```

2. **Verifica la configuración:**
   ```bash
   pm2 logs | grep "GUILD CONFIG"
   ```

3. **Ejecuta `/setup` de nuevo:**
   - En Discord, ejecuta `/setup quick` con los roles correctos

4. **Lee la guía completa:**
   - Abre `GUIA_SETUP_RAPIDO.md` para más detalles

---

**Tiempo estimado de deploy:** 5-10 minutos

**Dificultad:** Fácil 🟢
