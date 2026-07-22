require('dotenv').config();
const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  REST, 
  Routes, 
  ApplicationCommandOptionType, 
  PermissionFlagsBits,
  AuditLogEvent,
  Partials,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');

// 1. SERVIDOR WEB PARA RAILWAY 24/7
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Servidor activo 24/7');
}).listen(PORT, () => console.log(`[HTTP] Servidor listo en el puerto ${PORT}`));

// 2. CONFIGURACIÓN Y CREDENCIALES
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1528201242407342100'; 
const BOT_AVATAR_URL = process.env.BOT_AVATAR_URL || ''; 

if (!TOKEN || !CLIENT_ID) {
    console.error("ERROR: Agrega DISCORD_TOKEN y CLIENT_ID en las variables.");
    process.exit(1);
}

// 3. ESCUDO ANTI-CRASH
process.on('unhandledRejection', reason => console.error('[Anti-Crash]:', reason));
process.on('uncaughtException', err => console.error('[Anti-Crash]:', err));

// 4. BASE DE DATOS LOCAL DE SANCIONES
const sanctionsFile = './sanctions.json';

function getSanctions() {
    try {
        if (fs.existsSync(sanctionsFile)) {
            return JSON.parse(fs.readFileSync(sanctionsFile, 'utf8'));
        }
    } catch (e) {
        console.error("Error al leer sanciones:", e);
    }
    return {};
}

function addSanction(guildId, userId, type, moderator, reason, duration = null) {
    const data = getSanctions();
    if (!data[guildId]) data[guildId] = {};
    if (!data[guildId][userId]) data[guildId][userId] = [];

    const newSanction = {
        id: `SAN-${Math.floor(1000 + Math.random() * 9000)}`,
        type, 
        moderator,
        reason,
        duration,
        timestamp: Math.floor(Date.now() / 1000)
    };

    data[guildId][userId].push(newSanction);

    try {
        fs.writeFileSync(sanctionsFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error al guardar la sanción:", e);
    }
    return newSanction;
}

// 4.5. BASE DE DATOS LOCAL DE BESOS
const kissesFile = './kisses.json';

function getKissesData() {
    try {
        if (fs.existsSync(kissesFile)) {
            return JSON.parse(fs.readFileSync(kissesFile, 'utf8'));
        }
    } catch (e) {
        console.error("Error al leer archivo de besos:", e);
    }
    return {};
}

function addKiss(user1Id, user2Id) {
    const data = getKissesData();
    const pairKey = [user1Id, user2Id].sort().join('_');

    data[pairKey] = (data[pairKey] || 0) + 1;

    try {
        fs.writeFileSync(kissesFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error al guardar el beso:", e);
    }
    return data[pairKey];
}

// LISTA DE GIFS DE BESOS
const KISS_GIFS = [
  'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExcG45ZThieG96NzJ3bm9iZ3lkdTU2bWRwZWMyZmppNzVrc3ByaDg5aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/MQVpBqASxSlFu/giphy.gif',
  'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExaWVxZWxveHQxdnlnY3RtaXpuNGZueGZ0NXRzZGMyeTdkpDMxYWt4MCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zkppEMFvRX5FC/giphy.gif',
  'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWFlM3V6OWl2MDE0Z3pueGVoanRyaWQ1dWd2NXFraXlyMTN2dXdjdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Mo122cd9G2xmKymanO/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3c2JieWk3eG0wOTRlYm1rcHIxNm1nbnNyZTBtOHZucnI4ZDNvaDc3OCZlcD12MV_naWZzX3NlYXJjaCZjdD1n/KH1CTZtw1iP3W/giphy.gif'
];

// FUNCIONES AUXILIARES
function parseDuration(timeStr) {
    if (!timeStr) return null;
    const timeMultipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const unit = timeStr.slice(-1).toLowerCase();
    const num = parseInt(timeStr.slice(0, -1));
    if (isNaN(num) || !timeMultipliers[unit]) return null;
    return num * timeMultipliers[unit];
}

async function replyAndAutoDelete(message, content, delay = 2000) {
    try {
        const sentMsg = await message.reply(content);
        setTimeout(() => sentMsg.delete().catch(() => {}), delay);
    } catch (e) {
        console.error("Error al enviar/borrar mensaje:", e);
    }
}

async function sendAndAutoDelete(channel, content, delay = 2000) {
    try {
        const sentMsg = await channel.send(content);
        setTimeout(() => sentMsg.delete().catch(() => {}), delay);
    } catch (e) {
        console.error("Error al enviar/borrar mensaje:", e);
    }
}

// ENVIAR LOGS DE SANCIÓN
async function sendSanctionLog(guild, type, targetUser, moderatorTag, reason, duration = null) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle(`📌 Registro de Sanción: ${type}`)
        .setColor(type === 'BAN' ? '#FF0000' : type === 'KICK' ? '#E67E22' : '#FFFF00')
        .addFields(
            { name: 'Usuario Afectado', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
            { name: 'Moderador', value: moderatorTag, inline: true },
            { name: 'Razón', value: reason || 'No especificada', inline: false }
        )
        .setTimestamp();

    if (duration) embed.addFields({ name: 'Duración', value: duration, inline: true });
    if (targetUser.displayAvatarURL) embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }));

    logChannel.send({ embeds: [embed] }).catch(err => console.error("Error enviando log de sanción:", err));
}

