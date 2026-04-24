require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || 'gtaworld_es_oficial';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1455996281272012932';
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 10);
const POST_ON_STARTUP = String(process.env.POST_ON_STARTUP || 'false').toLowerCase() === 'true';
const STATE_FILE = path.resolve(process.env.STATE_FILE || '.ig-state.json');

if (!TOKEN) {
  console.error('Falta la variable de entorno DISCORD_TOKEN.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let lastPublishedPostId = null;

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

async function fetchProfilePosts(username) {
  const endpoints = [
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    `https://www.instagram.com/${encodeURIComponent(username)}/?__a=1&__d=dis`
  ];

  const headers = {
    'accept': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'x-ig-app-id': '936619743392459'
  };

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers });
      if (!response.ok) continue;
      const data = await response.json();

      const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges
        || data?.graphql?.user?.edge_owner_to_timeline_media?.edges;

      if (!Array.isArray(edges) || edges.length === 0) continue;

      const posts = edges
        .map((edge) => normalizePost(edge.node))
        .filter((post) => post && post.id && post.shortcode);

      if (posts.length > 0) {
        return posts.sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
      }
    } catch {
      continue;
    }
  }

  return [];
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

async function postToDiscord(post) {
  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
  if (!channel) {
    throw new Error(`No se encontro el canal ${DISCORD_CHANNEL_ID}.`);
  }

  const isTextChannel = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
  if (!isTextChannel) {
    throw new Error(`El canal ${DISCORD_CHANNEL_ID} no es de texto.`);
  }

  const postUrl = buildInstagramPostUrl(post.shortcode);
  const embed = createPostEmbed(post);

  await channel.send({ content: postUrl, embeds: [embed] });
}

async function checkInstagram({ isInitialCheck = false } = {}) {
  const posts = await fetchProfilePosts(INSTAGRAM_USERNAME);
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
}

client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  console.log(`Monitoreando Instagram: @${INSTAGRAM_USERNAME}`);
  console.log(`Canal destino: ${DISCORD_CHANNEL_ID}`);

  await loadState();

  try {
    await checkInstagram({ isInitialCheck: true });
  } catch (error) {
    console.error('Error en verificacion inicial:', error.message);
  }

  const intervalMs = Math.max(1, CHECK_INTERVAL_MINUTES) * 60 * 1000;
  setInterval(async () => {
    try {
      await checkInstagram();
    } catch (error) {
      console.error('Error comprobando Instagram:', error.message);
    }
  }, intervalMs);
});

client.login(TOKEN);