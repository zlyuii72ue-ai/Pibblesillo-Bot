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
  Partials
} = require('discord.js');
const fs = require('fs');

// 1. SERVIDOR WEB PARA MANTENERLO 24/7 EN RAILWAY
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Bot activo 24/7 con Historial de Sanciones!');
}).listen(PORT, () => console.log(`[HTTP] Servidor listo en el puerto ${PORT}`));

// 2. CONFIGURACIÓN, CREDENCIALES Y CANAL DE LOGS
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

// 🎯 ID DE TU CANAL DE LOGS
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '1528201242407342100'; 

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Agrega DISCORD_TOKEN y CLIENT_ID en las variables.");
    process.exit(1);
}

// 3. ESCUDO ANTI-CRASH
process.on('unhandledRejection', reason => console.error('🛡️ [Anti-Crash]:', reason));
process.on('uncaughtException', err => console.error('🛡️ [Anti-Crash]:', err));

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
        type, // 'BAN', 'KICK', 'MUTE'
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

// Map para rastrear mensajes de usuarios (Anti-Flood)
const userMessages = new Map();

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
    description: 'Crea un mensaje embed súper personalizado',
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
  console.log(`🚀 Bot conectado como: ${client.user.tag}`);
  console.log(`📌 Canal de logs vinculado: ${LOG_CHANNEL_ID}`);
  try {
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    }
    console.log('✅ Comandos /embed y /hist registrados.');
  } catch (error) {
    console.error('❌ Error registrando comandos Slash:', error);
  }
});

// 7. AUTOMODERACIÓN Y COMANDOS DE TEXTO (pibble)
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator);

    // ==========================================
    // A) AUTOMODERACIÓN (Ignora a Mods/Admins)
    // ==========================================
    if (!isMod) {
        // 1. ANTI-LINKS
        const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)/i;
        if (linkRegex.test(message.content)) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, los enlaces no están permitidos.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }

        // 2. ANTI-EMOJIS MASIVOS
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|<a?:[a-zA-Z0-9_]+:[0-9]+>)/g;
        const matches = message.content.match(emojiRegex);
        if (matches && matches.length > 5) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, no envíes tantos emojis.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }

        // 3. ANTI-FLOOD / ANTI-SPAM
        const userId = message.author.id;
        const now = Date.now();
        if (!userMessages.has(userId)) userMessages.set(userId, []);
        const timestamps = userMessages.get(userId);
        timestamps.push(now);

        const recentTimestamps = timestamps.filter(t => now - t < 3000);
        userMessages.set(userId, recentTimestamps);

        if (recentTimestamps.length > 4) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, no hagas spam.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }
    }

    // ==========================================
    // B) COMANDOS DE MODERACIÓN (pibble)
    // ==========================================
    if (!message.content.toLowerCase().startsWith('pibble ')) return;
    if (!isMod) return message.reply('❌ No tienes permisos de moderación.').catch(() => {});

    const args = message.content.slice(7).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 🔨 BAN
    if (command === 'ban') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Menciona a alguien. Ej: `pibble ban @usuario razón`');
        if (!target.bannable) return message.reply('❌ No puedo banear a este usuario.');

        const reason = args.slice(1).join(' ') || 'Razón no especificada';
        await target.ban({ reason }).catch(() => {});

        // Registrar en Historial
        const sanction = addSanction(message.guild.id, target.id, 'BAN', message.author.tag, reason);

        message.channel.send(`🔨 **${target.user.tag}** ha sido baneado por **${message.author.tag}**. | ID: \`${sanction.id}\`\n**Razón:** ${reason}`);
    }

    // 👢 KICK
    if (command === 'kick') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Menciona a alguien. Ej: `pibble kick @usuario razón`');
        if (!target.kickable) return message.reply('❌ No puedo expulsar a este usuario.');

        const reason = args.slice(1).join(' ') || 'Razón no especificada';
        await target.kick(reason).catch(() => {});

        // Registrar en Historial
        const sanction = addSanction(message.guild.id, target.id, 'KICK', message.author.tag, reason);

        message.channel.send(`👢 **${target.user.tag}** ha sido expulsado por **${message.author.tag}**. | ID: \`${sanction.id}\`\n**Razón:** ${reason}`);
    }

    // 🔇 MUTE
    if (command === 'mute') {
        const target = message.mentions.members.first();
        const timeArg = args[1];
        const reason = args.slice(2).join(' ') || 'Razón no especificada';

        if (!target || !timeArg) return message.reply('⚠️ Uso: `pibble mute @usuario <tiempo> [razón]` (Ej: `10m`, `2h`, `10d`)');
        if (!target.moderatable) return message.reply('❌ No puedo silenciar a este usuario.');

        const timeMultipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const unit = timeArg.slice(-1).toLowerCase();
        const num = parseInt(timeArg.slice(0, -1));

        if (isNaN(num) || !timeMultipliers[unit]) return message.reply('⚠️ Formato de tiempo inválido. Usa `10m`, `2h`, `10d`, etc.');

        const durationMs = num * timeMultipliers[unit];
        if (durationMs > 2419200000) return message.reply('⚠️ El tiempo máximo es 28 días.');

        await target.timeout(durationMs, reason).catch(() => {});

        // Registrar en Historial
        const sanction = addSanction(message.guild.id, target.id, 'MUTE', message.author.tag, reason, timeArg);

        message.channel.send(`🔇 **${target.user.tag}** ha sido silenciado por **${timeArg}** por **${message.author.tag}**. | ID: \`${sanction.id}\`\n**Razón:** ${reason}`);
    }
});

