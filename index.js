require('dotenv').config();
const tiktok = require('./tiktok.js');
const fs = require('fs/promises');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, REST, Routes, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || 'gtaworld_es_oficial';
const INSTAGRAM_MEDIA_API_URL = process.env.INSTAGRAM_MEDIA_API_URL || '';
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
const DISCORD_CHANNEL_ID_DEFAULT = process.env.DISCORD_CHANNEL_ID || '1455996281272012932';
const TIKTOK_CHANNEL_ID_DEFAULT = process.env.TIKTOK_CHANNEL_ID || DISCORD_CHANNEL_ID_DEFAULT;
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 1);
const POST_ON_STARTUP = String(process.env.POST_ON_STARTUP || 'false').toLowerCase() === 'true';
const STATE_FILE = path.resolve(process.env.STATE_FILE || '.ig-state.json');
const CONFIG_FILE = path.resolve('.ig-config.json');
const CHANNELS_FILE = path.resolve(process.env.CHANNELS_FILE || '.ig-channels.json');
const TIKTOK_CONFIG_FILE = path.resolve('.tt-config.json');
const POSTS_STATE_FILE = path.resolve(process.env.POSTS_STATE_FILE || '.ig-posts.json');
const BUTTON_LABEL = 'IR A LA PUBLICACIÓN';

if (!TOKEN) {
  console.error('Falta la variable de entorno DISCORD_TOKEN.');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('Falta la variable de entorno CLIENT_ID.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
let DISCORD_CHANNEL_ID = DISCORD_CHANNEL_ID_DEFAULT;
let TIKTOK_CHANNEL_ID = TIKTOK_CHANNEL_ID_DEFAULT;
// guildId -> channelId mapping for Instagram posts
let CHANNELS_MAP = {};

function getUnpostedPosts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  if (!lastPublishedPostId) return posts;

  // Retorna todos los posts excepto el que ya fue publicado
  return posts.filter(p => p && p.id && p.id !== lastPublishedPostId);
}

let lastPublishedPostId = null;
let isCheckingInstagram = false;

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    lastPublishedPostId = parsed.lastPublishedPostId || null;
  } catch {
    lastPublishedPostId = null;
  }
}

async function saveState() {
  const payload = { lastPublishedPostId };
  await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

// Persist mapping between instagram post id and discord messages (supports multiple postings per post)
async function loadPostedMessages() {
  try {
    const raw = await fs.readFile(POSTS_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // shape: { postId: [ { guildId, channelId, messageId, permalink }, ... ] }
    return parsed || {};
  } catch {
    return {};
  }
}

function getInstagramChannelIdForGuild(guildId) {
  return CHANNELS_MAP[guildId] || DISCORD_CHANNEL_ID;
}

async function savePostedMessages(map) {
  await fs.writeFile(POSTS_STATE_FILE, JSON.stringify(map, null, 2), 'utf-8');
}

async function markPostMessage(postId, guildId, channelId, messageId, postPermalink) {
  const map = await loadPostedMessages();
  if (!map[postId]) map[postId] = [];
  const exists = map[postId].some(e => e.guildId === guildId && e.channelId === channelId && e.messageId === messageId);
  if (!exists) {
    map[postId].push({ guildId, channelId, messageId, permalink: postPermalink || '' });
    await savePostedMessages(map);
  }
}

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.channelId) {
      DISCORD_CHANNEL_ID = parsed.channelId;
    }
    if (parsed.channels && typeof parsed.channels === 'object') {
      CHANNELS_MAP = parsed.channels;
    }
  } catch {
    DISCORD_CHANNEL_ID = DISCORD_CHANNEL_ID_DEFAULT;
  }
}