// LOG DE MENSAJE BORRADO POR AUTOMOD
async function sendAutoModDeleteLog(message, reason) {
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const author = message.author;
    const member = message.member;

    const embed = new EmbedBuilder()
        .setTitle('🚨 Mensaje Eliminado por Auto-Mod')
        .setColor('#FF0000')
        .setThumbnail(author.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Usuario', value: `${author.tag} (<@${author.id}>)`, inline: true },
            { name: 'Nombre', value: `${member ? member.displayName : author.username}`, inline: true },
            { name: 'ID', value: `\`${author.id}\``, inline: true },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: false },
            { name: 'Motivo', value: `**${reason}**`, inline: false },
            { name: 'Contenido Eliminado', value: message.content || '*(Sin contenido de texto / Sticker)*' }
        )
        .setTimestamp();

    const filesToSend = [];

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        const file = new AttachmentBuilder(attachment.url, { name: attachment.name });
        filesToSend.push(file);

        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            embed.setImage(`attachment://${attachment.name}`);
        }
    }

    logChannel.send({ embeds: [embed], files: filesToSend }).catch(err => console.error("Error al enviar log de borrado de automod:", err));
}

// MAPAS ANTI-SPAM
const userMessages = new Map();     
const userStickers = new Map();     
const userSpamWarns = new Map();    
const userSpamMutes = new Map();    

// LISTA DE COLORES
const ALL_COLORS = [
  { name: '🔴 Rojo', value: '#FF0000' },
  { name: '🔵 Azul', value: '#0099FF' },
  { name: '🟢 Verde', value: '#00FF00' },
  { name: '🟡 Amarillo', value: '#FFFF00' },
  { name: '🟣 Morado', value: '#9B59B6' },
  { name: '🟠 Naranja', value: '#E67E22' },
  { name: '⚫ Negro', value: '#000001' },
  { name: '⚪ Blanco', value: '#FFFFFF' },
  { name: '🟤 Marrón', value: '#795548' },
  { name: '🩵 Cyan / Turquesa', value: '#00FFFF' },
  { name: '🩷 Rosa Fuerte', value: '#FF1493' },
  { name: '🌸 Rosa Pastel', value: '#FFB7B2' },
  { name: '🌺 Menta Pastel', value: '#B5EAD7' },
  { name: '🫐 Azul Pastel', value: '#A0C4FF' },
  { name: '🍇 Lavanda Pastel', value: '#C7CEEA' },
  { name: '🍋 Amarillo Pastel', value: '#FFF5BA' },
  { name: '🍑 Melocotón Pastel', value: '#FFDAC1' },
  { name: '🍏 Verde Pastel', value: '#C7F9CC' },
  { name: '🧊 Celeste Pastel', value: '#BDE0FE' },
  { name: '🩶 Gris Pastel', value: '#E5E5E5' }
];

// 5. CLIENTE DE DISCORD
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User] 
});