// 8. INTERACCIONES SLASH (/embed, /hist)
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const opcionesColor = [
        { name: '🔴 Rojo', value: '#FF0000' },
        { name: '🔵 Azul', value: '#0000FF' },
        { name: '🟢 Verde', value: '#00FF00' },
        { name: '🟡 Amarillo', value: '#FFFF00' },
        { name: '🟠 Naranja', value: '#FFA500' },
        { name: '🟣 Morado', value: '#800080' },
        { name: '⚪ Blanco', value: '#FFFFFF' },
        { name: '⚫ Negro', value: '#000000' }
    ];
    const filtrado = opcionesColor.filter(opcion => 
        opcion.name.toLowerCase().includes(focusedValue.toLowerCase()) || 
        opcion.value.toLowerCase().includes(focusedValue.toLowerCase())
    );
    await interaction.respond(filtrado).catch(() => {});
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // EJECUCIÓN DE /embed
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

  // EJECUCIÓN DE /hist
  if (interaction.commandName === 'hist') {
    const user = interaction.options.getUser('usuario');
    const data = getSanctions();
    const userSanctions = data[interaction.guildId]?.[user.id] || [];

    if (userSanctions.length === 0) {
      return interaction.reply({ 
        content: `✅ El usuario **${user.tag}** no tiene ninguna sanción registrada.`, 
        ephemeral: true 
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Historial de Sanciones: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .setColor('#FFA500')
      .setFooter({ text: `Total de sanciones: ${userSanctions.length}` })
      .setTimestamp();

    userSanctions.forEach((s) => {
      const durationText = s.duration ? ` | **Duración:** ${s.duration}` : '';
      embed.addFields({
        name: `🔹 [${s.type}] - ID: ${s.id}`,
        value: `**Razón:** ${s.reason}\n**Moderador:** ${s.moderator}${durationText}\n**Fecha:** <t:${s.timestamp}:R>`
      });
    });

    await interaction.reply({ embeds: [embed] });
  }
});

// 9. EVENTOS DE LOGS
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Mensaje Borrado')
        .setColor('#FF5555')
        .addFields(
            { name: 'Autor', value: message.author ? message.author.tag : 'Desconocido', inline: true },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Contenido', value: message.content || 'Sin texto (imagen o embed)' }
        )
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

client.on('guildAuditLogEntryCreate', async (auditLog, guild) => {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const { action, executor, target, reason, changes } = auditLog;
    const embed = new EmbedBuilder().setTimestamp();

    if (action === AuditLogEvent.MemberKick) {
        embed.setTitle('👢 Usuario Expulsado')
             .setColor('#FFA500')
             .setDescription(`**Usuario:** ${target?.tag || 'Desconocido'}\n**Moderador:** ${executor?.tag || 'Desconocido'}\n**Razón:** ${reason || 'No especificada'}`);
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberBanAdd) {
        embed.setTitle('🔨 Usuario Baneado')
             .setColor('#FF0000')
             .setDescription(`**Usuario:** ${target?.tag || 'Desconocido'}\n**Moderador:** ${executor?.tag || 'Desconocido'}\n**Razón:** ${reason || 'No especificada'}`);
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    else if (action === AuditLogEvent.MemberUpdate) {
        const timeoutChange = changes?.find(c => c.key === 'communication_disabled_until');
        if (timeoutChange) {
            if (timeoutChange.new) {
                const time = Math.floor(new Date(timeoutChange.new).getTime() / 1000);
                embed.setTitle('🔇 Usuario Silenciado')
                     .setColor('#FFFF00')
                     .setDescription(`**Usuario:** ${target?.tag || 'Desconocido'}\n**Moderador:** ${executor?.tag || 'Desconocido'}\n**Duración:** Hasta <t:${time}:R>\n**Razón:** ${reason || 'No especificada'}`);
            } else {
                embed.setTitle('🔊 Silencio Removido')
                     .setColor('#00FF00')
                     .setDescription(`**Usuario:** ${target?.tag || 'Desconocido'}\n**Moderador:** ${executor?.tag || 'Desconocido'}`);
            }
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// 10. INICIAR BOT
client.login(TOKEN);
