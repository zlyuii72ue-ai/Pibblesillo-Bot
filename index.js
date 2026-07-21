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

// 2. CONFIGURACIÓN, CREDENCIALES Y CANAL DE LOGS
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

// ID DE TU CANAL DE LOGS
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1528201242407342100'; 

if (!TOKEN || !CLIENT_ID) {
    console.error("ERROR: Agrega DISCORD_TOKEN y CLIENT_ID en las variables.");
    process.exit(1);
}

// 3. ESCUDO ANTI-CRASH
process.on('unhandledRejection', reason => console.error('[Anti-Crash]:', reason));
process.on('uncaughtException', err => console.error('[Anti-Crash]:', err));

// 4. BASE DE DATOS LOCAL DE SANCIONES (sanctions.json)
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

// MAPAS EN MEMORIA
const userMessages = new Map();     // Rastrear velocidad de mensajes
const userSpamWarns = new Map();    // Contar advertencias (1/3, 2/3, 3/3)
const userSpamMutes = new Map();    // Contar mutes acumulados (1º, 2º, 3º+)

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

// 6. COMANDOS SLASH (/embed, /hist)
const commands = [
  {
    name: 'embed',
    description: 'Crea un mensaje embed personalizado',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      { name: 'titulo', description: 'Título del embed', type: ApplicationCommandOptionType.String, required: true },
      { name: 'descripcion', description: 'Texto principal del embed', type: ApplicationCommandOptionType.String, required: true },
      { name: 'color', description: 'Elige un color o escribe un Hex (#FF0000)', type: ApplicationCommandOptionType.String, autocomplete: true, required: false },
      { name: 'foto', description: 'Sube una imagen', type: ApplicationCommandOptionType.Attachment, required: false }
    ],
  },
  {
    name: 'hist',
    description: 'Muestra el historial de sanciones de un usuario',
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
    options: [
      { 
        name: 'usuario', 
        description: 'Usuario a consultar', 
        type: ApplicationCommandOptionType.User, 
        required: true 
      }
    ],
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('clientReady', async () => {
  console.log(`Bot conectado como: ${client.user.tag}`);
  console.log(`Canal de logs vinculado: ${LOG_CHANNEL_ID}`);
  try {
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    }
    console.log('Comandos /embed y /hist registrados.');
  } catch (error) {
    console.error('Error registrando comandos Slash:', error);
  }
});

