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

// FUNCION AUXILIAR PARA PARSEAR TIEMPOS (10m, 2h, 1d)
function parseDuration(timeStr) {
    if (!timeStr) return null;
    const timeMultipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const unit = timeStr.slice(-1).toLowerCase();
    const num = parseInt(timeStr.slice(0, -1));
    if (isNaN(num) || !timeMultipliers[unit]) return null;
    return num * timeMultipliers[unit];
}

// MAPAS EN MEMORIA
const userMessages = new Map();     
const userSpamWarns = new Map();    
const userSpamMutes = new Map();    

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
      { name: 'usuario', description: 'Usuario a consultar', type: ApplicationCommandOptionType.User, required: true }
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
    description: 'Banea a un usuario del servidor',
    default_member_permissions: String(PermissionFlagsBits.BanMembers),
    options: [
      { name: 'usuario', description: 'Usuario a banear', type: ApplicationCommandOptionType.User, required: true },
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
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('clientReady', async () => {
  console.log(`Bot conectado como: ${client.user.tag}`);
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

// 7. AUTOMODERACIÓN Y COMANDOS DE TEXTO (pibble ...)
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator);

    // A) AUTOMODERACIÓN
    if (!isMod) {
        let violationType = null;
        const content = message.content || '';

        const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/gi;
        const linksFound = content.match(linkRegex);

        if (linksFound) {
            const gifDomains = ['tenor.com', 'giphy.com', 'imgur.com', 'media.discordapp.net', 'cdn.discordapp.com'];
            const hasUnauthorizedLink = linksFound.some(link => {
                const lowerLink = link.toLowerCase();
                return !(lowerLink.includes('.gif') || gifDomains.some(domain => lowerLink.includes(domain)));
            });
            if (hasUnauthorizedLink) violationType = 'Envío de enlaces no autorizados';
        }

        if ((message.mentions.users.size + message.mentions.roles.size) > 4 || message.mentions.everyone) {
            violationType = violationType || 'Exceso de menciones / tags';
        }

        if ((content.match(/\n/g) || []).length > 8 || content.length > 700) {
            violationType = violationType || 'Flood de texto / mensaje masivo';
        }

        if (/(.)\1{9,}/i.test(content)) violationType = violationType || 'Caracteres repetidos obsesivamente';

        const userId = message.author.id;
        const now = Date.now();
        if (!userMessages.has(userId)) userMessages.set(userId, []);
        const timestamps = userMessages.get(userId);
        timestamps.push(now);
        const recentTimestamps = timestamps.filter(t => now - t < 3000);
        userMessages.set(userId, recentTimestamps);

        if (recentTimestamps.length > 4) violationType = violationType || 'Flood de mensajes rápidos';

        if (violationType) {
            await message.delete().catch(() => {});
            const currentWarns = (userSpamWarns.get(userId) || 0) + 1;
            userSpamWarns.set(userId, currentWarns);

            if (currentWarns < 3) {
                const warnMsg = await message.channel.send(`${message.author}, evite el spam/flood/tags/links. (Advertencia ${currentWarns}/3)\nMotivo: ${violationType}`);
                setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
            } else {
                userSpamWarns.set(userId, 0);
                const mutesCount = (userSpamMutes.get(userId) || 0) + 1;
                userSpamMutes.set(userId, mutesCount);

                let durationMs = mutesCount === 1 ? 3600000 : mutesCount === 2 ? 10800000 : 36000000;
                let durationText = mutesCount === 1 ? '1h' : mutesCount === 2 ? '3h' : '10h';

                const reason = `Automoderación Reincidente (Mute #${mutesCount}) - ${violationType}`;
                await message.member.timeout(durationMs, reason).catch(() => {});
                const sanction = addSanction(message.guild.id, userId, 'MUTE', client.user.tag, reason, durationText);

                message.channel.send(`${message.author} ha sido silenciado por **${durationText}** tras acumular 3 advertencias de automoderación. | ID: \`${sanction.id}\``);
            }
            return;
        }
    }

    // B) COMANDOS DE TEXTO CON PREFIX "pibble "
    if (!message.content.toLowerCase().startsWith('pibble ')) return;

    const args = message.content.slice(7).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    // SOLO PROCESAR SI ES UN COMANDO VÁLIDO DE MODERACIÓN
    const validCommands = ['mute', 'unmute', 'kick', 'ban', 'unban'];
    if (!validCommands.includes(command)) return; // Ignora cualquier otra palabra que empiece con "pibble "

    // SI NO ES MODERADOR, IGNORAR SILENCIOSAMENTE SIN RESPONDER
    if (!isMod) return;

    // OBTENER MIEMBRO OBJETIVO (Mención O Mensaje Respondido)
    let targetMember = message.mentions.members.first();
    let isReply = false;

    if (!targetMember && message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage) {
                targetMember = await message.guild.members.fetch(repliedMessage.author.id).catch(() => null);
                isReply = true;
            }
        } catch (e) {}
    }

    // COMANDO TEXTO: MUTE
    if (command === 'mute') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje. Ejemplo: `pibble mute @usuario 10m razon` o responde al mensaje diciendo `pibble mute 10m razon`');
        if (!targetMember.moderatable) return message.reply('No se puede silenciar a este usuario.');

        let timeArg;
        let reason;

        if (isReply) {
            timeArg = args[0];
            reason = args.slice(1).join(' ');
        } else {
            timeArg = args[1];
            reason = args.slice(2).join(' ');
        }

        const durationMs = parseDuration(timeArg);
        if (!durationMs) return message.reply('Formato de tiempo inválido. Usa `10m`, `2h`, `1d`, etc.');
        if (durationMs > 2419200000) return message.reply('El tiempo máximo es 28 días.');

        reason = reason || 'Razón no especificada';
        await targetMember.timeout(durationMs, reason).catch(() => {});

        const sanction = addSanction(message.guild.id, targetMember.id, 'MUTE', message.author.tag, reason, timeArg);
        message.channel.send(`**${targetMember.user.tag}** ha sido silenciado por **${timeArg}** por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }

    // COMANDO TEXTO: UNMUTE
    if (command === 'unmute') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.isCommunicationDisabled()) return message.reply('Este usuario no está silenciado.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.timeout(null, reason).catch(() => {});
        const sanction = addSanction(message.guild.id, targetMember.id, 'UNMUTE', message.author.tag, reason);
        message.channel.send(`**${targetMember.user.tag}** ya no está silenciado por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }

    // COMANDO TEXTO: BAN
    if (command === 'ban') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.bannable) return message.reply('No se puede banear a este usuario.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.ban({ reason }).catch(() => {});
        const sanction = addSanction(message.guild.id, targetMember.id, 'BAN', message.author.tag, reason);
        message.channel.send(`**${targetMember.user.tag}** ha sido baneado por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }

    // COMANDO TEXTO: UNBAN
    if (command === 'unban') {
        let targetId = targetMember ? targetMember.id : args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply('Indica el ID del usuario.');

        const reasonIndex = (targetMember || isReply) ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        try {
            await message.guild.members.unban(targetId, reason);
            const sanction = addSanction(message.guild.id, targetId, 'UNBAN', message.author.tag, reason);
            message.channel.send(`Se ha desbaneado al usuario (\`${targetId}\`) por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
        } catch (e) {
            message.reply('No se pudo desbanear al usuario. Verifica el ID.').catch(() => {});
        }
    }

    // COMANDO TEXTO: KICK
    if (command === 'kick') {
        if (!targetMember) return message.reply('Menciona a un usuario o responde a su mensaje.');
        if (!targetMember.kickable) return message.reply('No se puede expulsar a este usuario.');

        const reasonIndex = isReply ? 0 : 1;
        const reason = args.slice(reasonIndex).join(' ') || 'Razón no especificada';

        await targetMember.kick(reason).catch(() => {});
        const sanction = addSanction(message.guild.id, targetMember.id, 'KICK', message.author.tag, reason);
        message.channel.send(`**${targetMember.user.tag}** ha sido expulsado por **${message.author.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}`);
    }
});

// 8. INTERACCIONES DE COMANDOS SLASH (/mute, /ban, /kick, etc.)
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const opcionesColor = [
        { name: 'Rojo', value: '#FF0000' }, { name: 'Azul', value: '#0000FF' },
        { name: 'Verde', value: '#00FF00' }, { name: 'Amarillo', value: '#FFFF00' },
        { name: 'Naranja', value: '#FFA500' }, { name: 'Morado', value: '#800080' },
        { name: 'Blanco', value: '#FFFFFF' }, { name: 'Negro', value: '#000000' }
    ];
    const filtrado = opcionesColor.filter(o => o.name.toLowerCase().includes(focusedValue.toLowerCase()) || o.value.toLowerCase().includes(focusedValue.toLowerCase()));
    await interaction.respond(filtrado).catch(() => {});
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, user } = interaction;

  // /EMBED
  if (commandName === 'embed') {
    const titulo = options.getString('titulo');
    const descripcion = options.getString('descripcion');
    const color = options.getString('color') || '#2B2D31'; 
    const foto = options.getAttachment('foto');

    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descripcion);
    try { embed.setColor(color); } catch (e) { embed.setColor('#2B2D31'); }
    if (foto) embed.setImage(foto.url);

    await interaction.reply({ embeds: [embed] }).catch(() => {});
  }

  // /HIST
  if (commandName === 'hist') {
    const targetUser = options.getUser('usuario');
    const data = getSanctions();
    const userSanctions = data[guild.id]?.[targetUser.id] || [];

    if (userSanctions.length === 0) {
      return interaction.reply({ content: `El usuario **${targetUser.tag}** no tiene ninguna sanción.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Historial de Sanciones: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
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

  // /MUTE
  if (commandName === 'mute') {
    const targetUser = options.getUser('usuario');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const timeArg = options.getString('tiempo');
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!member) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!member.moderatable) return interaction.reply({ content: 'No puedo silenciar a este usuario.', ephemeral: true });

    const durationMs = parseDuration(timeArg);
    if (!durationMs) return interaction.reply({ content: 'Formato de tiempo inválido. Usa `10m`, `2h`, `1d`.', ephemeral: true });

    await member.timeout(durationMs, reason);
    const sanction = addSanction(guild.id, targetUser.id, 'MUTE', user.tag, reason, timeArg);

    await interaction.reply({ content: `**${targetUser.tag}** ha sido silenciado por **${timeArg}** por **${user.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}` });
  }

  // /UNMUTE
  if (commandName === 'unmute') {
    const targetUser = options.getUser('usuario');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!member) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!member.isCommunicationDisabled()) return interaction.reply({ content: 'Este usuario no está silenciado.', ephemeral: true });

    await member.timeout(null, reason);
    const sanction = addSanction(guild.id, targetUser.id, 'UNMUTE', user.tag, reason);

    await interaction.reply({ content: `**${targetUser.tag}** ya no está silenciado por **${user.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}` });
  }

  // /KICK
  if (commandName === 'kick') {
    const targetUser = options.getUser('usuario');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (!member) return interaction.reply({ content: 'Usuario no encontrado.', ephemeral: true });
    if (!member.kickable) return interaction.reply({ content: 'No puedo expulsar a este usuario.', ephemeral: true });

    await member.kick(reason);
    const sanction = addSanction(guild.id, targetUser.id, 'KICK', user.tag, reason);

    await interaction.reply({ content: `**${targetUser.tag}** ha sido expulsado por **${user.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}` });
  }

  // /BAN
  if (commandName === 'ban') {
    const targetUser = options.getUser('usuario');
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const reason = options.getString('razon') || 'Razón no especificada';

    if (member && !member.bannable) return interaction.reply({ content: 'No puedo banear a este usuario.', ephemeral: true });

    await guild.members.ban(targetUser.id, { reason });
    const sanction = addSanction(guild.id, targetUser.id, 'BAN', user.tag, reason);

    await interaction.reply({ content: `**${targetUser.tag}** ha sido baneado por **${user.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}` });
  }

  // /UNBAN
  if (commandName === 'unban') {
    const targetId = options.getString('id');
    const reason = options.getString('razon') || 'Razón no especificada';

    try {
      await guild.members.unban(targetId, reason);
      const sanction = addSanction(guild.id, targetId, 'UNBAN', user.tag, reason);
      await interaction.reply({ content: `Se ha desbaneado al usuario (\`${targetId}\`) por **${user.tag}**. | ID: \`${sanction.id}\`\nRazón: ${reason}` });
    } catch (e) {
      await interaction.reply({ content: 'No se pudo desbanear al usuario. Verifica que la ID sea correcta.', ephemeral: true });
    }
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