async function saveConfig() {
  const payload = { channelId: DISCORD_CHANNEL_ID, channels: CHANNELS_MAP };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

async function hasPostBeenSentToChannel(postId, channelId) {
  const map = await loadPostedMessages();
  const entries = map?.[postId] || [];
  return entries.some(entry => entry.channelId === channelId);
}

async function loadTikTokConfig() {
  try {
    const raw = await fs.readFile(TIKTOK_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.channelId) {
      TIKTOK_CHANNEL_ID = parsed.channelId;
    }
  } catch {
    TIKTOK_CHANNEL_ID = TIKTOK_CHANNEL_ID_DEFAULT;
  }
}

async function saveTikTokConfig() {
  const payload = { channelId: TIKTOK_CHANNEL_ID };
  await fs.writeFile(TIKTOK_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Establece el canal donde se publicarán las nuevas publicaciones de Instagram')
      .addChannelOption(option =>
        option
          .setName('canal')
          .setDescription('El canal de Discord donde publicar')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('settiktokchannel')
      .setDescription('Establece el canal donde se publicarán las nuevas publicaciones de TikTok')
      .addChannelOption(option =>
        option
          .setName('canal')
          .setDescription('El canal de Discord donde publicar TikTok')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('publicar')
      .setDescription('Verifica y elige una publicación de Instagram para publicar')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('publicartiktok')
      .setDescription('Verifica y elige una publicación de TikTok para publicar')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('publicartodoig')
      .setDescription('Publica todas las publicaciones de Instagram disponibles')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('publicartodotiktok')
      .setDescription('Publica todos los videos de TikTok disponibles')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('resetstate')
      .setDescription('Resetea el estado de publicaciones (muestra todas nuevamente)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Muestra el estado actual del bot')
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('Iniciando la actualización global de comandos (/)');

    const data = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ Se registraron ${data.length} comandos globales de aplicación.`);
    console.log('Nota: los comandos globales pueden tardar un tiempo en propagarse a todos los servidores.');
  } catch (error) {
    console.error('Error al registrar comandos globales:', error.message);
  }
}

function normalizePost(node) {
  if (!node) return null;

  const captionEdge = node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
  return {
    id: String(node.id || ''),
    shortcode: node.shortcode,
    caption: captionEdge,
    takenAt: node.taken_at_timestamp,
    imageUrl: node.display_url,
    isVideo: !!node.is_video,
    likes: node.edge_liked_by?.count || 0,
    comments: node.edge_media_to_comment?.count || 0
  };
}

function buildInstagramPostUrl(shortcode) {
  return `https://www.instagram.com/p/${shortcode}/`;
}

function buildInstagramMediaApiUrl() {
  if (INSTAGRAM_MEDIA_API_URL) {
    return INSTAGRAM_MEDIA_API_URL;
  }

  if (!INSTAGRAM_ACCESS_TOKEN) {
    return '';
  }

  return 'https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&access_token=' + encodeURIComponent(INSTAGRAM_ACCESS_TOKEN);
}

function normalizeApiMediaItem(item) {
  if (!item) return null;

  const permalink = item.permalink || '';
  const shortcodeMatch = permalink.match(/instagram\.com\/p\/([^/?#]+)/i);
  const shortcode = shortcodeMatch?.[1] || item.id || '';

  return {
    id: String(item.id || ''),
    shortcode,
    caption: item.caption || '',
    takenAt: item.timestamp ? Date.parse(item.timestamp) / 1000 : null,
    imageUrl: item.media_url || '',
    isVideo: String(item.media_type || '').toUpperCase() === 'VIDEO',
    likes: Number(item.like_count || 0),
    comments: Number(item.comments_count || 0),
    permalink: permalink || buildInstagramPostUrl(shortcode)
  };
}

async function fetchProfilePosts() {
  const endpoint = buildInstagramMediaApiUrl();
  if (!endpoint) {
    throw new Error('Falta INSTAGRAM_MEDIA_API_URL o INSTAGRAM_ACCESS_TOKEN en el entorno.');
  }

  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Instagram API respondio ${response.status}: ${body.slice(0, 180)}`);
  }

  const data = await response.json();
  
  // Log para debugging
  console.log('Respuesta de Instagram API:', JSON.stringify(data).slice(0, 300));
  
  const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.media?.data) ? data.media.data : [];

  if (!Array.isArray(items) || items.length === 0) {
    console.warn('No se obtuvieron items de Instagram. Estructura:', Object.keys(data));
    return [];
  }

  const normalized = items
    .map((item) => normalizeApiMediaItem(item))
    .filter((post) => post && post.id);
  
  console.log(`✅ Se obtuvieron ${normalized.length} posts de Instagram`);
  return normalized;
}

function createPostEmbed(post) {
  const postUrl = buildInstagramPostUrl(post.shortcode);
  const caption = post.caption
    ? post.caption.length > 300
      ? `${post.caption.slice(0, 297)}...`
      : post.caption
    : 'Sin descripcion';

  const publishedAt = post.takenAt ? new Date(post.takenAt * 1000) : new Date();

  const embed = new EmbedBuilder()
    .setColor(0xE1306C)
    .setAuthor({
      name: `Nueva publicacion de @${INSTAGRAM_USERNAME}`,
      url: `https://www.instagram.com/${INSTAGRAM_USERNAME}/`
    })
    .setTitle('Ver publicacion en Instagram')
    .setURL(postUrl)
    .setDescription(caption)
    .addFields(
      { name: 'Likes', value: String(post.likes), inline: true },
      { name: 'Comentarios', value: String(post.comments), inline: true },
      { name: 'Tipo', value: post.isVideo ? 'Video' : 'Imagen', inline: true }
    )
    .setFooter({ text: `Instagram: ${INSTAGRAM_USERNAME}` })
    .setTimestamp(publishedAt);

  if (post.imageUrl) {
    embed.setImage(post.imageUrl);
  }

  return embed;
}

function createPostButtonRow(postUrl) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: BUTTON_LABEL,
          url: postUrl
        }
      ]
    }
  ];
}

