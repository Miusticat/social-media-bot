# Discord Bot AutoExotic

Bot de Discord para gestionar jornadas de servicio del staff de AutoExotic con botones, validaciones y registro de horas en un canal de historial.

## Funcionalidades

- Panel con botones en canal de servicio:
  - Entrar de servicio
  - Salir de servicio
- Validaciones de estado:
  - Si ya estas en servicio, no permite entrar de nuevo.
  - Si no estas en servicio, no permite salir.
- Registro automatico de entradas y salidas en canal de historial.
- Comando de anuncios en formato embed para staff.
- Comando de ayuda.

## Requisitos

- Node.js 18 o superior.
- Un bot de Discord creado en Discord Developer Portal.
- Permisos del bot en servidor:
  - View Channels
  - Send Messages
  - Embed Links
  - Read Message History
  - Manage Messages (opcional, para borrar el mensaje de comando de anuncio)

## Instalacion

1. Clonar o descargar este repositorio.
2. Instalar dependencias:

```bash
npm install
```

3. Crear archivo `.env` a partir de `.env.example`.
4. Iniciar bot:

```bash
npm start
```

## Configuracion (.env)

Usa este formato:

```env
DISCORD_TOKEN=pon_aqui_tu_token
SERVICE_CHANNEL_ID=1483893982734843915
LOG_CHANNEL_ID=1465430858222666022
PREFIX=!
```

Descripcion de variables:

- `DISCORD_TOKEN`: token del bot.
- `SERVICE_CHANNEL_ID`: canal donde vive el panel de botones de servicio.
- `LOG_CHANNEL_ID`: canal donde se registra el historial de horas.
- `PREFIX`: prefijo de comandos por mensaje.

## Uso

### Panel de servicio (botones)

Al iniciar, el bot intenta publicar automaticamente un panel en el canal de servicio.

- Boton Entrar de servicio:
  - Marca hora de entrada.
  - Publica confirmacion en el canal.
  - Registra entrada en canal de historial.

- Boton Salir de servicio:
  - Marca hora de salida.
  - Calcula tiempo trabajado.
  - Publica confirmacion en el canal.
  - Registra salida en canal de historial.

## Comandos disponibles

- `!panel`
  - Revisa/publica el panel en el canal de servicio.
  - Requiere permiso Manage Channels.

- `!entrar` o `!servicio entrar`
  - Inicia servicio por comando de texto.

- `!salir` o `!servicio salir`
  - Finaliza servicio por comando de texto.

- `!anuncio <mensaje>`
  - Publica anuncio en embed.
  - Requiere permiso Manage Messages.

- `!ayuda`
  - Muestra la lista de comandos.

## Notas tecnicas

- El control de servicio esta en memoria (Map en runtime).
- Si el bot se reinicia, los turnos activos no persisten.
- Si necesitas persistencia, el siguiente paso recomendado es integrar una base de datos (SQLite, PostgreSQL, etc.).

## Seguridad

- Nunca subas tu token real al repositorio.
- Mantener `.env` en `.gitignore`.
- Si un token se expone, regenerarlo inmediatamente en Discord Developer Portal.

## Scripts

- `npm start`: ejecuta el bot.
- `npm test`: placeholder (sin pruebas configuradas).

## Licencia

ISC