// 6. COMANDOS SLASH
const commands = [
  {
    name: 'help',
    description: 'Muestra los comandos disponibles de moderación y diversión',
  },
  {
    name: 'banana',
    description: 'Mide la banana de un usuario',
    options: [
      { name: 'usuario', description: 'Usuario a medir (opcional)', type: ApplicationCommandOptionType.User, required: false }
    ]
  },
  {
    name: 'kiss',
    description: 'Dale un beso a un usuario y guarda el historial',
    options: [
      { name: 'usuario', description: 'Usuario a quien besar', type: ApplicationCommandOptionType.User, required: true }
    ]
  },
  {
    name: 'embed',
    description: 'Crea y envía un mensaje embed personalizado',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      { name: 'titulo', description: 'Título del embed', type: ApplicationCommandOptionType.String, required: true },
      { name: 'descripcion', description: 'Texto principal del embed', type: ApplicationCommandOptionType.String, required: true },
      { 
        name: 'color', 
        description: 'Selecciona un color normal/pastel o escribe tu código HEX (#FF0000)', 
        type: ApplicationCommandOptionType.String, 
        required: false,
        autocomplete: true 
      },
      { name: 'imagen', description: 'Adjunta una foto o archivo desde tu dispositivo', type: ApplicationCommandOptionType.Attachment, required: false },
      { name: 'imagen_url', description: 'O pega el enlace/URL directo de una imagen', type: ApplicationCommandOptionType.String, required: false },
      { name: 'canal', description: 'Canal donde se enviará (opcional)', type: ApplicationCommandOptionType.Channel, required: false }
    ]
  },
  {
    name: 'hist',
    description: 'Muestra el historial de sanciones de un usuario',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      { name: 'usuario', description: 'Usuario o ID a consultar', type: ApplicationCommandOptionType.User, required: true }
    ],
  },
  {
    name: 'mute',
    description: 'Silencia a un usuario por un tiempo determinado',
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers),
    options: [
      { name: 'usuario', description: 'Usuario a silenciar', type: ApplicationCommandOptionType.User, required: true },
      { name: 'tiempo', description: 'Ejemplo: 10m, 2h, 1d', type: ApplicationCommandOptionType.String, required: true },
      { name: 'razon', description: 'Razón del aislamiento', type: ApplicationCommandOptionType.String, required: false }
    ]
  },
  {
    name: 'unmute',
    description: 'Quita el silencio a un usuario',
    default_member_permissions: String(PermissionFlagsBits.ModerateMembers),
    options: [
      { name: 'usuario', description: 'Usuario a desmutear', type: ApplicationCommandOptionType.User, required: true },
      { name: 'razon', description: 'Razón de desmuteo', type: ApplicationCommandOptionType.String, required: false }
    ]
  },
  {
    name: 'kick',
    description: 'Expulsa a un usuario del servidor',
    default_member_permissions: String(PermissionFlagsBits.KickMembers),
    options: [
      { name: 'usuario', description: 'Usuario a expulsar', type: ApplicationCommandOptionType.User, required: true },
      { name: 'razon', description: 'Razón de expulsión', type: ApplicationCommandOptionType.String, required: false }
    ]
  },
  {
    name: 'ban',
    description: 'Banea a un usuario por Mención o por ID',
    default_member_permissions: String(PermissionFlagsBits.BanMembers),
    options: [
      { name: 'usuario', description: 'Selecciona el usuario o pega su ID', type: ApplicationCommandOptionType.User, required: true },
      { name: 'razon', description: 'Razón del ban', type: ApplicationCommandOptionType.String, required: false }
    ]
  },
  {
    name: 'unban',
    description: 'Desbanea a un usuario usando su ID',
    default_member_permissions: String(PermissionFlagsBits.BanMembers),
    options: [
      { name: 'id', description: 'ID del usuario a desbanear', type: ApplicationCommandOptionType.String, required: true },
      { name: 'razon', description: 'Razón del desban', type: ApplicationCommandOptionType.String, required: false }
    ]
  },
  {
    name: 'purge',
    description: 'Elimina cierta cantidad de mensajes del canal',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      { name: 'cantidad', description: 'Cantidad de mensajes a eliminar (1-100)', type: ApplicationCommandOptionType.Integer, required: true }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('clientReady', async () => {
  console.log(`Bot conectado como: ${client.user.tag}`);

  if (BOT_AVATAR_URL && BOT_AVATAR_URL.startsWith('http')) {
    try {
      await client.user.setAvatar(BOT_AVATAR_URL);
    } catch (err) {
      console.error('[Avatar] Error al cambiar avatar:', err.message);
    }
  }

  try {
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    }
    console.log('Comandos Slash actualizados.');
  } catch (error) {
    console.error('Error registrando comandos Slash:', error);
  }
});

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Guía de Comandos del Bot')
    .setColor('#0099FF')
    .setDescription('Puedes usar estos comandos con el prefijo `pibble <comando>` o mediante `/comando`.')
    .addFields(
      { name: '💋 `pibble kiss @usuario` (o `/kiss`)', value: 'Dale un beso a alguien. ¡Lleva la cuenta de besos en total!' },
      { name: '🍌 `pibble banana [@usuario]` (o `/banana`)', value: 'Mide la banana del usuario mencionado o la tuya.' },
      { name: '🎨 `/embed <título> <descripción> [color] [imagen] [imagen_url] [canal]`', value: 'Crea un embed con colores normales/pastel y fotos.' },
      { name: '🔇 `pibble mute <@user|reply> <tiempo> [razón]`', value: 'Silencia a un usuario. Ejemplos: `10m`, `2h`, `1d`.' },
      { name: '🔊 `pibble unmute <@user|reply> [razón]`', value: 'Quita el silencio a un usuario.' },
      { name: '👢 `pibble kick <@user|reply> [razón]`', value: 'Expulsa a un usuario del servidor.' },
      { name: '🔨 `pibble ban <@user|ID|reply> [razón]`', value: 'Banea a un usuario mediante mención o ID directa.' },
      { name: '🔓 `pibble unban <ID_Usuario> [razón]`', value: 'Desbanea a un usuario usando su ID.' },
      { name: '🧹 `pibble purge <cantidad>`', value: 'Elimina de 1 a 100 mensajes del canal actual.' },
      { name: '📜 `pibble hist <@user|ID>` (o `/hist`)', value: 'Muestra el historial de sanciones del usuario.' }
    )
    .setFooter({ text: 'Sistema Pibble' })
    .setTimestamp();
}