async function postToDiscord(post, options = {}) {
  // options: { targetGuildId, targetChannelId }
  const postUrl = post.permalink || buildInstagramPostUrl(post.shortcode);
  const embed = createPostEmbed(post);
  const components = createPostButtonRow(postUrl);

  // Build targets
  const targets = [];
  if (options.targetChannelId) {
    targets.push({ guildId: options.targetGuildId || null, channelId: options.targetChannelId });
  } else if (options.targetGuildId) {
    const ch = CHANNELS_MAP[options.targetGuildId] || DISCORD_CHANNEL_ID;
    if (ch) targets.push({ guildId: options.targetGuildId, channelId: ch });
  } else {
    const all = Object.entries(CHANNELS_MAP || {});
    if (all.length === 0 && DISCORD_CHANNEL_ID) {
      targets.push({ guildId: null, channelId: DISCORD_CHANNEL_ID });
    } else {
      for (const [guildId, channelId] of all) {
        targets.push({ guildId, channelId });
      }
    }
  }

  for (const t of targets) {
    try {
      const channel = await client.channels.fetch(t.channelId).catch(() => null);
      if (!channel) {
        console.warn(`No se encontro canal ${t.channelId} para guild ${t.guildId}`);
        continue;
      }
      const isTextChannel = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
      if (!isTextChannel) continue;

      const sent = await channel.send({ content: postUrl, embeds: [embed], components });
      try {
        await markPostMessage(post.id, t.guildId || channel.guild?.id || null, channel.id, sent.id, postUrl);
      } catch (err) {
        console.error('Error guardando mapping de post->mensaje:', err?.message || err);
      }
    } catch (err) {
      console.error('Error enviando publicación a canal:', err?.message || err);
    }
  }
}