// 7. AUTOMODERACIÓN Y COMANDOS DE MODERACIÓN
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator);

    // ==========================================
    // A) AUTOMODERACIÓN AVANZADA (Ignora Mods/Admins)
    // ==========================================
    if (!isMod) {
        let violationType = null;
        const content = message.content || '';

        // 1. DETECCIÓN DE ENLACES / LINKS NO AUTORIZADOS (Permite GIFs)
        const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;
        const linksFound = content.match(linkRegex);

        if (linksFound) {
            const gifDomains = ['tenor.com', 'giphy.com', 'imgur.com', 'media.discordapp.net', 'cdn.discordapp.com'];
            
            const hasUnauthorizedLink = linksFound.some(link => {
                const lowerLink = link.toLowerCase();
                const isGifFile = lowerLink.includes('.gif');
                const isGifDomain = gifDomains.some(domain => lowerLink.includes(domain));
                return !(isGifFile || isGifDomain);
            });

            if (hasUnauthorizedLink) {
                violationType = 'Envío de enlaces no autorizados';
            }
        }

        // 2. DETECCIÓN DE EXCESO DE TAGS / MENCIONES (> 4 menciones)
        const userMentions = message.mentions.users.size;
        const roleMentions = message.mentions.roles.size;
        if ((userMentions + roleMentions) > 4 || message.mentions.everyone) {
            violationType = violationType || 'Exceso de menciones / tags';
        }

        // 3. DETECCIÓN DE FLOOD EN UN SOLO MENSAJE (> 8 saltos de línea o > 700 chars)
        const lineBreaks = (content.match(/\n/g) || []).length;
        if (lineBreaks > 8 || content.length > 700) {
            violationType = violationType || 'Flood de texto / mensaje masivo';
        }

        // 4. DETECCIÓN DE REPETICIÓN EXCESIVA DE CARACTERES
        if (/(.)\1{9,}/i.test(content)) {
            violationType = violationType || 'Caracteres repetidos obsesivamente';
        }

        // 5. DETECCIÓN DE EMOJIS MASIVOS (> 5 emojis)
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|<a?:[a-zA-Z0-9_]+:[0-9]+>)/g;
        const emojiMatches = content.match(emojiRegex);
        if (emojiMatches && emojiMatches.length > 5) {
            violationType = violationType || 'Exceso de emojis';
        }

        // 6. DETECCIÓN DE FLOOD POR VELOCIDAD (> 4 mensajes en 3 segundos)
        const userId = message.author.id;
        const now = Date.now();
        if (!userMessages.has(userId)) userMessages.set(userId, []);
        const timestamps = userMessages.get(userId);
        timestamps.push(now);

        const recentTimestamps = timestamps.filter(t => now - t < 3000);
        userMessages.set(userId, recentTimestamps);

        if (recentTimestamps.length > 4) {
            violationType = violationType || 'Flood de mensajes rápidos';
        }

        // SI SE DETECTÓ CUALQUIER INFRACCIÓN:
        if (violationType) {
            await message.delete().catch(() => {});

            const currentWarns = (userSpamWarns.get(userId) || 0) + 1;
            userSpamWarns.set(userId, currentWarns);

            if (currentWarns < 3) {
                const warnMsg = await message.channel.send(
                    `${message.author}, evite el spam/flood/tags/links. (Advertencia ${currentWarns}/3)\nMotivo: ${violationType}`
                );
                setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
            } else {
                userSpamWarns.set(userId, 0);

                const mutesCount = (userSpamMutes.get(userId) || 0) + 1;
                userSpamMutes.set(userId, mutesCount);

                let durationMs = 3600000; // 1 Hora
                let durationText = '1h';

                if (mutesCount === 2) {
                    durationMs = 10800000; // 3 Horas
                    durationText = '3h';
                } else if (mutesCount >= 3) {
                    durationMs = 36000000; // 10 Horas
                    durationText = '10h';
                }

                const reason = `Automoderación Reincidente (Mute #${mutesCount}) - ${violationType}`;
                await message.member.timeout(durationMs, reason).catch(() => {});

                const sanction = addSanction(message.guild.id, userId, 'MUTE', client.user.tag, reason, durationText);

                message.channel.send(
                    `${message.author} ha sido silenciado por **${durationText}** tras acumular 3 advertencias de automoderación. | ID: \`${sanction.id}\``
                );
            }
            return;
        }
    }

    // ==========================================
    // B) COMANDOS DE MODERACIÓN (pibble)
    // ==========================================
    if (!message.content.toLowerCase().startsWith('pibble ')) return;
    if (!isMod) return message.reply('No tienes permisos de moderación.').catch(() => {});

    const args = message.content.slice(7).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Obtener usuario (por Mención o respondiendo mensaje)
    let targetMember = message.mentions.members.first();
    let isReply = false;

    if (!targetMember && message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage) {
                targetMember = await message.guild.members.fetch(repliedMessage.author.id).catch(() => null);
                isReply = true;
            }
        } catch (e) {
            console.error("Error al obtener mensaje respondido:", e);
        }
    }

    // BAN
    if (command === 'ban') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje. Ej: `pibble ban [razón]`');
        if (!targetMember.bannable) return message.reply('No se puede banear a este usuario.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.ban({ reason }).catch(() => {});

        const sanction = addSanction(message.guild.id, targetMember.id, 'BAN', message.author.tag, reason);
        message.channel.send(`**${targetMember.user.tag}** ha sido baneado por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }

    // UNBAN
    if (command === 'unban') {
        let targetId = targetMember ? targetMember.id : args[0]?.replace(/[<@!>]/g, '');

        if (!targetId && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage) targetId = repliedMessage.author.id;
            } catch (e) {}
        }

        if (!targetId) return message.reply('Indica el ID del usuario, menciónalo o responde a su mensaje. Ej: `pibble unban 123456789012345678 [razón]`');

        const reasonIndex = (isReply || targetMember) ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        try {
            await message.guild.members.unban(targetId, reason);
            const sanction = addSanction(message.guild.id, targetId, 'UNBAN', message.author.tag, reason);
            message.channel.send(`Se ha desbaneado al usuario (\`${targetId}\`) por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
        } catch (error) {
            message.reply('No se pudo desbanear al usuario. Verifica que el ID sea correcto o que el usuario esté baneado.').catch(() => {});
        }
    }

    // KICK
    if (command === 'kick') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje. Ej: `pibble kick [razón]`');
        if (!targetMember.kickable) return message.reply('No se puede expulsar a este usuario.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.kick(reason).catch(() => {});

        const sanction = addSanction(message.guild.id, targetMember.id, 'KICK', message.author.tag, reason);
        message.channel.send(`**${targetMember.user.tag}** ha sido expulsado por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }

    // MUTE
    if (command === 'mute') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje. Ej: `pibble mute <tiempo> [razón]`');
        if (!targetMember.moderatable) return message.reply('No se puede silenciar a este usuario.');

        const timeArg = isReply ? args[0] : args[1];
        const reason = isReply ? args.slice(1).join(' ') || 'Razón no especificada' : args.slice(2).join(' ') || 'Razón no especificada';

        if (!timeArg) return message.reply('Especifica el tiempo. Ej: `pibble mute 10m` o `pibble mute @usuario 10m`');

        const timeMultipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const unit = timeArg.slice(-1).toLowerCase();
        const num = parseInt(timeArg.slice(0, -1));

        if (isNaN(num) || !timeMultipliers[unit]) return message.reply('Formato de tiempo inválido. Usa `10m`, `2h`, `10d`, etc.');

        const durationMs = num * timeMultipliers[unit];
        if (durationMs > 2419200000) return message.reply('El tiempo máximo es 28 días.');

        await targetMember.timeout(durationMs, reason).catch(() => {});

        const sanction = addSanction(message.guild.id, targetMember.id, 'MUTE', message.author.tag, reason, timeArg);
        message.channel.send(`**${targetMember.user.tag}** ha sido silenciado por **${timeArg}** por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }

    // UNMUTE
    if (command === 'unmute') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje.');

        if (!targetMember.isCommunicationDisabled()) {
            return message.reply('Este usuario no está silenciado.');
        }

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.timeout(null, reason).catch(() => {});

        const sanction = addSanction(message.guild.id, targetMember.id, 'UNMUTE', message.author.tag, reason);
        message.channel.send(`**${targetMember.user.tag}** ya no está silenciado por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }
});

