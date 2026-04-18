require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const ID_CANAL_REGISTRO = process.env.LOG_CHANNEL_ID;
const PREFIJO = process.env.PREFIX || '!';

if (!TOKEN || !ID_CANAL_REGISTRO) {
  console.error('Faltan variables de entorno: DISCORD_TOKEN y/o LOG_CHANNEL_ID');
  process.exit(1);
}

const turnos = new Map();

function formatoHora(fecha) {
  return fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatoFecha(fecha) {
  return fecha.toLocaleDateString('es-CO');
}

function calcularDuracion(inicio, fin) {
  const diferencia = fin - inicio;
  const horas = Math.floor(diferencia / 3600000);
  const minutos = Math.floor((diferencia % 3600000) / 60000);
  return `${horas}h ${minutos}min`;
}

async function enviarRegistro(embed) {
  const canalRegistro = await client.channels.fetch(ID_CANAL_REGISTRO).catch(() => null);
  if (!canalRegistro || canalRegistro.type !== ChannelType.GuildText) return;
  await canalRegistro.send({ embeds: [embed] });
}

client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIJO)) return;

  const sinPrefijo = message.content.slice(PREFIJO.length).trim();
  const [comando, ...args] = sinPrefijo.split(/\s+/);
  const cmd = (comando || '').toLowerCase();

  try {
    if (cmd === 'entrar' || (cmd === 'servicio' && args[0]?.toLowerCase() === 'entrar')) {
      const userId = message.author.id;

      if (turnos.has(userId)) {
        await message.reply(`Ya estas en servicio. Usa ${PREFIJO}salir primero.`);
        return;
      }

      const horaEntrada = new Date();
      turnos.set(userId, horaEntrada);

      const embedEntrada = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Inicio de servicio')
        .setDescription(`**${message.member?.displayName || message.author.username}** entro al servicio.`)
        .addFields(
          { name: 'Hora de entrada', value: formatoHora(horaEntrada), inline: true },
          { name: 'Fecha', value: formatoFecha(horaEntrada), inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

      await message.channel.send({ embeds: [embedEntrada] });

      const embedLogEntrada = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Registro de horas - Entrada')
        .addFields(
          {
            name: 'Empleado',
            value: `${message.member?.displayName || message.author.username} (<@${userId}>)`
          },
          { name: 'Hora de entrada', value: formatoHora(horaEntrada), inline: true },
          { name: 'Fecha', value: formatoFecha(horaEntrada), inline: true }
        )
        .setTimestamp();

      await enviarRegistro(embedLogEntrada);
      return;
    }

    if (cmd === 'salir' || (cmd === 'servicio' && args[0]?.toLowerCase() === 'salir')) {
      const userId = message.author.id;

      if (!turnos.has(userId)) {
        await message.reply(`No tienes un servicio activo. Usa ${PREFIJO}entrar primero.`);
        return;
      }

      const horaEntrada = turnos.get(userId);
      const horaSalida = new Date();
      const duracion = calcularDuracion(horaEntrada, horaSalida);
      turnos.delete(userId);

      const embedSalida = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Fin de servicio')
        .setDescription(`**${message.member?.displayName || message.author.username}** salio del servicio.`)
        .addFields(
          { name: 'Entrada', value: formatoHora(horaEntrada), inline: true },
          { name: 'Salida', value: formatoHora(horaSalida), inline: true },
          { name: 'Tiempo trabajado', value: duracion }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

      await message.channel.send({ embeds: [embedSalida] });

      const embedLogSalida = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Registro de horas - Salida')
        .addFields(
          {
            name: 'Empleado',
            value: `${message.member?.displayName || message.author.username} (<@${userId}>)`
          },
          { name: 'Entrada', value: formatoHora(horaEntrada), inline: true },
          { name: 'Salida', value: formatoHora(horaSalida), inline: true },
          { name: 'Tiempo trabajado', value: duracion, inline: true },
          { name: 'Fecha', value: formatoFecha(horaEntrada), inline: true }
        )
        .setTimestamp();

      await enviarRegistro(embedLogSalida);
      return;
    }

    if (cmd === 'anuncio') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.reply('No tienes permisos para hacer anuncios.');
        return;
      }

      const texto = args.join(' ').trim();
      if (!texto) {
        await message.reply(`Uso: ${PREFIJO}anuncio <mensaje>`);
        return;
      }

      const embedAnuncio = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setAuthor({
          name: `Anuncio de ${message.member?.displayName || message.author.username}`,
          iconURL: message.author.displayAvatarURL()
        })
        .setTitle('Anuncio - AutoExotic')
        .setDescription(texto)
        .setFooter({ text: 'AutoExotic | Staff' })
        .setTimestamp();

      await message.channel.send({ embeds: [embedAnuncio] });
      if (message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.delete().catch(() => null);
      }
      return;
    }

    if (cmd === 'ayuda') {
      const embedAyuda = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Comandos disponibles')
        .setDescription([
          `${PREFIJO}entrar o ${PREFIJO}servicio entrar`,
          `${PREFIJO}salir o ${PREFIJO}servicio salir`,
          `${PREFIJO}anuncio <mensaje>`,
          `${PREFIJO}ayuda`
        ].join('\n'));

      await message.reply({ embeds: [embedAyuda] });
    }
  } catch (error) {
    console.error('Error procesando comando:', error);
    await message.reply('Ocurrio un error ejecutando el comando. Revisa configuracion y permisos.');
  }
});

client.login(TOKEN);