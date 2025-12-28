# 🚀 Guía de Configuración de ngrok para OAuth2

Esta guía te ayudará a configurar ngrok en tu servidor KMV para que OAuth2 funcione correctamente.

---

## 📋 Requisitos Previos

1. Acceso SSH o terminal a tu servidor KMV
2. Una cuenta gratuita de ngrok (https://ngrok.com)

---

## 🔧 Paso 1: Instalar ngrok en KMV

### Opción A: Descargar directamente en el servidor

```bash
# Conecta a tu servidor KMV por SSH
# Luego ejecuta:

# Para Linux (la mayoría de servidores KMV)
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# O descarga directamente:
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar -xzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/
```

### Opción B: Si KMV tiene panel web con terminal

1. Ve al panel de KMV
2. Abre la terminal/consola
3. Ejecuta los comandos de instalación de arriba

---

## 🔑 Paso 2: Obtener tu Authtoken de ngrok

1. Ve a https://dashboard.ngrok.com/get-started/your-authtoken
2. Inicia sesión o crea una cuenta gratuita
3. Copia tu **Authtoken** (algo como: `2abc123def456ghi789jkl012mno345pqr678stu`)

---

## ⚙️ Paso 3: Configurar ngrok con tu Authtoken

En tu servidor KMV, ejecuta:

```bash
ngrok authtoken TU_AUTHTOKEN_AQUI
```

Reemplaza `TU_AUTHTOKEN_AQUI` con el token que copiaste.

---

## 🚀 Paso 4: Iniciar ngrok

Ejecuta ngrok apuntando al puerto donde corre tu bot (generalmente 3000):

```bash
ngrok http 3000
```

**O si tu bot corre en otro puerto:**

```bash
ngrok http PUERTO_DEL_BOT
```

### Ejemplo de salida:

```
ngrok                                                                            

Session Status                online
Account                       tu-email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       45ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**¡Copia la URL de "Forwarding"!** En este ejemplo sería: `https://abc123def456.ngrok-free.app`

---

## 🔗 Paso 5: Configurar Discord Developer Portal

1. Ve a https://discord.com/developers/applications
2. Selecciona tu aplicación
3. Ve a **OAuth2** → **Redirects**
4. Haz clic en **"Add Redirect"**
5. Agrega la URL de ngrok + `/oauth/callback`:

```
https://abc123def456.ngrok-free.app/oauth/callback
```

6. Haz clic en **"Save Changes"**

---

## 🔧 Paso 6: Configurar Variable en KMV

1. Ve a tu proyecto en KMV
2. Ve a **Variables de Entorno** o **Environment Variables**
3. Agrega una nueva variable:

**Nombre:** `OAUTH_REDIRECT_URI`  
**Valor:** `https://abc123def456.ngrok-free.app/oauth/callback`

(Reemplaza con tu URL de ngrok)

4. Guarda los cambios
5. Reinicia el bot en KMV

---

## 🔄 Paso 7: Mantener ngrok Corriendo

### Opción A: Ejecutar en segundo plano (screen/tmux)

```bash
# Instalar screen (si no está instalado)
sudo apt install screen

# Crear una sesión screen
screen -S ngrok

# Ejecutar ngrok
ngrok http 3000

# Presiona Ctrl+A luego D para desconectarte (ngrok seguirá corriendo)
# Para volver a la sesión: screen -r ngrok
```

### Opción B: Usar systemd (recomendado para producción)

Crea un archivo de servicio:

```bash
sudo nano /etc/systemd/system/ngrok.service
```

Pega esto (ajusta el puerto si es necesario):

```ini
[Unit]
Description=ngrok tunnel
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/ngrok http 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Luego:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ngrok
sudo systemctl start ngrok
sudo systemctl status ngrok
```

---

## ⚠️ Notas Importantes

### 1. URL Temporal (Plan Gratuito)
- En el plan gratuito de ngrok, la URL cambia cada vez que reinicias ngrok
- Si reinicias ngrok, debes actualizar la URL en Discord y KMV

### 2. URL Fija (Plan de Pago)
- Con un plan de pago puedes reservar un dominio fijo
- Ejemplo: `https://mi-bot.ngrok.io` (siempre el mismo)

### 3. Verificar que Funciona

Después de configurar todo:

1. Ve a los logs del bot en KMV
2. Busca este mensaje:
   ```
   [OAUTH2] ✅ OAuth2 callback server running on port 3000
   [OAUTH2] Callback URL: https://abc123def456.ngrok-free.app/oauth/callback
   ```

3. Prueba el bot:
   - Usa el comando `/verification` en Discord
   - Haz clic en "Verify"
   - Deberías ser redirigido a Discord para autorizar
   - Después de autorizar, deberías ver una página de éxito

---

## 🐛 Solución de Problemas

### ngrok no se conecta
- Verifica que el puerto 3000 está abierto en KMV
- Asegúrate de que el bot está corriendo
- Verifica tu authtoken: `ngrok config check`

### Discord dice "redirect_uri mismatch"
- Verifica que la URL en Discord es EXACTAMENTE igual a la de KMV
- Incluye `https://` al inicio
- Incluye `/oauth/callback` al final
- No debe haber espacios extra

### El bot no recibe el callback
- Verifica que ngrok está corriendo: `ps aux | grep ngrok`
- Verifica que el puerto es correcto
- Revisa los logs de ngrok en http://127.0.0.1:4040 (si tienes acceso)

---

## 📚 Recursos Adicionales

- [Documentación oficial de ngrok](https://ngrok.com/docs)
- [ngrok Dashboard](https://dashboard.ngrok.com)
- [Discord OAuth2 Documentation](https://discord.com/developers/docs/topics/oauth2)

---

## ✅ Checklist Final

- [ ] ngrok instalado en KMV
- [ ] Authtoken configurado
- [ ] ngrok corriendo y mostrando URL
- [ ] URL agregada en Discord Developer Portal → OAuth2 → Redirects
- [ ] Variable `OAUTH_REDIRECT_URI` configurada en KMV
- [ ] Bot reiniciado en KMV
- [ ] Prueba de verificación exitosa

¡Listo! Tu bot debería funcionar con OAuth2 ahora. 🎉

