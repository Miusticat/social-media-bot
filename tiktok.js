const fs = require('fs/promises');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const STATE_FILE_TT = path.resolve('.tt-state.json');
let lastVideoId = null;
let lastTikTokSourceWarning = null;

function getTikTokUsername() {
  return process.env.TIKTOK_USERNAME || 'gtaworld_es_oficial';
}

function isTikTokSearchUrl(url) {
  return /\/user\/search\b/i.test(url) || /[?&]keywords=/i.test(url);
}

function getTikTokMediaApiUrl() {
  const configuredUrl = String(process.env.TIKTOK_MEDIA_API_URL || '').trim();
  const username = getTikTokUsername();

  if (configuredUrl) {
    try {
      const parsedUrl = new URL(configuredUrl);

      if (parsedUrl.searchParams.has('unique_id')) {
        parsedUrl.searchParams.set('unique_id', username);
        return parsedUrl.toString();
      }

      if (parsedUrl.searchParams.has('username')) {
        parsedUrl.searchParams.set('username', username);
        return parsedUrl.toString();
      }

      if (parsedUrl.searchParams.has('keywords') && isTikTokSearchUrl(configuredUrl)) {
        parsedUrl.searchParams.set('keywords', username);
        return parsedUrl.toString();
      }

      return configuredUrl;
    } catch {
      return configuredUrl;
    }
  }

  return `https://tiktok-scraper7.p.rapidapi.com/user/posts?unique_id=${encodeURIComponent(username)}&count=10&cursor=0`;
}

function getTikTokApiHeaders() {
  const headers = {
    accept: 'application/json'
  };

  if (process.env.TIKTOK_MEDIA_API_KEY) {
    headers['X-RapidAPI-Key'] = process.env.TIKTOK_MEDIA_API_KEY;
  } else if (process.env.RAPIDAPI_KEY) {
    headers['X-RapidAPI-Key'] = process.env.RAPIDAPI_KEY;
  }

  if (process.env.TIKTOK_RAPIDAPI_HOST) {
    headers['X-RapidAPI-Host'] = process.env.TIKTOK_RAPIDAPI_HOST;
  } else {
    headers['X-RapidAPI-Host'] = 'tiktok-scraper7.p.rapidapi.com';
  }

  return headers;
}

function buildTikTokPostUrl(video) {
  const username = getTikTokUsername();
  const videoId = video?.id || '';

  return video?.shareUrl || `https://www.tiktok.com/@${username}/video/${videoId}`;
}

function pickFirstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }

  return '';
}

function normalizeTikTokItem(item) {
  if (!item) return null;

  const videoId = String(item.video_id || item.aweme_id || item.awemeId || item.id || item.video?.id || '');
  if (!videoId) return null;

  const shareUrl = item.share_url || item.shareUrl || item.url || item.video?.share_url || '';
  const createTime = item.create_time || item.createTime || item.timestamp || item.create_time_ms || null;
  const caption = pickFirstText(
    item.desc,
    item.description,
    item.text,
    item.title,
    item.itemInfos?.desc,
    item.itemInfos?.text,
    item.itemInfo?.desc,
    item.itemInfo?.text,
    item.aweme_info?.desc,
    item.aweme_info?.desc_text,
    item.awemeInfo?.desc,
    item.awemeInfo?.desc_text,
    item.video?.desc,
    item.video?.title
  );

  return {
    id: videoId,
    caption,
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
  const url = getTikTokMediaApiUrl();
  const options = {
    method: 'GET',
    headers: getTikTokApiHeaders()
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const trimmedBody = body.slice(0, 180);

    if (response.status === 404 || /API doesn't exists/i.test(trimmedBody)) {
      const error = new Error(
        'La fuente de TikTok no existe o el endpoint configurado es incorrecto. Define TIKTOK_MEDIA_API_URL y TIKTOK_RAPIDAPI_HOST con un servicio válido.'
      );
      error.code = 'TIKTOK_API_UNAVAILABLE';
      error.details = trimmedBody;
      throw error;
    }

    throw new Error(`TikTok API respondio ${response.status}: ${trimmedBody}`);
  }

  const data = await response.json();
  const candidateArrays = [
    data?.results,
    data?.data,
    data?.items,
    data?.aweme_list,
    data?.data?.aweme_list,
    data?.data?.items,
    data?.data?.videos,
    data?.aweme_list?.items
  ];

  const items = candidateArrays.find((value) => Array.isArray(value)) || [];

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
    if (error?.code === 'TIKTOK_API_UNAVAILABLE') {
      if (lastTikTokSourceWarning !== error.message) {
        console.warn(`⚠️ TikTok deshabilitado temporalmente: ${error.message}`);
        lastTikTokSourceWarning = error.message;
      }
      return;
    }

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