# Discord Social Media Bot

Bot de Discord para publicar automaticamente las nuevas publicaciones de Instagram en un canal de Discord mediante embed.

## Objetivo configurado

- Cuenta de Instagram monitorizada: https://www.instagram.com/gtaworld_es_oficial/
- Canal de Discord destino: https://discord.com/channels/1419780364263755798/1455996281272012932

## Que hace el bot

- Consulta Instagram periodicamente.
- Detecta si hay una nueva publicacion en el perfil configurado.
- Envia al canal de Discord:
  - URL del post de Instagram.
  - Embed con imagen/video preview, descripcion corta, likes y comentarios.
- Guarda el ultimo post enviado en un archivo local para no duplicar publicaciones al reiniciar.

## Requisitos

- Node.js 18 o superior.
- Bot de Discord con permisos en el canal destino:
  - View Channel
  - Send Messages
  - Embed Links

## Instalacion

```bash
npm install
```

## Configuracion (.env)

Ejemplo:

```env
DISCORD_TOKEN=pon_aqui_tu_token
INSTAGRAM_USERNAME=gtaworld_es_oficial
DISCORD_CHANNEL_ID=1455996281272012932
CHECK_INTERVAL_MINUTES=10
POST_ON_STARTUP=false
STATE_FILE=.ig-state.json
```

Variables:

- `DISCORD_TOKEN`: token del bot.
- `INSTAGRAM_USERNAME`: usuario de Instagram a monitorizar.
- `DISCORD_CHANNEL_ID`: canal de Discord donde se publican los embeds.
- `CHECK_INTERVAL_MINUTES`: cada cuantos minutos revisa Instagram.
- `POST_ON_STARTUP`: si es `true`, publica el ultimo post al iniciar aun cuando no sea nuevo.
- `STATE_FILE`: archivo donde se guarda el ultimo post publicado.

## Ejecutar

```bash
npm start
```

## Notas

- El bot no usa comandos de texto ni botones; solo automatizacion de social media.
- Si Instagram cambia sus endpoints internos, puede requerir ajuste del metodo de lectura.

## Scripts

- `npm start`: inicia el bot.
- `npm test`: placeholder.