async function updatePublishedMessages() {
  try {
    const postedMap = await loadPostedMessages();
    const posts = await fetchProfilePosts();
    if (!posts || posts.length === 0) return;

    // Ensure we can detect existing messages in configured channels even if they were posted before this update
    const configured = Object.entries(CHANNELS_MAP || {});
    if (configured.length === 0 && DISCORD_CHANNEL_ID) configured.push([null, DISCORD_CHANNEL_ID]);

    // Scan channels to discover messages that contain post permalinks and add to postedMap if missing
    for (const [guildId, channelId] of configured) {
      try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;
        const fetched = await channel.messages.fetch({ limit: 200 }).catch(() => null);
        if (!fetched) continue;

        for (const post of posts) {
          const permalink = post.permalink || buildInstagramPostUrl(post.shortcode);
          const existing = fetched.find(m => (m.content && m.content.includes(permalink)) || (m.embeds && m.embeds.some(e => String(e.url || '').includes(permalink))));
          if (existing) {
            const arr = postedMap[post.id] || [];
            const already = arr.some(e => e.channelId === channel.id && e.messageId === existing.id);
            if (!already) {
              await markPostMessage(post.id, guildId, channel.id, existing.id, permalink);
              // refresh local postedMap
              const refreshedMap = await loadPostedMessages();
              postedMap[post.id] = refreshedMap[post.id] || [];
            }
          }
        }
      } catch (err) {
        console.error('Error escaneando canal para publicaciones antiguas:', err?.message || err);
      }
    }

    // Now update all mapped messages
    const ids = Object.keys(postedMap || {});
    for (const postId of ids) {
      const post = posts.find(p => p.id === postId);
      if (!post) continue;
      const entries = postedMap[postId] || [];
      for (const entry of entries) {
        try {
          const channel = await client.channels.fetch(entry.channelId).catch(() => null);
          if (!channel) continue;
          const message = await channel.messages.fetch(entry.messageId).catch(() => null);
          if (!message) continue;

          const newEmbed = createPostEmbed(post);
          const postUrl = post.permalink || buildInstagramPostUrl(post.shortcode);
          const components = createPostButtonRow(postUrl);

          const oldLikes = message.embeds?.[0]?.fields?.find(f => f.name === 'Likes')?.value || '';
          const oldComments = message.embeds?.[0]?.fields?.find(f => f.name === 'Comentarios')?.value || '';
          if (oldLikes === String(post.likes) && oldComments === String(post.comments)) continue;

          await message.edit({ content: postUrl, embeds: [newEmbed], components }).catch(err => {
            console.error('Error editando mensaje publicado:', err?.message || err);
          });
        } catch (err) {
          console.error('Error actualizando entrada publicada:', err?.message || err);
        }
      }
    }
  } catch (err) {
    console.error('Error en updatePublishedMessages:', err?.message || err);
  }
}