// 8. INTERACCIONES SLASH (/embed, /hist)
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const opcionesColor = [
        { name: 'Rojo', value: '#FF0000' },
        { name: 'Azul', value: '#0000FF' },
        { name: 'Verde', value: '#00FF00' },
        { name: 'Amarillo', value: '#FFFF00' },
        { name: 'Naranja', value: '#FFA500' },
        { name: 'Morado', value: '#800080' },
        { name: 'Blanco', value: '#FFFFFF' },
        { name: 'Negro', value: '#000000' }
    ];
    const filtrado = opcionesColor.filter(opcion => 
        opcion.name.toLowerCase().includes(focusedValue.toLowerCase()) || 
        opcion.value.toLowerCase().includes(focusedValue.toLowerCase())
    );
    await interaction.respond(filtrado).catch(() => {});
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'embed') {
    const titulo = interaction.options.getString('titulo');
    const descripcion = interaction.options.getString('descripcion');
    const color = interaction.options.getString('color') || '#2B2D31'; 
    const foto = interaction.options.getAttachment('foto');

    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descripcion);
    try { embed.setColor(color); } catch (e) { embed.setColor('#2B2D31'); }
    if (foto) embed.setImage(foto.url);

    await interaction.reply({ embeds: [embed] }).catch(() => {});
  }

  if (interaction.commandName === 'hist') {
    const user = interaction.options.getUser('usuario');
    const data = getSanctions();
    const userSanctions = data[interaction.guildId]?.[user.id] || [];

    if (userSanctions.length === 0) {
      return interaction.reply({ 
        content: `El usuario **${user.tag}** no tiene ninguna sanción o registro.`, 
        ephemeral: true 
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Historial de Sanciones: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
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

    await interaction.reply({ embeds: [embed] });
  }
});

// 9. EVENTOS DE LOGS DE MENSAJES/IMÁGENES BORRADAS
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const author = message.author;
    const member = message.member;

    const embed = new EmbedBuilder()
        .setTitle('Mensaje / Imagen Borrada')
        .setColor('#FF5555')
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

    // Si el mensaje borrado tenía archivos/fotos adjuntas
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        
        // Re-subimos la imagen física al canal de logs como archivo
        const file = new AttachmentBuilder(attachment.url, { name: attachment.name });
        filesToSend.push(file);

        // Vista previa de la imagen en el embed
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            embed.setImage(`attachment://${attachment.name}`);
        }
    }

    logChannel.send({ embeds: [embed], files: filesToSend }).catch(err => console.error("Error al enviar log de borrado:", err));
});

