# 🔧 Fix comando /replace - Instrucciones para KVM

## ❌ Problema
El comando `/replace` no se estaba cargando debido a un error:
```
SyntaxError: Identifier 'ownerId' has already been declared
```

## ✅ Solución Aplicada
Se movió la declaración de `ownerId` **fuera del bloque `try`** para que esté en el scope correcto.

---

## 📝 Comandos para ejecutar en el KVM

Conecta por SSH y ejecuta estos comandos en orden:

### 1️⃣ Navegar al directorio del proyecto
```bash
cd /root/sell-auth-bot-test
```

### 2️⃣ Hacer pull de los últimos cambios
```bash
git pull origin main
```

### 3️⃣ Reiniciar el bot con PM2
```bash
pm2 restart sell-auth-bot --update-env
```

### 4️⃣ Guardar la configuración de PM2
```bash
pm2 save
```

### 5️⃣ Esperar 3 segundos y verificar que se cargó correctamente
```bash
sleep 3
pm2 logs sell-auth-bot --lines 50 --nostream | grep -E "Loaded.*58 commands|replace"
```

---

## 🎯 Resultado Esperado

Deberías ver en los logs:
```
[BOT] ✅ Loaded 58 commands into memory
```

**SIN** este error:
```
❌ Error loading replace.js: Identifier 'ownerId' has already been declared
```

---

## 🔍 Verificación Final

Si el bot cargó correctamente, puedes probar el comando `/replace` en Discord:

1. El comando debería aparecer en el menú de autocompletado
2. El Trial Staff debería poder usarlo (tiene `requiredRole: 'staff'`)
3. No debería mostrar errores de permisos

---

## 📊 Comando Todo-en-Uno (copia y pega)

```bash
cd /root/sell-auth-bot-test && git pull origin main && pm2 restart sell-auth-bot --update-env && pm2 save && sleep 3 && pm2 logs sell-auth-bot --lines 50 --nostream | grep -E "Loaded.*5[78] commands|Error loading"
```

---

## ⚠️ Si aún hay errores

Si después de ejecutar los comandos sigues viendo el error de `ownerId`, ejecuta:

```bash
cd /root/sell-auth-bot-test
grep -n "const ownerId" commands/replace.js
```

Deberías ver **solo UNA línea** (línea ~143):
```
143:    const ownerId = process.env.BOT_USER_ID_WHITELIST?.split(',')[0];
```

Si ves más de una línea, hay una declaración duplicada que necesita ser eliminada.