async function publishAllInstagramPosts(interaction) {
  if (!interaction.member.permissions.has('Administrator')) {
    return await interaction.reply({
      content: '❌ Solo administradores pueden usar este comando.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const posts = await fetchProfilePosts();
    if (!posts || posts.length === 0) {
      return await interaction.editReply({
        content: '📭 No se pudieron obtener publicaciones de Instagram.'
      });
    }

    const orderedPosts = [...posts].reverse();
    const channelId = getInstagramChannelIdForGuild(interaction.guildId);
    let publishedCount = 0;
    let skippedCount = 0;

    for (const post of orderedPosts) {
      if (await hasPostBeenSentToChannel(post.id, channelId)) {
        skippedCount += 1;
        continue;
      }

      await postToDiscord(post, { targetGuildId: interaction.guildId });
      publishedCount += 1;
    }

    if (posts[0]) {
      lastPublishedPostId = posts[0].id;
      await saveState();
    }

    await interaction.editReply({
      content: `✅ Instagram: publicadas ${publishedCount} publicaciones${skippedCount ? `, ${skippedCount} omitidas por duplicadas` : ''}.`
    });
  } catch (err) {
    console.error('Error en comando publicartodoig:', err?.message || err);
    await interaction.editReply({
      content: `❌ Error al publicar todas las publicaciones de Instagram: ${err?.message || 'Error desconocido.'}`
    });
  }
}

async function publishAllTikTokVideos(interaction) {
  if (!interaction.member.permissions.has('Administrator')) {
    return await interaction.reply({
      content: '❌ Solo administradores pueden usar este comando.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const videos = await tiktok.fetchTikTokVideos();
    if (!videos || videos.length === 0) {
      return await interaction.editReply({
        content: '📭 No se pudieron obtener videos de TikTok.'
      });
    }

    const orderedVideos = [...videos].reverse();
    const channelId = TIKTOK_CHANNEL_ID;
    let publishedCount = 0;

    for (const video of orderedVideos) {
      await tiktok.postTikTokToDiscord(client, channelId, video);
      publishedCount += 1;
    }

    if (videos[0]) {
      await tiktok.markTikTokAsPublished(videos[0].id);
    }

    await interaction.editReply({
      content: `✅ TikTok: publicados ${publishedCount} videos.`
    });
  } catch (err) {
    console.error('Error en comando publicartodotiktok:', err?.message || err);
    await interaction.editReply({
      content: `❌ Error al publicar todos los videos de TikTok: ${err?.message || 'Error desconocido.'}`
    });
  }
}

async function checkInstagram({ isInitialCheck = false } = {}) {
  if (isCheckingInstagram) {
    return;
  }

  isCheckingInstagram = true;

  try {
    const posts = await fetchProfilePosts();
    if (posts.length === 0) {
      console.warn('No se pudieron obtener publicaciones de Instagram en este intento.');
      return;
    }

    const latest = posts[0];

    if (!lastPublishedPostId) {
      if (isInitialCheck && POST_ON_STARTUP) {
        await postToDiscord(latest);
        console.log(`Publicacion inicial enviada: ${latest.id}`);
      }

      lastPublishedPostId = latest.id;
      await saveState();
      return;
    }

    if (latest.id !== lastPublishedPostId) {
      await postToDiscord(latest);
      lastPublishedPostId = latest.id;
      await saveState();
      console.log(`Nueva publicacion enviada: ${latest.id}`);
    }
  } finally {
    isCheckingInstagram = false;
  }
}

client.once('clientReady', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  
  // 1. Cargar configuraciones y estados
  await loadState();
  await loadConfig();
  await loadTikTokConfig();
  await registerCommands();
  await tiktok.loadTTState();

  console.log(`Canal IG: ${DISCORD_CHANNEL_ID}`);
  console.log(`Canal TikTok: ${TIKTOK_CHANNEL_ID}`);
  console.log(`Configuración: IG (cada ${CHECK_INTERVAL_MINUTES} min) | TT (cada 120 min)`);

  // 2. Verificación inicial inmediata (Instagram y TikTok)
  try {
    await checkInstagram({ isInitialCheck: true });
    await tiktok.checkTikTok(client, TIKTOK_CHANNEL_ID);
    // Actualizar embeds de publicaciones ya enviadas (likes/comentarios)
    await updatePublishedMessages();
  } catch (error) {
    console.error('Error en la verificación inicial:', error.message);
  }

  // 3. INTERVALO DE INSTAGRAM (Cada 1 minuto)
  const igIntervalMs = Math.max(1, CHECK_INTERVAL_MINUTES) * 60 * 1000;
  setInterval(async () => {
    try {
      await checkInstagram();
    } catch (error) {
      console.error('Error comprobando Instagram:', error.message);
    }
  }, igIntervalMs);

  // Intervalo para actualizar los likes/comentarios en los mensajes publicados
  setInterval(async () => {
    try {
      await updatePublishedMessages();
    } catch (err) {
      console.error('Error actualizando publicaciones publicadas:', err?.message || err);
    }
  }, igIntervalMs);

  // 4. INTERVALO DE TIKTOK (Cada 120 minutos)
  const ttIntervalMs = 120 * 60 * 1000; // 120 minutos en milisegundos
  setInterval(async () => {
    try {
      console.log(`[${new Date().toLocaleTimeString()}] Comprobando TikTok...`);
      await tiktok.checkTikTok(client, TIKTOK_CHANNEL_ID);
    } catch (error) {
      console.error('Error comprobando TikTok:', error.message);
    }
  }, ttIntervalMs);
});

// Manejador de interacciones (comandos slash, select menus, botones)
client.on('interactionCreate', async (interaction) => {
  try {
    // Comandos slash
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setchannel') {
        const channel = interaction.options.getChannel('canal');

        // Verificar permisos del usuario (solo administradores)
        if (!interaction.member.permissions.has('Administrator')) {
          return await interaction.reply({
            content: '❌ Solo administradores pueden usar este comando.',
            flags: MessageFlags.Ephemeral
          });
        }

        // Save per-guild channel
        CHANNELS_MAP[interaction.guildId] = channel.id;
        await saveConfig();

        await interaction.reply({
          content: `✅ Canal de publicación cambiado para este servidor a <#${channel.id}>`,
          flags: MessageFlags.Ephemeral
        });

        console.log(`Canal de publicación actualizado para guild ${interaction.guildId}: ${channel.id} (${channel.name})`);
      }

      if (interaction.commandName === 'settiktokchannel') {
        const channel = interaction.options.getChannel('canal');

        // Verificar permisos del usuario (solo administradores)
        if (!interaction.member.permissions.has('Administrator')) {
          return await interaction.reply({
            content: '❌ Solo administradores pueden usar este comando.',
            flags: MessageFlags.Ephemeral
          });
        }

        TIKTOK_CHANNEL_ID = channel.id;
        await saveTikTokConfig();

        await interaction.reply({
          content: `✅ Canal de TikTok cambiado a <#${channel.id}>`,
          flags: MessageFlags.Ephemeral
        });

        console.log(`Canal de TikTok actualizado a: ${channel.id} (${channel.name})`);
      }

      if (interaction.commandName === 'publicar') {
        // Verificar permisos del usuario (solo administradores)
        if (!interaction.member.permissions.has('Administrator')) {
          return await interaction.reply({
            content: '❌ Solo administradores pueden usar este comando.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const posts = await fetchProfilePosts();
          const unposted = getUnpostedPosts(posts);

          console.log(`Comando /publicar: ${posts.length} posts totales, ${unposted?.length || 0} sin publicar`);

          if (!unposted || unposted.length === 0) {
            return await interaction.editReply({
              content: '📭 No hay nuevas publicaciones sin publicar.'
            });
          }

          // Crear opciones del select menu (máximo 25)
          const selectOptions = unposted.slice(0, 25).map((post, index) => {
            // Truncar label a máximo 100 caracteres
            let captionPreview = post.caption.slice(0, 90);
            if (post.caption.length > 90) captionPreview += '...';
            const label = `${index + 1}. ${captionPreview}`.slice(0, 100);
            
            // Truncar description a máximo 100 caracteres
            const dateStr = new Date(post.takenAt * 1000).toLocaleDateString();
            const description = `${dateStr} • ${post.likes} likes`.slice(0, 100);
            
            return {
              label,
              value: post.id,
              description
            };
          });

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_post')
            .setPlaceholder('Elige una publicación para ver preview')
            .addOptions(selectOptions);

          const row = new ActionRowBuilder().addComponents(selectMenu);

          await interaction.editReply({
            content: `📸 Hay ${unposted.length} publicaciones sin publicar. Elige una:`,
            components: [row],
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          console.error('Error en comando publicar:', err?.message || err);
          console.error('Stack completo:', err?.stack);
          try {
            await interaction.editReply({
              content: `❌ Error: ${err?.message || 'Error desconocido al obtener publicaciones.'}`,
              flags: MessageFlags.Ephemeral
            });
          } catch {}
        }
      }

      if (interaction.commandName === 'publicartiktok') {
        // Verificar permisos del usuario (solo administradores)
        if (!interaction.member.permissions.has('Administrator')) {
          return await interaction.reply({
            content: '❌ Solo administradores pueden usar este comando.',
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const videos = await tiktok.fetchTikTokVideos();
          const unposted = tiktok.getUnpostedTikTokVideos(videos);

          console.log(`Comando /publicartiktok: ${videos.length} videos totales, ${unposted?.length || 0} sin publicar`);

          if (!unposted || unposted.length === 0) {
            return await interaction.editReply({
              content: '📭 No hay nuevos videos de TikTok sin publicar.'
            });
          }

          const selectOptions = unposted.slice(0, 25).map((video, index) => {
            const caption = String(video.caption || 'Sin descripcion');
            let captionPreview = caption.slice(0, 90);
            if (caption.length > 90) captionPreview += '...';
            const label = `${index + 1}. ${captionPreview}`.slice(0, 100);

            const dateValue = video.takenAt ? new Date(video.takenAt * 1000) : new Date();
            const description = `${dateValue.toLocaleDateString()} • TikTok`.slice(0, 100);

            return {
              label,
              value: video.id,
              description
            };
          });

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_tiktok_post')
            .setPlaceholder('Elige un video para ver preview')
            .addOptions(selectOptions);

          const row = new ActionRowBuilder().addComponents(selectMenu);

          await interaction.editReply({
            content: `🎵 Hay ${unposted.length} videos sin publicar. Elige uno:`,
            components: [row],
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          console.error('Error en comando publicartiktok:', err?.message || err);
          console.error('Stack completo:', err?.stack);
          try {
            if (err?.code === 'TIKTOK_API_UNAVAILABLE') {
              return await interaction.editReply({
                content: `⚠️ TikTok no está disponible: ${err.message}`,
                flags: MessageFlags.Ephemeral
              });
            }

            await interaction.editReply({
              content: `❌ Error: ${err?.message || 'Error desconocido al obtener videos de TikTok.'}`,
              flags: MessageFlags.Ephemeral
            });
          } catch {}
        }
      }

      if (interaction.commandName === 'publicartodoig') {
        await publishAllInstagramPosts(interaction);
      }

      if (interaction.commandName === 'publicartodotiktok') {
        await publishAllTikTokVideos(interaction);
      }

      if (interaction.commandName === 'resetstate') {
        // Verificar permisos del usuario (solo administradores)
        if (!interaction.member.permissions.has('Administrator')) {
          return await interaction.reply({
            content: '❌ Solo administradores pueden usar este comando.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          lastPublishedPostId = null;
          await saveState();

          await interaction.reply({
            content: '✅ Estado resetado. Ahora se mostrarán todas las publicaciones nuevamente.',
            flags: MessageFlags.Ephemeral
          });

          console.log(`Estado resetado - lastPublishedPostId: null`);
        } catch (err) {
          console.error('Error reseteando estado:', err?.message || err);
          await interaction.reply({
            content: '❌ Error al resetear el estado.',
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (interaction.commandName === 'status') {
        try {
          const configured = CHANNELS_MAP[interaction.guildId] || DISCORD_CHANNEL_ID;
          const channel = configured ? await client.channels.fetch(configured).catch(() => null) : null;
          const channelName = channel ? `<#${configured}>` : `Desconocido (${configured})`;
          const tiktokChannel = await client.channels.fetch(TIKTOK_CHANNEL_ID).catch(() => null);
          const tiktokChannelName = tiktokChannel ? `<#${TIKTOK_CHANNEL_ID}>` : `Desconocido (${TIKTOK_CHANNEL_ID})`;
          
          let statusText = '📊 **Estado del Bot**\n\n';
          statusText += `🤖 Bot: ${client.user.tag}\n`;
          statusText += `📸 Instagram: @${INSTAGRAM_USERNAME}\n`;
          statusText += `📤 Canal: ${channelName}\n`;
          statusText += `🎵 Canal TikTok: ${tiktokChannelName}\n`;
          statusText += `📝 Última publicación ID: ${lastPublishedPostId || 'Ninguna'}\n`;
          statusText += `⏱️ Intervalo: ${CHECK_INTERVAL_MINUTES} minuto(s)\n`;
          statusText += `🔄 Verificando: ${isCheckingInstagram ? 'Sí' : 'No'}`;

          await interaction.reply({
            content: statusText,
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          console.error('Error en comando status:', err?.message || err);
          await interaction.reply({
            content: '❌ Error al obtener estado.',
            flags: MessageFlags.Ephemeral
          });
        }
      }
    }

    // Select menu para elegir publicación
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_tiktok_post') {
        await interaction.deferUpdate();

        try {
          const videoId = interaction.values[0];
          const videos = await tiktok.fetchTikTokVideos();
          const video = videos.find((item) => item.id === videoId);

          if (!video) {
            return await interaction.editReply({
              content: '❌ No se encontró el video.',
              components: []
            });
          }

          const embed = tiktok.createTikTokEmbed(video);

          const publishButton = new ButtonBuilder()
            .setCustomId(`tiktok_publish_${video.id}`)
            .setLabel('✅ Publicar ahora')
            .setStyle(ButtonStyle.Success);

          const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_tiktok_publish')
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Danger);

          const buttonRow = new ActionRowBuilder().addComponents(publishButton, cancelButton);

          await interaction.editReply({
            content: `**Preview del video de TikTok:**`,
            embeds: [embed],
            components: [buttonRow]
          });
        } catch (err) {
          console.error('Error en select menu de TikTok:', err?.message || err);
          await interaction.editReply({
            content: err?.code === 'TIKTOK_API_UNAVAILABLE'
              ? `⚠️ TikTok no está disponible: ${err.message}`
              : '❌ Error procesando la selección de TikTok.'
          });
        }
      }

      if (interaction.customId === 'select_post') {
        await interaction.deferUpdate();

        try {
          const postId = interaction.values[0];
          const posts = await fetchProfilePosts();
          const post = posts.find(p => p.id === postId);

          if (!post) {
            return await interaction.editReply({
              content: '❌ No se encontró la publicación.',
              components: []
            });
          }

          // Crear embed con preview
          const embed = createPostEmbed(post);
          const postUrl = buildInstagramPostUrl(post.shortcode);

          // Botón para publicar
          const publishButton = new ButtonBuilder()
            .setCustomId(`publish_${post.id}`)
            .setLabel('✅ Publicar ahora')
            .setStyle(ButtonStyle.Success);

          const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_publish')
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Danger);

          const buttonRow = new ActionRowBuilder().addComponents(publishButton, cancelButton);

          await interaction.editReply({
            content: `**Preview de la publicación:**`,
            embeds: [embed],
            components: [buttonRow]
          });
        } catch (err) {
          console.error('Error en select menu:', err?.message || err);
          await interaction.editReply({
            content: '❌ Error procesando la selección.'
          });
        }
      }
    }

    // Botones (publicar o cancelar)
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('tiktok_publish_')) {
        const videoId = interaction.customId.replace('tiktok_publish_', '');
        await interaction.deferUpdate();

        try {
          const videos = await tiktok.fetchTikTokVideos();
          const video = videos.find((item) => item.id === videoId);

          if (!video) {
            return await interaction.editReply({
              content: '❌ No se encontró el video.',
              components: []
            });
          }

          await tiktok.postTikTokToDiscord(client, TIKTOK_CHANNEL_ID, video);
          await tiktok.markTikTokAsPublished(video.id);

          await interaction.editReply({
            content: `✅ Video enviado a <#${TIKTOK_CHANNEL_ID}> con éxito!`,
            components: []
          });

          console.log(`Video de TikTok enviado manualmente: ${video.id}`);
        } catch (err) {
          console.error('Error publicando TikTok:', err?.message || err);
          await interaction.editReply({
            content: err?.code === 'TIKTOK_API_UNAVAILABLE'
              ? `⚠️ TikTok no está disponible: ${err.message}`
              : '❌ Error al publicar el video de TikTok.',
            components: []
          });
        }
      }

      if (interaction.customId === 'cancel_tiktok_publish') {
        await interaction.editReply({
          content: '❌ Operación cancelada.',
          components: []
        });
      }

      if (interaction.customId.startsWith('publish_')) {
        const postId = interaction.customId.replace('publish_', '');
        await interaction.deferUpdate();

        try {
          const posts = await fetchProfilePosts();
          const post = posts.find(p => p.id === postId);

          if (!post) {
            return await interaction.editReply({
              content: '❌ No se encontró la publicación.',
              components: []
            });
          }

          // Publicar en el canal configurado para este servidor
          await postToDiscord(post, { targetGuildId: interaction.guildId });
          lastPublishedPostId = post.id;
          await saveState();

          const targetCh = CHANNELS_MAP[interaction.guildId] || DISCORD_CHANNEL_ID;
          await interaction.editReply({
            content: `✅ Publicación enviada a <#${targetCh}> con éxito!`,
            components: []
          });

          console.log(`Publicación manual enviada: ${post.id}`);
        } catch (err) {
          console.error('Error publicando:', err?.message || err);
          await interaction.editReply({
            content: '❌ Error al publicar.',
            components: []
          });
        }
      }

      if (interaction.customId === 'cancel_publish') {
        await interaction.editReply({
          content: '❌ Operación cancelada.',
          components: []
        });
      }
    }
  } catch (error) {
    console.error('Error procesando interacción:', error.message);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content: '❌ Hubo un error procesando tu solicitud.'
        });
      } else {
        await interaction.reply({
          content: '❌ Hubo un error procesando tu solicitud.',
          flags: MessageFlags.Ephemeral
        });
      }
    } catch {}
  }
});

// Comando de texto: !traerultimas
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.author?.bot) return;

    const text = String(message.content || '').trim().toLowerCase();
    if (text !== '!traerultimas') return;

    await message.channel.send('Obteniendo publicaciones de Instagram...');

    const posts = await fetchProfilePosts();
    const unposted = getUnpostedPosts(posts);

    if (!unposted || unposted.length === 0) {
      await message.channel.send('No hay nuevas publicaciones sin subir.');
      return;
    }

    // Enviar hasta 5 publicaciones pendientes para evitar spamear
    const toSend = unposted.slice(0, 5);
    for (const p of toSend) {
      const embed = createPostEmbed(p);
      const postUrl = p.permalink || buildInstagramPostUrl(p.shortcode);
      const components = createPostButtonRow(postUrl);
      await message.channel.send({ content: postUrl, embeds: [embed], components });
    }
  } catch (err) {
    console.error('Error en comando !traerultimas:', err?.message || err);
    try { await message.channel.send('Error al obtener publicaciones.'); } catch {};
  }
});

client.login(TOKEN);