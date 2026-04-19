require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const ID_CANAL_SERVICIO = process.env.SERVICE_CHANNEL_ID || '1483893982734843915';
const ID_CANAL_REGISTRO = process.env.LOG_CHANNEL_ID || '1465430858222666022';
const PREFIJO = process.env.PREFIX || '!';

if (!TOKEN) {
  console.error('Falta la variable de entorno: DISCORD_TOKEN');
  process.exit(1);
}

const turnos = new Map();
const BOTON_ENTRAR = 'servicio_entrar';
const BOTON_SALIR = 'servicio_salir';

function crearFilaBotonesServicio() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BOTON_ENTRAR)
      .setLabel('Entrar de servicio')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BOTON_SALIR)
      .setLabel('Salir de servicio')
      .setStyle(ButtonStyle.Danger)
  );
}

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

async function enviarPanelServicioSiNoExiste() {
  const canalServicio = await client.channels.fetch(ID_CANAL_SERVICIO).catch(() => null);
  if (!canalServicio || canalServicio.type !== ChannelType.GuildText) {
    console.error(`No se encontro canal de servicio valido: ${ID_CANAL_SERVICIO}`);
    return;
  }

  const mensajes = await canalServicio.messages.fetch({ limit: 20 }).catch(() => null);
  const panelExistente = mensajes?.find((msg) =>
    msg.author.id === client.user.id &&
    msg.components?.some((fila) =>
      fila.components?.some((componente) =>
        componente.customId === BOTON_ENTRAR || componente.customId === BOTON_SALIR
      )
    )
  );

  if (panelExistente) return;

  const embedPanel = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Panel de servicio - AutoExotic')
    .setDescription('Usa los botones para iniciar o finalizar tu jornada.')
    .addFields(
      { name: 'Entrar de servicio', value: 'Marca tu hora de entrada.' },
      { name: 'Salir de servicio', value: 'Registra tu salida y horas trabajadas.' }
    )
    .setTimestamp();

  await canalServicio.send({ embeds: [embedPanel], components: [crearFilaBotonesServicio()] });
}

async function iniciarServicio({ user, member, channel }) {
  const userId = user.id;

  if (turnos.has(userId)) {
    return { ok: false, mensaje: 'Ya te encuentras en servicio.' };
  }

  const horaEntrada = new Date();
  turnos.set(userId, horaEntrada);

  const nombre = member?.displayName || user.username;
  const embedEntrada = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Inicio de servicio')
    .setDescription(`**${nombre}** entro al servicio.`)
    .addFields(
      { name: 'Hora de entrada', value: formatoHora(horaEntrada), inline: true },
      { name: 'Fecha', value: formatoFecha(horaEntrada), inline: true }
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();

  const embedLogEntrada = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Registro de horas - Entrada')
    .addFields(
      { name: 'Empleado', value: `${nombre} (<@${userId}>)` },
      { name: 'Hora de entrada', value: formatoHora(horaEntrada), inline: true },
      { name: 'Fecha', value: formatoFecha(horaEntrada), inline: true }
    )
    .setTimestamp();

  await enviarRegistro(embedLogEntrada);
  return { ok: true, mensaje: 'Entrada registrada correctamente.', embed: embedEntrada };
}

async function finalizarServicio({ user, member, channel }) {
  const userId = user.id;

  if (!turnos.has(userId)) {
    return { ok: false, mensaje: 'No tienes un servicio activo.' };
  }

  const horaEntrada = turnos.get(userId);
  const horaSalida = new Date();
  const duracion = calcularDuracion(horaEntrada, horaSalida);
  turnos.delete(userId);

  const nombre = member?.displayName || user.username;
  const embedSalida = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Fin de servicio')
    .setDescription(`**${nombre}** salio del servicio.`)
    .addFields(
      { name: 'Entrada', value: formatoHora(horaEntrada), inline: true },
      { name: 'Salida', value: formatoHora(horaSalida), inline: true },
      { name: 'Tiempo trabajado', value: duracion }
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embedSalida] });

  const embedLogSalida = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Registro de horas - Salida')
    .addFields(
      { name: 'Empleado', value: `${nombre} (<@${userId}>)` },
      { name: 'Entrada', value: formatoHora(horaEntrada), inline: true },
      { name: 'Salida', value: formatoHora(horaSalida), inline: true },
      { name: 'Tiempo trabajado', value: duracion, inline: true },
      { name: 'Fecha', value: formatoFecha(horaEntrada), inline: true }
    )
    .setTimestamp();

  await enviarRegistro(embedLogSalida);
  return { ok: true, mensaje: 'Salida registrada correctamente.' };
}

client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  enviarPanelServicioSiNoExiste().catch((error) => {
    console.error('Error enviando panel de servicio:', error);
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.channelId !== ID_CANAL_SERVICIO) {
    await interaction.reply({
      content: `Este panel solo funciona en el canal configurado (<#${ID_CANAL_SERVICIO}>).`,
      ephemeral: true
    });
    return;
  }

  try {
    if (interaction.customId === BOTON_ENTRAR) {
      const resultado = await iniciarServicio({
        user: interaction.user,
        member: interaction.member,
        channel: interaction.channel
      });
      await interaction.reply({
        content: resultado.mensaje,
        embeds: resultado.embed ? [resultado.embed] : [],
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === BOTON_SALIR) {
      const resultado = await finalizarServicio({
        user: interaction.user,
        member: interaction.member,
        channel: interaction.channel
      });
      await interaction.reply({ content: resultado.mensaje, ephemeral: true });
    }
  } catch (error) {
    console.error('Error en interaccion de botones:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'No se pudo procesar tu accion.', ephemeral: true });
      return;
    }
    await interaction.followUp({ content: 'No se pudo procesar tu accion.', ephemeral: true });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIJO)) return;

  const sinPrefijo = message.content.slice(PREFIJO.length).trim();
  const [comando, ...args] = sinPrefijo.split(/\s+/);
  const cmd = (comando || '').toLowerCase();

  try {
    if (cmd === 'entrar' || (cmd === 'servicio' && args[0]?.toLowerCase() === 'entrar')) {
      const resultado = await iniciarServicio({
        user: message.author,
        member: message.member,
        channel: message.channel
      });
      await message.reply(resultado.mensaje);
      return;
    }

    if (cmd === 'salir' || (cmd === 'servicio' && args[0]?.toLowerCase() === 'salir')) {
      const resultado = await finalizarServicio({
        user: message.author,
        member: message.member,
        channel: message.channel
      });
      await message.reply(resultado.mensaje);
      return;
    }

    if (cmd === 'panel') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await message.reply('No tienes permisos para publicar el panel.');
        return;
      }

      if (message.channelId !== ID_CANAL_SERVICIO) {
        await message.reply(`El panel solo se publica en <#${ID_CANAL_SERVICIO}>.`);
        return;
      }

      await enviarPanelServicioSiNoExiste();
      await message.reply('Panel de servicio verificado en este canal.');
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
          `${PREFIJO}panel (admin, solo canal de servicio)`,
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