// 7. EVENTO MESSAGE (AUTOMOD Y COMANDOS DE TEXTO)
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator);

    // AUTOMOD
    if (!isMod) {
        let violationType = null;
        const content = message.content || '';
        const userId = message.author.id;
        const now = Date.now();

        if (message.stickers.size > 0) {
            if (!userStickers.has(userId)) userStickers.set(userId, []);
            const stickerStamps = userStickers.get(userId);
            stickerStamps.push(now);

            const recentStickers = stickerStamps.filter(t => now - t < 5000);
            userStickers.set(userId, recentStickers);

            if (recentStickers.length > 2) violationType = 'Exceso / Spam de stickers';
        }

        if (!violationType) {
            if (!userMessages.has(userId)) userMessages.set(userId, []);
            const userStamps = userMessages.get(userId);
            userStamps.push(now);

            const recentStamps = userStamps.filter(t => now - t < 2500);
            userMessages.set(userId, recentStamps);

            if (recentStamps.length > 3) violationType = 'Flood de mensajes rápidos / Spam de envío';
        }

        if (!violationType) {
            const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;
            const linksFound = content.match(linkRegex);
            if (linksFound) {
                const allowedDomains = ['tenor.com', 'giphy.com', 'imgur.com', 'media.discordapp.net', 'cdn.discordapp.com'];
                const hasUnauthorizedLink = linksFound.some(link => {
                    const lowerLink = link.toLowerCase();
                    return !(lowerLink.includes('.gif') || allowedDomains.some(domain => lowerLink.includes(domain)));
                });
                if (hasUnauthorizedLink) violationType = 'Envío de enlaces no autorizados';
            }
        }

        if (!violationType && ((message.mentions.users.size + message.mentions.roles.size) > 4 || message.mentions.everyone)) {
            violationType = 'Exceso de menciones / tags';
        }

        if (!violationType) {
            if ((content.match(/\n/g) || []).length > 8 || content.length > 700) {
                violationType = 'Flood de texto / mensaje masivo';
            } else if (/(.)\1{9,}/i.test(content)) {
                violationType = 'Caracteres repetidos obsesivamente';
            }
        }

        if (violationType) {
            // Borra el mensaje y envía registro de log
            await message.delete().catch(() => {});
            sendAutoModDeleteLog(message, violationType);

            const currentWarns = (userSpamWarns.get(userId) || 0) + 1;
            userSpamWarns.set(userId, currentWarns);

            if (currentWarns < 3) {
                sendAndAutoDelete(message.channel, `${message.author}, por favor evita el spam. (Advertencia ${currentWarns}/3)\nMotivo: **${violationType}**`, 5000);
            } else {
                userSpamWarns.set(userId, 0);
                const mutesCount = (userSpamMutes.get(userId) || 0) + 1;
                userSpamMutes.set(userId, mutesCount);

                let durationMs = mutesCount === 1 ? 3600000 : mutesCount === 2 ? 10800000 : 36000000;
                let durationText = mutesCount === 1 ? '1h' : mutesCount === 2 ? '3h' : '10h';

                const reason = `Automoderación Reincidente (Mute #${mutesCount}) - ${violationType}`;
                await message.member.timeout(durationMs, reason).catch(() => {});
                const sanction = addSanction(message.guild.id, userId, 'MUTE', client.user.tag, reason, durationText);

                sendSanctionLog(message.guild, 'MUTE', message.author, client.user.tag, reason, durationText);
                sendAndAutoDelete(message.channel, `${message.author} ha sido silenciado por **${durationText}** tras acumular 3 advertencias. | ID: \`${sanction.id}\``, 5000);
            }
            return;
        }
    }

    if (!message.content.toLowerCase().startsWith('pibble ')) return;

    const args = message.content.slice(7).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    const validCommands = ['help', 'mute', 'unmute', 'kick', 'ban', 'unban', 'purge', 'hist', 'banana', 'kiss'];
    if (!validCommands.includes(command)) return; 

    // COMANDOS PÚBLICOS
    if (command === 'help') {
        return message.reply({ embeds: [buildHelpEmbed()] }).catch(() => {});
    }

    if (command === 'banana') {
        const targetUser = message.mentions.users.first() || message.author;
        const tamano = Math.floor(Math.random() * 32) + 1;

        const embedBanana = new EmbedBuilder()
            .setTitle('🍌 ¡El Bananómetro!')
            .setDescription(`La banana de ${targetUser} mide **${tamano} cm** 🍌`)
            .setColor('#FFE135')
            .setImage('https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600')
            .setFooter({ text: 'Medición 100% científica' })
            .setTimestamp();

        return message.reply({ embeds: [embedBanana] });
    }

    if (command === 'kiss') {
        const mentions = Array.from(message.mentions.users.values());
        let authorUser = message.author;
        let targetUser = null;

        if (mentions.length >= 2) {
            authorUser = mentions[0];
            targetUser = mentions[1];
        } else if (mentions.length === 1) {
            targetUser = mentions[0];
        }

        if (!targetUser) {
            return message.reply('Menciona a la persona que quieres besar. Ejemplo: `pibble kiss @usuario`');
        }

        if (authorUser.id === targetUser.id) {
            return message.reply('No te puedes besar a ti mismo, busca a alguien más jajaja');
        }

        const totalKisses = addKiss(authorUser.id, targetUser.id);
        const randomGif = KISS_GIFS[Math.floor(Math.random() * KISS_GIFS.length)];

        const embedKiss = new EmbedBuilder()
            .setDescription(`${authorUser} le dio un beso a ${targetUser}, llevan **${totalKisses}** besos acumulados!`)
            .setColor('#FF1493')
            .setImage(randomGif);

        return message.reply({ embeds: [embedKiss] });
    }

    // COMANDOS DE MODERACIÓN
    if (!isMod) {
        return replyAndAutoDelete(message, "Este comando es de administrador JJAJAJA, deja de intentar usarlo.");
    }

    if (command === 'purge') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return replyAndAutoDelete(message, 'Indica una cantidad válida entre 1 y 100. Ejemplo: `pibble purge 20`');
        }

        await message.delete().catch(() => {});

        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            sendAndAutoDelete(message.channel, `Se eliminaron **${deleted.size}** mensajes.`);
        } catch (error) {
            sendAndAutoDelete(message.channel, 'No se pudieron eliminar mensajes antiguos.');
        }
        return;
    }

    let targetMember = message.mentions.members.first();
    let targetId = args[0]?.replace(/[<@!>]/g, '');
    let isReply = false;

    if (!targetMember && message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage) {
                targetMember = await message.guild.members.fetch(repliedMessage.author.id).catch(() => null);
                targetId = repliedMessage.author.id;
                isReply = true;
            }
        } catch (e) {}
    } else if (targetMember) {
        targetId = targetMember.id;
    }

    if (command === 'hist') {
        if (!targetId) return replyAndAutoDelete(message, 'Menciona a un usuario, responde a su mensaje o indica su ID.');
        const data = getSanctions();
        const userSanctions = data[message.guild.id]?.[targetId] || [];

        if (userSanctions.length === 0) {
            return replyAndAutoDelete(message, `El usuario con ID/Mención \`${targetId}\` no tiene sanciones.`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`Historial de Sanciones: ${targetId}`)
            .setColor('#FFA500')
            .setFooter({ text: `Total de registros: ${userSanctions.length}` })
            .setTimestamp();

        userSanctions.forEach((s) => {
            const durationText = s.duration ? ` | Duración: ${s.duration}` : '';
            embed.addFields({
                name: `[${s.type}] - ID: ${s.id}`,
                value: `Razón: ${s.reason}\nModerador: ${s.moderator}${durationText}\nFecha: <t:${s.timestamp}:R>`
            });
        });

        return replyAndAutoDelete(message, { embeds: [embed] });
    }

    if (command === 'mute') {
        if (!targetMember) return replyAndAutoDelete(message, 'Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.moderatable) return replyAndAutoDelete(message, 'No se puede silenciar a este usuario.');

        let timeArg = isReply ? args[0] : args[1];
        let reason = isReply ? args.slice(1).join(' ') : args.slice(2).join(' ');

        const durationMs = parseDuration(timeArg);
        if (!durationMs) return replyAndAutoDelete(message, 'Formato de tiempo inválido. Usa `10m`, `2h`, `1d`.');
        
        reason = reason || 'Razón no especificada';
        await targetMember.timeout(durationMs, reason).catch(() => {});

        const sanction = addSanction(message.guild.id, targetMember.id, 'MUTE', message.author.tag, reason, timeArg);
        
        await message.channel.send(`🔇 **${targetMember.user.tag}** ha sido silenciado por **${timeArg}**. | Razón: ${reason} | ID: \`${sanction.id}\``);
        sendSanctionLog(message.guild, 'MUTE', targetMember.user, message.author.tag, reason, timeArg);
    }

    if (command === 'unmute') {
        if (!targetMember) return replyAndAutoDelete(message, 'Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.isCommunicationDisabled()) return replyAndAutoDelete(message, 'Este usuario no está silenciado.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.timeout(null, reason).catch(() => {});
        const sanction = addSanction(message.guild.id, targetMember.id, 'UNMUTE', message.author.tag, reason);

        await message.channel.send(`🔊 **${targetMember.user.tag}** ya no está silenciado. | ID: \`${sanction.id}\``);
        sendSanctionLog(message.guild, 'UNMUTE', targetMember.user, message.author.tag, reason);
    }

    if (command === 'ban') {
        if (!targetId) return replyAndAutoDelete(message, 'Menciona a un usuario o ingresa su ID.');

        const reasonIndex = 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        try {
            const targetUser = await client.users.fetch(targetId);
            await message.guild.members.ban(targetId, { reason });
            const sanction = addSanction(message.guild.id, targetId, 'BAN', message.author.tag, reason);

            await message.channel.send(`🔨 El usuario **${targetUser.tag}** (\`${targetId}\`) ha sido baneado. | Razón: ${reason} | ID: \`${sanction.id}\``);
            sendSanctionLog(message.guild, 'BAN', targetUser, message.author.tag, reason);
        } catch (e) {
            replyAndAutoDelete(message, 'No se pudo banear al usuario. Verifica el ID o los permisos.');
        }
    }

    if (command === 'unban') {
        if (!targetId) return replyAndAutoDelete(message, 'Indica el ID del usuario.');

        const reasonIndex = 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        try {
            const targetUser = await client.users.fetch(targetId);
            await message.guild.members.unban(targetId, reason);
            const sanction = addSanction(message.guild.id, targetId, 'UNBAN', message.author.tag, reason);

            await message.channel.send(`🔓 Se ha desbaneado al usuario **${targetUser.tag}** (\`${targetId}\`). | ID: \`${sanction.id}\``);
            sendSanctionLog(message.guild, 'UNBAN', targetUser, message.author.tag, reason);
        } catch (e) {
            replyAndAutoDelete(message, 'No se pudo desbanear al usuario. Verifica el ID.');
        }
    }

    if (command === 'kick') {
        if (!targetMember) return replyAndAutoDelete(message, 'Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.kickable) return replyAndAutoDelete(message, 'No se puede expulsar a este usuario.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.kick(reason).catch(() => {});
        const sanction = addSanction(message.guild.id, targetMember.id, 'KICK', message.author.tag, reason);

        await message.channel.send(`👢 **${targetMember.user.tag}** ha sido expulsado. | Razón: ${reason} | ID: \`${sanction.id}\``);
        sendSanctionLog(message.guild, 'KICK', targetMember.user, message.author.tag, reason);
    }
});

// 8. INTERACCIONES SLASH
client.on('interactionCreate', async interaction => {

  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'embed') {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      
      const filtered = ALL_COLORS.filter(choice => 
        choice.name.toLowerCase().includes(focusedValue) || choice.value.toLowerCase().includes(focusedValue)
      );

      if (focusedValue.startsWith('#') && focusedValue.length >= 4) {
        return interaction.respond([{ name: `Usar código HEX personalizado: ${focusedValue}`, value: focusedValue }]);
      }

      return interaction.respond(filtered.slice(0, 25));
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user, channel, member } = interaction;
  const isMod = member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.Administrator);

  if (commandName === 'help') {
    return interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
  }

  if (commandName === 'banana') {
    const targetUser = options.getUser('usuario') || user;
    const tamano = Math.floor(Math.random() * 32) + 1;

    const embedBanana = new EmbedBuilder()
        .setTitle('🍌 ¡El Bananómetro!')
        .setDescription(`La banana de ${targetUser} mide **${tamano} cm** 🍌`)
        .setColor('#FFE135')
        .setImage('https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600')
        .setFooter({ text: 'Medición 100% científica' })
        .setTimestamp();

    return interaction.reply({ embeds: [embedBanana] });
  }

  if (commandName === 'kiss') {
    const targetUser = options.getUser('usuario');

    if (user.id === targetUser.id) {
      return interaction.reply({ content: 'No te puedes besar a ti mismo, busca a alguien más jajaja', ephemeral: true });
    }

    const totalKisses = addKiss(user.id, targetUser.id);
    const randomGif = KISS_GIFS[Math.floor(Math.random() * KISS_GIFS.length)];

    const embedKiss = new EmbedBuilder()
        .setDescription(`${user} le dio un beso a ${targetUser}, llevan **${totalKisses}** besos acumulados!`)
        .setColor('#FF1493')
        .setImage(randomGif);

    return interaction.reply({ embeds: [embedKiss] });
  }

  if (!isMod) {
    return interaction.reply({ content: 'Este comando es de administrador JJAJAJA, deja de intentar usarlo.', ephemeral: true });
  }

  if (commandName === 'embed') {
    await interaction.deferReply({ ephemeral: true });

    const titulo = options.getString('titulo');
    const descripcion = options.getString('descripcion');
    let colorInput = options.getString('color') || '#0099FF';
    const imageAttachment = options.getAttachment('imagen');
    const imageUrl = options.getString('imagen_url');
    const targetChannel = options.getChannel('canal') || channel;

    if (colorInput && !colorInput.startsWith('#') && /^[0-9A-F]{6}$/i.test(colorInput)) {
      colorInput = `#${colorInput}`;
    }

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descripcion)
      .setColor(colorInput)
      .setTimestamp();

    if (imageAttachment) {
      embed.setImage(imageAttachment.url);
    } else if (imageUrl && imageUrl.startsWith('http')) {
      embed.setImage(imageUrl);
    }

    try {
      await targetChannel.send({ embeds: [embed] });
      await interaction.editReply({ content: `✅ Embed enviado exitosamente a ${targetChannel}.` });
    } catch (e) {
      console.error("Error enviando embed:", e);
      await interaction.editReply({ content: '❌ Error al enviar el embed. Revisa los permisos del bot en ese canal.' });
    }
    return;
  }

  if (commandName === 'purge') {
    const amount = options.getInteger('cantidad');
    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: 'Ingresa un número de 1 a 100.', ephemeral: true });
    }

    try {
      const deleted = await channel.bulkDelete(amount, true);
      await interaction.reply({ content: `Se eliminaron **${deleted.size}** mensajes.`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: 'No se pudieron eliminar mensajes antiguos.', ephemeral: true });
    }
  }

  if (commandName === 'hist') {
    const targetUser = options.getUser('usuario');
    const data = getSanctions();
    const userSanctions = data[guild.id]?.[targetUser.id] || [];

    if (userSanctions.length === 0) {
      return interaction.reply({ content: `El usuario **${targetUser.tag}** no tiene sanciones.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Historial de Sanciones: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
      .setColor('#FFA500')
      .setFooter({ text: `Total de registros: ${userSanctions.length}` })
      .setTimestamp();

    userSanctions.forEach((s) => {
      embed.addFields({
        name: `[${s.type}] - ID: ${s.id}`,
        value: `Razón: ${s.reason}\nModerador: ${s.moderator}\nFecha: <t:${s.timestamp}:R>`
      });
    });

    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'mute') {
    const targetUser = options.getUser('usuario');
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    const timeArg = options.getString('tiempo');
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!targetMember) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!targetMember.moderatable) return interaction.reply({ content: 'No puedo silenciar a este usuario.', ephemeral: true });

    const durationMs = parseDuration(timeArg);
    if (!durationMs) return interaction.reply({ content: 'Formato de tiempo inválido. Usa `10m`, `2h`, `1d`.', ephemeral: true });

    await targetMember.timeout(durationMs, reason);
    const sanction = addSanction(guild.id, targetUser.id, 'MUTE', user.tag, reason, timeArg);

    await channel.send(`🔇 **${targetUser.tag}** ha sido silenciado por **${timeArg}**. | Razón: ${reason} | ID: \`${sanction.id}\``);
    sendSanctionLog(guild, 'MUTE', targetUser, user.tag, reason, timeArg);
    await interaction.reply({ content: 'Sanción aplicada.', ephemeral: true });
  }

  if (commandName === 'unmute') {
    const targetUser = options.getUser('usuario');
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!targetMember) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!targetMember.isCommunicationDisabled()) return interaction.reply({ content: 'Este usuario no está silenciado.', ephemeral: true });

    await targetMember.timeout(null, reason);
    const sanction = addSanction(guild.id, targetUser.id, 'UNMUTE', user.tag, reason);

    await channel.send(`🔊 **${targetUser.tag}** ya no está silenciado. | ID: \`${sanction.id}\``);
    sendSanctionLog(guild, 'UNMUTE', targetUser, user.tag, reason);
    await interaction.reply({ content: 'Silencio removido.', ephemeral: true });
  }

  if (commandName === 'kick') {
    const targetUser = options.getUser('usuario');
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!targetMember) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!targetMember.kickable) return interaction.reply({ content: 'No puedo expulsar a este usuario.', ephemeral: true });

    await targetMember.kick(reason);
    const sanction = addSanction(guild.id, targetUser.id, 'KICK', user.tag, reason);

    await channel.send(`👢 **${targetUser.tag}** ha sido expulsado. | Razón: ${reason} | ID: \`${sanction.id}\``);
    sendSanctionLog(guild, 'KICK', targetMember.user, user.tag, reason);
    await interaction.reply({ content: 'Usuario expulsado.', ephemeral: true });
  }

  if (commandName === 'ban') {
    const targetUser = options.getUser('usuario');
    const reason = options.getString('razon') || 'Razón no especificada';

    try {
      await guild.members.ban(targetUser.id, { reason });
      const sanction = addSanction(guild.id, targetUser.id, 'BAN', user.tag, reason);
      
      await channel.send(`🔨 **${targetUser.tag || targetUser.id}** ha sido baneado. | Razón: ${reason} | ID: \`${sanction.id}\``);
      sendSanctionLog(guild, 'BAN', targetUser, user.tag, reason);
      await interaction.reply({ content: 'Usuario baneado.', ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: 'No se pudo banear al usuario. Verifica permisos o jerarquía.', ephemeral: true });
    }
  }

  if (commandName === 'unban') {
    const targetId = options.getString('id');
    const reason = options.getString('razon') || 'Razón no especificada';

    try {
      const targetUser = await client.users.fetch(targetId);
      await guild.members.unban(targetId, reason);
      const sanction = addSanction(guild.id, targetId, 'UNBAN', user.tag, reason);

      await channel.send(`🔓 Se ha desbaneado al usuario **${targetUser.tag}** (\`${targetId}\`). | ID: \`${sanction.id}\``);
      sendSanctionLog(guild, 'UNBAN', targetUser, user.tag, reason);
      await interaction.reply({ content: 'Usuario desbaneado.', ephemeral: true });
    } catch (e) {
      await interaction.reply({ content: 'No se pudo desbanear. Verifica el ID.', ephemeral: true });
    }
  }
});

