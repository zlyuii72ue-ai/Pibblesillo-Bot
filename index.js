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

// 1. SERVIDOR WEB PARA MANTENERLO 24/7 EN RAILWAY
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

// MAPAS EN MEMORIA ANTI-SPAM
const userMessages = new Map();     
const userStickers = new Map();     
const userSpamWarns = new Map();    
const userSpamMutes = new Map();    

// 🎨 PALETA DE COLORES PASTEL
const PASTEL_COLORS = [
  { name: '🌸 Rosa Pastel', value: '#FFB7B2' },
  { name: '🌺 Menta Pastel', value: '#B5EAD7' },
  { name: '🫐 Azul Pastel', value: '#A0C4FF' },
  { name: '🍇 Lavanda / Morado Pastel', value: '#C7CEEA' },
  { name: '🍋 Amarillo Pastel', value: '#FFF5BA' },
  { name: '🍑 Melocotón / Naranja Pastel', value: '#FFDAC1' },
  { name: '🍏 Verde Pastel', value: '#C7F9CC' },
  { name: '🩵 Turquesa Pastel', value: '#9BF6FF' },
  { name: '🔮 Lila Pastel', value: '#E8AEB7' },
  { name: '🍬 Coral Pastel', value: '#FF9AA2' },
  { name: '🧁 Crema / Beige Pastel', value: '#FDFD96' },
  { name: '🧊 Celeste Pastel', value: '#BDE0FE' },
  { name: '🥐 Marrón Pastel', value: '#DDB8A2' },
  { name: '🩶 Gris Pastel', value: '#E5E5E5' }
];

// 5. CLIENTE DE DISCORD
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User] 
});

// 6. REGISTRO DE COMANDOS SLASH
const commands = [
  {
    name: 'help',
    description: 'Muestra los comandos disponibles de moderación',
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
        description: 'Selecciona un color pastel o escribe tu propio HEX (#FF0000)', 
        type: ApplicationCommandOptionType.String, 
        required: false,
        autocomplete: true 
      },
      { name: 'imagen', description: 'Adjunta una foto o archivo (PNG, JPG, GIF, WEBP)', type: ApplicationCommandOptionType.Attachment, required: false },
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

  // ACTUALIZAR FOTO DEL BOT SI SE CONFIGURÓ BOT_AVATAR_URL
  if (BOT_AVATAR_URL && BOT_AVATAR_URL.startsWith('http')) {
    try {
      await client.user.setAvatar(BOT_AVATAR_URL);
      console.log('[Avatar] Foto de perfil del bot actualizada correctamente.');
    } catch (err) {
      console.error('[Avatar] No se pudo cambiar el avatar:', err.message);
    }
  }

  try {
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    }
    console.log('Todos los comandos Slash actualizados correctamente.');
  } catch (error) {
    console.error('Error registrando comandos Slash:', error);
  }
});

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Guía de Comandos de Moderación')
    .setColor('#A0C4FF')
    .setDescription('Puedes usar estos comandos con el prefijo `pibble <comando>` o mediante `/comando`.')
    .addFields(
      { name: '🎨 `/embed <título> <descripción> [color] [imagen] [imagen_url] [canal]`', value: 'Crea un embed con colores pastel y soporte para cualquier imagen.' },
      { name: '🔇 `pibble mute <@user|reply> <tiempo> [razón]`', value: 'Silencia a un usuario. Ejemplos: `10m`, `2h`, `1d`.' },
      { name: '🔊 `pibble unmute <@user|reply> [razón]`', value: 'Quita el silencio a un usuario.' },
      { name: '👢 `pibble kick <@user|reply> [razón]`', value: 'Expulsa a un usuario del servidor.' },
      { name: '🔨 `pibble ban <@user|ID|reply> [razón]`', value: 'Banea a un usuario mediante mención o ID directa.' },
      { name: '🔓 `pibble unban <ID_Usuario> [razón]`', value: 'Desbanea a un usuario usando su ID.' },
      { name: '🧹 `pibble purge <cantidad>`', value: 'Elimina de 1 a 100 mensajes del canal actual.' },
      { name: '📜 `pibble hist <@user|ID>` (o `/hist`)', value: 'Muestra el historial de sanciones del usuario.' }
    )
    .setFooter({ text: 'Sistema de Moderación Pibble' })
    .setTimestamp();
}

