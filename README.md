# Discord Social Media Bot

Bot de Discord para automatizar la publicación de contenido de Instagram en un canal específico, usando la Instagram API con Facebook Login y embeds nativos de Discord.

También publica contenido de TikTok en un canal independiente, con selector manual para elegir qué video enviar.

Este proyecto fue producido por **Miusticat** para **GTA WORLD ES** como una base sólida de automatización social media para Discord.

## Resumen

El bot monitorea el perfil de Instagram configurado, detecta nuevas publicaciones y las replica automáticamente en Discord con:

- embed visual con imagen o video preview;
- métricas de la publicación cuando la API las entrega;
- botón directo para abrir la publicación original;
- control de estado local para evitar duplicados.

## Demo funcional

- Instagram monitorizado: [@gtaworld_es_oficial](https://www.instagram.com/gtaworld_es_oficial/)
- Canal de Discord destino: `https://discord.com/channels/<guild_id>/<channel_id>`

## Funcionalidades clave

- Detección automática de nuevas publicaciones por polling.
- Publicación inmediata en Discord con embed y botón `IR A LA PUBLICACIÓN`.
- Canal independiente para TikTok con publicación automática y comando manual de selección.
- Lectura de `like_count` y `comments_count` desde la API oficial cuando están disponibles.
- Persistencia local del último post publicado para evitar repeticiones.
- Configuración por variables de entorno para facilitar despliegues.

## Stack

- Node.js 18+
- `discord.js`
- `dotenv`
- Instagram API with Facebook Login

## Requisitos

- Un bot de Discord con acceso al servidor y al canal destino.
- Permisos del bot en el canal:
  - View Channel
  - Send Messages
  - Embed Links
- Token válido de Instagram API con Facebook Login.

## Instalación

```bash
npm install
```

## Configuración

Define un archivo `.env` con esta estructura:

```env
DISCORD_TOKEN=pon_aqui_tu_token
INSTAGRAM_USERNAME=gtaworld_es_oficial
INSTAGRAM_MEDIA_API_URL=https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&access_token=tu_token
INSTAGRAM_ACCESS_TOKEN=tu_token
DISCORD_CHANNEL_ID=pon_aqui_el_id_de_tu_canal
CHECK_INTERVAL_MINUTES=1
POST_ON_STARTUP=true
STATE_FILE=.ig-state.json
```

### Variables principales

- `DISCORD_TOKEN`: token del bot de Discord.
- `INSTAGRAM_USERNAME`: nombre de usuario del perfil a monitorizar.
- `INSTAGRAM_MEDIA_API_URL`: endpoint completo de Instagram. Si no lo defines, el bot lo construye con `INSTAGRAM_ACCESS_TOKEN`.
- `INSTAGRAM_ACCESS_TOKEN`: token de acceso para la API oficial.
- `DISCORD_CHANNEL_ID`: canal de Discord donde se publican los posts. Usa el ID de tu propio servidor.
- `TIKTOK_USERNAME`: nombre de usuario de TikTok a monitorizar.
- `TIKTOK_MEDIA_API_URL`: endpoint completo para leer videos de TikTok. Si lo defines, se usa en lugar del endpoint por defecto (`tiktok-scraper7.p.rapidapi.com`).
- `TIKTOK_MEDIA_API_KEY`: clave API para el endpoint configurado de TikTok.
- `TIKTOK_RAPIDAPI_HOST`: host de RapidAPI para el endpoint configurado de TikTok. Por defecto usa `tiktok-scraper7.p.rapidapi.com`.
- `RAPIDAPI_KEY`: clave de RapidAPI usada como fallback si no defines `TIKTOK_MEDIA_API_KEY`.
- `TIKTOK_CHANNEL_ID`: canal de Discord donde se publican los videos de TikTok. Si no lo defines, usa el canal de Instagram como fallback.
- `CHECK_INTERVAL_MINUTES`: intervalo de revisión. Para detección rápida se recomienda `1`.
- `POST_ON_STARTUP`: si es `true`, publica el último post al arrancar.
- `STATE_FILE`: archivo local para guardar el último post publicado.
- Si el endpoint de TikTok devuelve `404` o `API doesn't exists`, el bot lo mostrará como fuente no disponible y no romperá Instagram.

### Comandos

- `/setchannel`: cambia el canal de Instagram.
- `/settiktokchannel`: cambia el canal de TikTok.
- `/publicar`: selecciona una publicación de Instagram y la publica manualmente.
- `/publicartiktok`: selecciona un video de TikTok y lo publica manualmente.

## Uso

```bash
npm start
```

## Flujo de trabajo

1. El bot arranca y carga el estado local.
2. Consulta Instagram en el intervalo configurado.
3. Consulta TikTok en su propio canal y detecta nuevos videos por separado.
4. Si detecta una publicación nueva, la envía al canal correspondiente.
5. Añade un embed con preview, métricas y botón de acceso directo.
6. Guarda el ID del último post para no duplicarlo.

## Notas técnicas

- La detección es por polling; con un intervalo de 1 minuto la respuesta es rápida y estable.
- Si la API no expone métricas, el bot muestra `0` en likes y comentarios.
- Si el token expira, debes renovarlo y actualizar el `.env`.

## Scripts

- `npm start`: inicia el bot.
- `npm test`: placeholder.

## Autoría

© 2026 **Miusticat**. Proyecto producido para **GTA WORLD ES**.

## Licencia

Uso interno y de portfolio, salvo indicación distinta del autor.