// 9. AUDITORÍA DE EVENTOS EN CANALES Y USUARIOS

// A) LOG DE MENSAJES BORRADOS POR USUARIOS
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const author = message.author;
    const member = message.member;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Mensaje / Imagen Borrada')
        .setColor('#FF0000')
        .setThumbnail(author.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Usuario', value: `${author.tag}`, inline: true },
            { name: 'Nombre', value: `${member ? member.displayName : author.username}`, inline: true },
            { name: 'ID', value: `\`${author.id}\``, inline: true },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: false },
            { name: 'Contenido', value: message.content || '*(Sin contenido de texto)*' }
        )
        .setTimestamp();

    const filesToSend = [];

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        const file = new AttachmentBuilder(attachment.url, { name: attachment.name });
        filesToSend.push(file);

        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            embed.setImage(`attachment://${attachment.name}`);
        }
    }

    logChannel.send({ embeds: [embed], files: filesToSend }).catch(err => console.error("Error al enviar log de borrado:", err));
});

// B) LOG DE CAMBIOS DE ROLES Y RANGOS EN INTEGRANTES
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const logChannel = newMember.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Actualización de Roles')
        .setColor('#3498DB')
        .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Usuario', value: `${newMember.user.tag} (<@${newMember.id}>)`, inline: true },
            { name: 'ID de Usuario', value: `\`${newMember.id}\``, inline: true }
        )
        .setTimestamp();

    if (addedRoles.size > 0) {
        embed.addFields({ name: '➕ Rol(es) Añadido(s)', value: addedRoles.map(r => `<@&${r.id}>`).join(', '), inline: false });
    }

    if (removedRoles.size > 0) {
        embed.addFields({ name: '➖ Rol(es) Quitado(s)', value: removedRoles.map(r => `<@&${r.id}>`).join(', '), inline: false });
    }

    logChannel.send({ embeds: [embed] }).catch(err => console.error("Error enviando log de roles:", err));
});