// 7. AUTOMODERACIÓN Y COMANDOS DE TEXTO (pibble ...)
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator);

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

            if (recentStickers.length > 2) {
                violationType = 'Exceso / Spam de stickers';
            }
        }

        if (!violationType) {
            if (!userMessages.has(userId)) userMessages.set(userId, []);
            const userStamps = userMessages.get(userId);
            userStamps.push(now);

            const recentStamps = userStamps.filter(t => now - t < 2500);
            userMessages.set(userId, recentStamps);

            if (recentStamps.length > 3) {
                violationType = 'Flood de mensajes rápidos / Spam de envío';
            }
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
            await message.delete().catch(() => {});

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

                sendAndAutoDelete(message.channel, `${message.author} ha sido silenciado por **${durationText}** tras acumular 3 advertencias. | ID: \`${sanction.id}\``, 5000);
            }
            return;
        }
    }

    if (!message.content.toLowerCase().startsWith('pibble ')) return;

    const args = message.content.slice(7).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    const validCommands = ['help', 'mute', 'unmute', 'kick', 'ban', 'unban', 'purge', 'hist'];
    if (!validCommands.includes(command)) return; 

    if (!isMod) {
        return replyAndAutoDelete(message, "Este comando es de administrador JJAJAJA, deja de intentar usarlo.");
    }

    if (command === 'help') {
        return message.reply({ embeds: [buildHelpEmbed()] }).catch(() => {});
    }

    if (command === 'purge') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return replyAndAutoDelete(message, 'Indica una cantidad válida de mensajes entre 1 y 100. Ejemplo: `pibble purge 20`');
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
        sendAndAutoDelete(message.channel, `**${targetMember.user.tag}** ha sido silenciado por **${timeArg}**. | ID: \`${sanction.id}\``);
    }

    if (command === 'unmute') {
        if (!targetMember) return replyAndAutoDelete(message, 'Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.isCommunicationDisabled()) return replyAndAutoDelete(message, 'Este usuario no está silenciado.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.timeout(null, reason).catch(() => {});
        const sanction = addSanction(message.guild.id, targetMember.id, 'UNMUTE', message.author.tag, reason);
        sendAndAutoDelete(message.channel, `**${targetMember.user.tag}** ya no está silenciado. | ID: \`${sanction.id}\``);
    }

    if (command === 'ban') {
        if (!targetId) return replyAndAutoDelete(message, 'Menciona a un usuario o ingresa su ID.');

        const reasonIndex = 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        try {
            await message.guild.members.ban(targetId, { reason });
            const sanction = addSanction(message.guild.id, targetId, 'BAN', message.author.tag, reason);
            sendAndAutoDelete(message.channel, `El usuario (\`${targetId}\`) ha sido baneado. | ID: \`${sanction.id}\``);
        } catch (e) {
            replyAndAutoDelete(message, 'No se pudo banear al usuario. Verifica la ID o la jerarquía de roles.');
        }
    }

    if (command === 'unban') {
        if (!targetId) return replyAndAutoDelete(message, 'Indica el ID del usuario.');

        const reasonIndex = 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        try {
            await message.guild.members.unban(targetId, reason);
            const sanction = addSanction(message.guild.id, targetId, 'UNBAN', message.author.tag, reason);
            sendAndAutoDelete(message.channel, `Se ha desbaneado al usuario (\`${targetId}\`). | ID: \`${sanction.id}\``);
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
        sendAndAutoDelete(message.channel, `**${targetMember.user.tag}** ha sido expulsado. | ID: \`${sanction.id}\``);
    }
});

