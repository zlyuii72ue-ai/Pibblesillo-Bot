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
  ChannelType,
  AuditLogEvent,
  Partials
} = require('discord.js');
const fs = require('fs');

// 1. SERVIDOR WEB PARA MANTENERLO 24/7 EN RAILWAY
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Bot activo 24/7 con Automoderación!');
}).listen(PORT, () => console.log(`[HTTP] Servidor listo en el puerto ${PORT}`));

// 2. CONFIGURACIÓN Y CREDENCIALES
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Agrega DISCORD_TOKEN y CLIENT_ID en las variables de Railway.");
    process.exit(1);
}

// 3. ESCUDO ANTI-CRASH
process.on('unhandledRejection', reason => console.error('🛡️ [Anti-Crash]:', reason));
process.on('uncaughtException', err => console.error('🛡️ [Anti-Crash]:', err));

// 4. ALMACENAMIENTO DE LOGS
const logFile = './logChannels.json';

function saveLogChannel(guildId, channelId) {
    let data = {};
    try {
        if (fs.existsSync(logFile)) data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        data[guildId] = channelId;
        fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
    } catch (e) { console.error(e); }
}

function getLogChannel(guildId) {
    try {
        if (fs.existsSync(logFile)) {
            const data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            return data[guildId];
        }
    } catch (e) { return null; }
    return null;
}

// Map para rastrear mensajes de usuarios (Anti-Flood)
const userMessages = new Map();

// 5. CLIENTE DE DISCORD CON INTENTS
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

// 6. COMANDOS SLASH (/embed, /canalsetup)
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
    name: 'canalsetup',
    description: 'Configura el canal para enviar los registros/logs',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      { name: 'canal', description: 'Canal de texto para los logs', type: ApplicationCommandOptionType.Channel, channel_types: [ChannelType.GuildText], required: true }
    ],
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('clientReady', async () => {
  console.log(`🚀 Bot conectado como: ${client.user.tag}`);
  try {
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    }
    console.log('✅ Comandos Slash registrados.');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
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
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, los enlaces no están permitidos en este servidor.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }

        // 2. ANTI-EMOJIS MASIVOS (Máximo 5 emojis por mensaje)
        const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|<a?:[a-zA-Z0-9_]+:[0-9]+>)/g;
        const matches = message.content.match(emojiRegex);
        if (matches && matches.length > 5) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, no envíes tantos emojis a la vez.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }

        // 3. ANTI-FLOOD / ANTI-SPAM (4 mensajes en menos de 3 segundos)
        const userId = message.author.id;
        const now = Date.now();
        if (!userMessages.has(userId)) {
            userMessages.set(userId, []);
        }
        const timestamps = userMessages.get(userId);
        timestamps.push(now);

        // Limpiar registros antiguos
        const recentTimestamps = timestamps.filter(t => now - t < 3000);
        userMessages.set(userId, recentTimestamps);

        if (recentTimestamps.length > 4) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ ${message.author}, por favor no hagas spam / flood.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }
    }

    // ==========================================
    // B) COMANDOS DE MODERACIÓN (pibble ...)
    // ==========================================
    if (!message.content.toLowerCase().startsWith('pibble ')) return;
    if (!isMod) return message.reply('❌ No tienes permisos para usar mandos de moderación.').catch(() => {});

    const args = message.content.slice(7).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 🔨 PIBBLE BAN
    if (command === 'ban') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Debes mencionar a un usuario para banear. Ej: `pibble ban @usuario spam`');
        if (!target.bannable) return message.reply('❌ No puedo banear a este usuario (su rol es superior o igual al mío).');

        const reason = args.slice(1).join(' ') || 'Razón no especificada';
        await target.ban({ reason }).catch(() => {});
        message.channel.send(`🔨 **${target.user.tag}** ha sido baneado por **${message.author.tag}**. Razón: ${reason}`);
    }

    // 👢 PIBBLE KICK
    if (command === 'kick') {
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Debes mencionar a un usuario para expulsar. Ej: `pibble kick @usuario conducta`');
        if (!target.kickable) return message.reply('❌ No puedo expulsar a este usuario.');

        const reason = args.slice(1).join(' ') || 'Razón no especificada';
        await target.kick(reason).catch(() => {});
        message.channel.send(`👢 **${target.user.tag}** ha sido expulsado por **${message.author.tag}**. Razón: ${reason}`);
    }

    // 🔇 PIBBLE MUTE (ej: pibble mute @usuario 10d spam)
    if (command === 'mute') {
        const target = message.mentions.members.first();
        const timeArg = args[1]; // ej: 10m, 2h, 10d
        const reason = args.slice(2).join(' ') || 'Razón no especificada';

        if (!target || !timeArg) return message.reply('⚠️ Uso correcto: `pibble mute @usuario <tiempo> [razón]`\nEjemplos de tiempo: `10m` (minutos), `2h` (horas), `10d` (días).');
        if (!target.moderatable) return message.reply('❌ No puedo silenciar a este usuario.');

        // Convertir tiempo a milisegundos
        const timeMultipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const unit = timeArg.slice(-1).toLowerCase();
        const num = parseInt(timeArg.slice(0, -1));

        if (isNaN(num) || !timeMultipliers[unit]) {
            return message.reply('⚠️ Formato de tiempo inválido. Usa `s` (segundos), `m` (minutos), `h` (horas) o `d` (días). Ej: `10m` o `10d`.');
        }

        const durationMs = num * timeMultipliers[unit];
        if (durationMs > 2419200000) return message.reply('⚠️ El tiempo máximo de mute en Discord es 28 días.');

        await target.timeout(durationMs, reason).catch(() => {});
        message.channel.send(`🔇 **${target.user.tag}** ha sido silenciado por **${timeArg}** por **${message.author.tag}**. Razón: ${reason}`);
    }
});

// 8. INTERACCIONES SLASH (/embed, /canalsetup, Autocompletado)
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

  if (interaction.commandName === 'canalsetup') {
    const canal = interaction.options.getChannel('canal');
    saveLogChannel(interaction.guildId, canal.id);
    
    await interaction.reply({ 
      content: `✅ ¡Registros activados en ${canal}!`, 
      ephemeral: true 
    }).catch(() => {});
  }
});

// 9. EVENTOS DE LOGS
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;

    const logChannelId = getLogChannel(message.guild.id);
    if (!logChannelId) return;

    const logChannel = message.guild.channels.cache.get(logChannelId);
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
    const logChannelId = getLogChannel(guild.id);
    if (!logChannelId) return;
    
    const logChannel = guild.channels.cache.get(logChannelId);
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
