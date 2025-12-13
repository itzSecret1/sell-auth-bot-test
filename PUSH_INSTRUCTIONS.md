# 📤 Instrucciones para Hacer Push a GitHub

## 🚀 Comandos para Ejecutar

Abre una terminal en la carpeta del proyecto y ejecuta estos comandos:

```bash
# 1. Navegar a la carpeta del proyecto
cd sell-auth-bot-test-main

# 2. Inicializar git (si no está inicializado)
git init

# 3. Agregar todos los archivos
git add .

# 4. Hacer commit
git commit -m "Add ticket system, confirmation system, and hosting options

- Added ticket panel command and ticket management system
- Added confirmation system for orders > 5 items
- Made replace command always public
- Added pending orders system
- Updated staff references to trial staff
- Added hosting options documentation"

# 5. Agregar remote (si no existe)
git remote add origin https://github.com/itzSecret1/sell-auth-bot-test2.git

# O actualizar si ya existe:
git remote set-url origin https://github.com/itzSecret1/sell-auth-bot-test2.git

# 6. Configurar branch principal
git branch -M main

# 7. Hacer push
git push -u origin main
```

Si el push falla porque el repositorio ya tiene contenido, usa:

```bash
git push -u origin main --force
```

---

## 📁 Archivos Nuevos Creados

1. **commands/ticketpanel.js** - Comando para crear el panel de tickets
2. **commands/confirm-order.js** - Comando para confirmar órdenes pendientes
3. **utils/TicketManager.js** - Sistema completo de gestión de tickets
4. **utils/PendingOrders.js** - Sistema de órdenes pendientes
5. **HOSTING_OPTIONS.md** - Documentación de opciones de hosting
6. **PUSH_INSTRUCTIONS.md** - Este archivo

---

## 📝 Archivos Modificados

1. **classes/Bot.js** - Agregado manejo de interacciones de botones y modales para tickets
2. **commands/replace.js** - Eliminada opción de visibilidad, agregado sistema de confirmación
3. **utils/config.js** - Agregado BOT_TRIAL_ADMIN_ROLE_ID
4. **utils/checkUserIdWhitelist.js** - Actualizado comentarios a "trial staff"

---

## 🔑 Variables de Entorno Necesarias

Si aún no las has agregado en Railway/hosting, necesitas estas variables:

### Obligatorias:
- `BOT_TOKEN`
- `BOT_GUILD_ID`
- `SA_API_KEY`
- `SA_SHOP_ID`

### Opcionales (pero recomendadas):
- `BOT_ADMIN_ROLE_ID`
- `BOT_STAFF_ROLE_ID`
- `BOT_CUSTOMER_ROLE_ID`
- `BOT_TRIAL_ADMIN_ROLE_ID`
- `BOT_USER_ID_WHITELIST`
- `LOG_CHANNEL_ID`

---

## ✅ Verificación

Después del push, verifica que todos los archivos estén en GitHub:
- ✅ commands/ticketpanel.js
- ✅ commands/confirm-order.js
- ✅ utils/TicketManager.js
- ✅ utils/PendingOrders.js
- ✅ HOSTING_OPTIONS.md

---

## 🆘 Si Tienes Problemas

1. **Git no está instalado**: Descarga Git desde [git-scm.com](https://git-scm.com/)

2. **Error de autenticación**: Necesitas configurar tus credenciales:
   ```bash
   git config --global user.name "Tu Nombre"
   git config --global user.email "tu@email.com"
   ```

3. **Error de permisos**: Asegúrate de tener acceso al repositorio en GitHub

4. **Repositorio ya existe con contenido**: Usa `--force` en el push (cuidado, esto sobrescribe)

---

## 📞 Soporte

Si tienes problemas, revisa:
- Que Git esté instalado: `git --version`
- Que tengas acceso al repositorio en GitHub
- Que la URL del repositorio sea correcta