// C) LOG DE CONEXIONES Y SALIDAS DE CALL / CANALES DE VOZ
client.on('voiceStateUpdate', (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const embed = new EmbedBuilder()
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp();

    // Entró a una call
    if (!oldState.channelId && newState.channelId) {
        embed.setTitle('🔊 Entrada a Canal de Voz')
             .setColor('#2ECC71')
             .addFields(
                 { name: 'Usuario', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                 { name: 'Canal', value: `<#${newState.channelId}>`, inline: true }
             );
        return logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // Salió de una call
    if (oldState.channelId && !newState.channelId) {
        embed.setTitle('🔇 Salida de Canal de Voz')
             .setColor('#E74C3C')
             .addFields(
                 { name: 'Usuario', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                 { name: 'Canal', value: `<#${oldState.channelId}>`, inline: true }
             );
        return logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // Se cambió de call
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        embed.setTitle('🔄 Cambio de Canal de Voz')
             .setColor('#F1C40F')
             .addFields(
                 { name: 'Usuario', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                 { name: 'De', value: `<#${oldState.channelId}>`, inline: true },
                 { name: 'A', value: `<#${newState.channelId}>`, inline: true }
             );
        return logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// D) AUDITORÍA DE BAN/KICK DE REGISTRO
client.on('guildAuditLogEvent', async (auditLog, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const { action, target, reason } = auditLog;
    const embed = new EmbedBuilder().setTimestamp();

    const targetUser = target ? await client.users.fetch(target.id).catch(() => null) : null;
    const avatarUrl = targetUser ? targetUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;

    if (avatarUrl) embed.setThumbnail(avatarUrl);

    if (action === AuditLogEvent.MemberKick) {
        embed.setTitle('Usuario Expulsado')
             .setColor('#E67E22')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanAdd) {
        embed.setTitle('Usuario Baneado')
             .setColor('#FF0000')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanRemove) {
        embed.setTitle('Usuario Desbaneado')
             .setColor('#00FF00')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
});

// 10. INICIAR BOT
client.login(TOKEN);