// 8. INTERACCIONES (COMANDO /EMBED CORREGIDO)
client.on('interactionCreate', async interaction => {

  // AUTOCOMPLETADO DE COLORES PASTEL
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'embed') {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      
      const filtered = PASTEL_COLORS.filter(choice => 
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

  if (!isMod) {
    return interaction.reply({ content: 'Este comando es de administrador JJAJAJA, deja de intentar usarlo.', ephemeral: true });
  }

  if (commandName === 'embed') {
    // 1. Diferimos la respuesta para evitar timeout de 3 segundos mientras procesa la imagen
    await interaction.deferReply({ ephemeral: true });

    const titulo = options.getString('titulo');
    const descripcion = options.getString('descripcion');
    let colorInput = options.getString('color') || '#A0C4FF'; // Azul pastel por defecto
    const imageAttachment = options.getAttachment('imagen');
    const imageUrl = options.getString('imagen_url');
    const targetChannel = options.getChannel('canal') || channel;

    // Validación formato HEX
    if (colorInput && !colorInput.startsWith('#') && /^[0-9A-F]{6}$/i.test(colorInput)) {
      colorInput = `#${colorInput}`;
    }

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descripcion)
      .setColor(colorInput)
      .setTimestamp();

    // Lógica para detectar cualquier imagen (PNG, JPG, WEBP, GIF)
    let finalImageUrl = null;

    if (imageAttachment && imageAttachment.url) {
      finalImageUrl = imageAttachment.url;
    } else if (imageUrl && imageUrl.startsWith('http')) {
      finalImageUrl = imageUrl;
    }

    if (finalImageUrl) {
      embed.setImage(finalImageUrl);
    }

    try {
      await targetChannel.send({ embeds: [embed] });
      await interaction.editReply({ content: `✅ Embed enviado exitosamente a ${targetChannel}.` });
    } catch (e) {
      console.error("Error enviando embed:", e);
      await interaction.editReply({ content: '❌ Error al enviar el embed. Verifica que el bot tenga permisos para enviar mensajes e imágenes en ese canal.' });
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
      await interaction.reply({ content: 'No se pudieron eliminar mensajes de más de 14 días.', ephemeral: true });
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

    await interaction.reply({ content: `**${targetUser.tag}** ha sido silenciado por **${timeArg}**. | ID: \`${sanction.id}\`` });
  }

  if (commandName === 'unmute') {
    const targetUser = options.getUser('usuario');
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!targetMember) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!targetMember.isCommunicationDisabled()) return interaction.reply({ content: 'Este usuario no está silenciado.', ephemeral: true });

    await targetMember.timeout(null, reason);
    const sanction = addSanction(guild.id, targetUser.id, 'UNMUTE', user.tag, reason);

    await interaction.reply({ content: `**${targetUser.tag}** ya no está silenciado. | ID: \`${sanction.id}\`` });
  }

  if (commandName === 'kick') {
    const targetUser = options.getUser('usuario');
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!targetMember) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!targetMember.kickable) return interaction.reply({ content: 'No puedo expulsar a este usuario.', ephemeral: true });

    await targetMember.kick(reason);
    const sanction = addSanction(guild.id, targetUser.id, 'KICK', user.tag, reason);

    await interaction.reply({ content: `**${targetUser.tag}** ha sido expulsado. | ID: \`${sanction.id}\`` });
  }

  if (commandName === 'ban') {
    const targetUser = options.getUser('usuario');
    const reason = options.getString('razon') || 'Razón no especificada';

    try {
      await guild.members.ban(targetUser.id, { reason });
      const sanction = addSanction(guild.id, targetUser.id, 'BAN', user.tag, reason);
      await interaction.reply({ content: `**${targetUser.tag || targetUser.id}** ha sido baneado. | ID Sanción: \`${sanction.id}\`` });
    } catch (e) {
      await interaction.reply({ content: 'No se pudo banear al usuario. Verifica la ID o la jerarquía de roles.', ephemeral: true });
    }
  }

  if (commandName === 'unban') {
    const targetId = options.getString('id');
    const reason = options.getString('razon') || 'Razón no especificada';

    try {
      await guild.members.unban(targetId, reason);
      const sanction = addSanction(guild.id, targetId, 'UNBAN', user.tag, reason);
      await interaction.reply({ content: `Se ha desbaneado al usuario (\`${targetId}\`). | ID: \`${sanction.id}\`` });
    } catch (e) {
      await interaction.reply({ content: 'No se pudo desbanear. Verifica el ID.', ephemeral: true });
    }
  }
});

// 9. LOGS DE MENSAJES Y AUDITORÍA
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const author = message.author;
    const member = message.member;

    const embed = new EmbedBuilder()
        .setTitle('Mensaje / Imagen Borrada')
        .setColor('#FF9AA2')
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

client.on('guildAuditLogEvent', async (auditLog, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const { action, target, reason, changes } = auditLog;
    const embed = new EmbedBuilder().setTimestamp();

    const targetUser = target ? await client.users.fetch(target.id).catch(() => null) : null;
    const avatarUrl = targetUser ? targetUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;

    if (avatarUrl) embed.setThumbnail(avatarUrl);

    if (action === AuditLogEvent.MemberKick) {
        embed.setTitle('Usuario Expulsado')
             .setColor('#FFDAC1')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanAdd) {
        embed.setTitle('Usuario Baneado')
             .setColor('#FF9AA2')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanRemove) {
        embed.setTitle('Usuario Desbaneado')
             .setColor('#B5EAD7')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberUpdate) {
        const timeoutChange = changes?.find(c => c.key === 'communication_disabled_until');
        if (timeoutChange) {
            if (timeoutChange.new) {
                const time = Math.floor(new Date(timeoutChange.new).getTime() / 1000);
                embed.setTitle('Usuario Silenciado')
                     .setColor('#FFF5BA')
                     .addFields(
                         { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                         { name: 'Tiempo', value: `Hasta <t:${time}:R>`, inline: false },
                         { name: 'Razón', value: reason || 'No especificada', inline: false }
                     );
            } else {
                embed.setTitle('Silencio Removido')
                     .setColor('#B5EAD7')
                     .addFields({ name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true });
            }
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// 10. INICIAR BOT
client.login(TOKEN);
