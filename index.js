require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || 'gtaworld_es_oficial';
const INSTAGRAM_MEDIA_API_URL = process.env.INSTAGRAM_MEDIA_API_URL || '';
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1455996281272012932';
const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 1);
const POST_ON_STARTUP = String(process.env.POST_ON_STARTUP || 'false').toLowerCase() === 'true';
const STATE_FILE = path.resolve(process.env.STATE_FILE || '.ig-state.json');
const BUTTON_LABEL = 'IR A LA PUBLICACIÓN';

if (!TOKEN) {
  console.error('Falta la variable de entorno DISCORD_TOKEN.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
  const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.media?.data) ? data.media.data : [];

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items
    .map((item) => normalizeApiMediaItem(item))
    .filter((post) => post && post.id);
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
  const components = createPostButtonRow(postUrl);

  await channel.send({ content: postUrl, embeds: [embed], components });
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