client.on('guildAuditLogEntryCreate', async (auditLog, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const { action, executor, target, reason, changes } = auditLog;
    const embed = new EmbedBuilder().setTimestamp();

    const targetUser = target ? await client.users.fetch(target.id).catch(() => null) : null;
    const avatarUrl = targetUser ? targetUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;

    if (avatarUrl) embed.setThumbnail(avatarUrl);

    if (action === AuditLogEvent.MemberKick) {
        embed.setTitle('Usuario Expulsado')
             .setColor('#FFA500')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Nombre', value: targetUser ? `${targetUser.username}` : 'Desconocido', inline: true },
                 { name: 'ID', value: targetUser ? `\`${targetUser.id}\`` : 'Desconocido', inline: true },
                 { name: 'Moderador', value: executor ? `${executor.tag}` : 'Desconocido', inline: false },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanAdd) {
        embed.setTitle('Usuario Baneado')
             .setColor('#FF0000')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Nombre', value: targetUser ? `${targetUser.username}` : 'Desconocido', inline: true },
                 { name: 'ID', value: targetUser ? `\`${targetUser.id}\`` : 'Desconocido', inline: true },
                 { name: 'Moderador', value: executor ? `${executor.tag}` : 'Desconocido', inline: false },
                 { name: 'Razón', value: reason || 'No especificada', inline: false }
             );
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanRemove) {
        embed.setTitle('Usuario Desbaneado')
             .setColor('#00FF00')
             .addFields(
                 { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                 { name: 'Nombre', value: targetUser ? `${targetUser.username}` : 'Desconocido', inline: true },
                 { name: 'ID', value: targetUser ? `\`${targetUser.id}\`` : 'Desconocido', inline: true },
                 { name: 'Moderador', value: executor ? `${executor.tag}` : 'Desconocido', inline: false },
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
                     .setColor('#FFFF00')
                     .addFields(
                         { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                         { name: 'Nombre', value: targetUser ? `${targetUser.username}` : 'Desconocido', inline: true },
                         { name: 'ID', value: targetUser ? `\`${targetUser.id}\`` : 'Desconocido', inline: true },
                         { name: 'Tiempo', value: `Hasta <t:${time}:R>`, inline: false },
                         { name: 'Moderador', value: executor ? `${executor.tag}` : 'Desconocido', inline: false },
                         { name: 'Razón', value: reason || 'No especificada', inline: false }
                     );
            } else {
                embed.setTitle('Silencio Removido')
                     .setColor('#00FF00')
                     .addFields(
                         { name: 'Usuario', value: targetUser ? `${targetUser.tag}` : 'Desconocido', inline: true },
                         { name: 'Nombre', value: targetUser ? `${targetUser.username}` : 'Desconocido', inline: true },
                         { name: 'ID', value: targetUser ? `\`${targetUser.id}\`` : 'Desconocido', inline: true },
                         { name: 'Moderador', value: executor ? `${executor.tag}` : 'Desconocido', inline: false }
                     );
            }
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// 10. INICIAR BOT
client.login(TOKEN);
