# 🚀 Guía de Setup Rápido - Bot de Discord

## ❌ Problema: "You do not have permission to use this command"

Si ves este error, significa que el bot **NO está configurado** en tu servidor de Discord. Necesitas ejecutar el comando `/setup` para configurar los roles.

---

## ✅ Solución Rápida (2 minutos)

### Paso 1: Ejecuta `/setup` en Discord

1. Abre Discord y ve a tu servidor
2. Escribe `/setup` en cualquier canal
3. Aparecerán dos opciones:
   - **`/setup quick`** - Setup rápido (recomendado)
   - **`/setup start`** - Setup avanzado con más opciones

### Paso 2: Usa `/setup quick`

El comando `/setup quick` es la forma más rápida de configurar el bot. Necesitas proporcionar:

#### **Roles Obligatorios:**
```
admin_role: @Admin (el rol de administrador de tu servidor)
staff_role: @Staff (el rol de staff/empleados)
```

#### **Roles y Canales Opcionales:**
```
customer_role: @Customer (rol para clientes)
log_channel: #logs (canal para registros)
transcript_channel: #transcripts (canal para transcripts de tickets)
rating_channel: #ratings (canal para calificaciones)
spam_channel: #spam-alerts (canal para alertas de spam)
trial_admin_role: @Trial Admin (rol con permisos limitados)
```

### Ejemplo de Comando Completo:

```
/setup quick 
  admin_role: @Admin
  staff_role: @Staff Support
  customer_role: @Verified
  log_channel: #bot-logs
  transcript_channel: #transcripts
  rating_channel: #ratings
  spam_channel: #spam-alerts
```

---

## 🔑 ¿Quién puede ejecutar `/setup`?

Solo estas personas pueden configurar el bot:

1. **Owner del servidor** (siempre tiene acceso)
2. **Usuario con ID específico**: `1190738779015757914`
3. **Usuarios en la whitelist** (configurada en variables de entorno)

---

## 📋 ¿Qué hace el Setup?

El comando `/setup` configura:

✅ **Roles de permisos** - Quién puede usar qué comandos
✅ **Canales de logs** - Dónde se envían notificaciones
✅ **Sistema de tickets** - Canales para transcripts y ratings
✅ **Anti-spam** - Canal para alertas de seguridad

Después del setup, los usuarios con los roles configurados podrán usar comandos como:
- `/replace` - Sacar productos del stock (requiere Staff role)
- `/ban` - Banear usuarios (requiere Admin role)
- `/stock` - Ver stock disponible (requiere Admin role)
- `/sync-variants` - Sincronizar productos (requiere Trial Admin role)
- Y más...

---

## 🎯 Permisos por Rol

| Comando | Admin | Staff | Trial Admin | Viewer | Customer |
|---------|-------|-------|-------------|--------|----------|
| `/replace` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/add-stock` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/ban` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/config` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/sync-variants` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `/invoice-view` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `/claim` | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🔍 Cómo Obtener IDs de Roles/Canales

1. **Activa el Modo Desarrollador** en Discord:
   - Configuración de Usuario → Avanzado → Modo Desarrollador (ON)

2. **Obtener ID de un Rol:**
   - Configuración del Servidor → Roles
   - Click derecho en el rol → "Copiar ID"

3. **Obtener ID de un Canal:**
   - Click derecho en el canal → "Copiar ID"

---

## 🆘 Solución de Problemas

### Problema 1: "No se encuentra el comando /setup"

**Solución:**
- Verifica que el bot esté en tu servidor
- Verifica que el bot tenga permisos de "Usar comandos de aplicación"
- Espera unos minutos (los comandos pueden tardar en registrarse)

### Problema 2: "You do not have permission to use this command" al usar `/setup`

**Solución:**
- Solo el **owner del servidor** o usuarios en la whitelist pueden usar `/setup`
- Si no eres el owner, pídele al owner que ejecute el comando

### Problema 3: "Después del setup, los comandos siguen sin funcionar"

**Solución:**
1. Verifica que los usuarios tengan el **rol correcto** asignado
2. Ejecuta `/setup quick` de nuevo para reconfigurar
3. Revisa que los IDs de roles sean correctos

### Problema 4: "El bot no responde en absoluto"

**Solución:**
1. Verifica que el bot esté **online** (bola verde)
2. Verifica que el bot tenga permisos en el canal:
   - Ver canales
   - Enviar mensajes
   - Usar comandos de aplicación
   - Incrustar enlaces
3. Revisa los logs del bot en la KVM/servidor

---

## 🌐 Variables de Entorno (Alternativa)

Si no quieres usar `/setup`, puedes configurar roles globalmente usando **variables de entorno** en tu servidor/KVM:

```env
BOT_ADMIN_ROLE_ID=123456789012345678
BOT_STAFF_ROLE_ID=123456789012345678
BOT_CUSTOMER_ROLE_ID=123456789012345678
BOT_SPAM_CHANNEL_ID=123456789012345678
LOG_CHANNEL_ID=123456789012345678
```

**Nota:** Las configuraciones de `/setup` tienen **prioridad** sobre las variables de entorno.

---

## 📞 Ayuda Adicional

Si necesitas más ayuda, consulta estos archivos:

- `RAILWAY_ENV_VARIABLES.md` - Variables de entorno completas
- `COMANDOS_KVM.md` - Comandos para actualizar el bot
- `README.md` - Documentación general del bot

---

## ✨ Resumen

1. Ejecuta `/setup quick` en Discord
2. Proporciona `admin_role` y `staff_role` (mínimo)
3. Asigna los roles a los usuarios correspondientes
4. ¡Listo! Los usuarios podrán usar los comandos según su rol

**Tiempo estimado:** 2-3 minutos

**Dificultad:** Fácil 🟢
