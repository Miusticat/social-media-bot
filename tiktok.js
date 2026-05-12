const fs = require('fs/promises');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const STATE_FILE_TT = path.resolve('.tt-state.json');
let lastVideoId = null;

function getTikTokUsername() {
  return process.env.TIKTOK_USERNAME || 'gtaworld_es_oficial';
}

function buildTikTokPostUrl(video) {
  const username = getTikTokUsername();
  const videoId = video?.id || '';

  return video?.shareUrl || `https://www.tiktok.com/@${username}/video/${videoId}`;
}

function normalizeTikTokItem(item) {
  if (!item) return null;

  const videoId = String(item.video_id || item.aweme_id || item.id || '');
  if (!videoId) return null;

  const shareUrl = item.share_url || item.shareUrl || item.url || '';
  const createTime = item.create_time || item.createTime || item.timestamp || null;

  return {
    id: videoId,
    caption: item.desc || item.description || item.text || '',
    takenAt: createTime ? Number(createTime) : null,
    imageUrl: item.cover_url || item.cover || item.video?.cover || item.video?.dynamic_cover || '',
    shareUrl: shareUrl || buildTikTokPostUrl({ id: videoId }),
    raw: item
  };
}

function getUnpostedTikTokVideos(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return [];
  if (!lastVideoId) return videos;

  return videos.filter((video) => video && video.id && video.id !== lastVideoId);
}

function createTikTokEmbed(video) {
  const username = getTikTokUsername();
  const videoUrl = buildTikTokPostUrl(video);
  const caption = video?.caption
    ? video.caption.length > 300
      ? `${video.caption.slice(0, 297)}...`
      : video.caption
    : 'Sin descripcion';

  const publishedAt = video?.takenAt ? new Date(video.takenAt * 1000) : new Date();

  const embed = new EmbedBuilder()
    .setColor(0xff0050)
    .setAuthor({
      name: `Nuevo video de @${username} en TikTok`,
      url: `https://www.tiktok.com/@${username}`
    })
    .setTitle('Ver video en TikTok')
    .setURL(videoUrl)
    .setDescription(caption)
    .setFooter({ text: `TikTok: @${username}` })
    .setTimestamp(publishedAt);

  if (video?.imageUrl) {
    embed.setImage(video.imageUrl);
  }

  return embed;
}

function createTikTokButtonRow(videoUrl) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('VER EN TIKTOK')
        .setStyle(ButtonStyle.Link)
        .setURL(videoUrl)
    )
  ];
}

async function fetchTikTokVideos() {
  const username = getTikTokUsername();

  if (!process.env.RAPIDAPI_KEY) {
    throw new Error('Falta RAPIDAPI_KEY en el entorno.');
  }

  const url = `https://tiktok-scraper-api.p.rapidapi.com/user/posts?username=${encodeURIComponent(username)}`;
  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'tiktok-scraper-api.p.rapidapi.com'
    }
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`TikTok API respondio ${response.status}: ${body.slice(0, 180)}`);
  }

  const data = await response.json();
  const items = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.aweme_list)
          ? data.aweme_list
          : [];

  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items
    .map((item) => normalizeTikTokItem(item))
    .filter((video) => video && video.id);
}

async function postTikTokToDiscord(client, channelId, video) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    throw new Error(`No se encontro el canal ${channelId}.`);
  }

  const isTextChannel = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
  if (!isTextChannel) {
    throw new Error(`El canal ${channelId} no es de texto.`);
  }

  const videoUrl = buildTikTokPostUrl(video);
  const embed = createTikTokEmbed(video);
  const components = createTikTokButtonRow(videoUrl);

  await channel.send({ content: videoUrl, embeds: [embed], components });
}

async function markTikTokAsPublished(videoId) {
  lastVideoId = String(videoId || '');
  await saveTTState();
}

// Cargar el estado para no repetir posts
async function loadTTState() {
  try {
    const raw = await fs.readFile(STATE_FILE_TT, 'utf-8');
    const parsed = JSON.parse(raw);
    lastVideoId = parsed.lastVideoId || null;
  } catch {
    lastVideoId = null;
  }
}

async function saveTTState() {
  await fs.writeFile(STATE_FILE_TT, JSON.stringify({ lastVideoId }, null, 2));
}

async function checkTikTok(client, channelId) {
  try {
    const videos = await fetchTikTokVideos();
    if (videos.length === 0) return;

    const latest = videos[0];
    if (latest.id !== lastVideoId) {
      await postTikTokToDiscord(client, channelId, latest);
      await markTikTokAsPublished(latest.id);
      console.log(`✅ TikTok Scraper: Nuevo video publicado ${latest.id}`);
    }
  } catch (error) {
    console.error('❌ Error en el Scraper de TikTok:', error.message);
  }
}

module.exports = {
  buildTikTokPostUrl,
  checkTikTok,
  createTikTokEmbed,
  fetchTikTokVideos,
  getUnpostedTikTokVideos,
  loadTTState,
  markTikTokAsPublished,
  postTikTokToDiscord
};