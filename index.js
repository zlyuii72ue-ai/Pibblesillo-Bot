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
  res.end('🤖 Bot activo 24/7 sin fallos!');
}).listen(PORT, () => console.log(`[HTTP] Servidor listo en el puerto ${PORT}`));

// 2. CONFIGURACIÓN Y CREDENCIALES
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ ERROR: Agrega DISCORD_TOKEN y CLIENT_ID en las variables de Railway.");
    process.exit(1);
}

// 3. ESCUDO ANTI-CRASH (Evita que se apague por errores)
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

// 5. CLIENTE DE DISCORD CON INTENTS
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Activar en Discord Developer Portal -> Bot -> Intents
    GatewayIntentBits.GuildModeration 
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User] 
});

// 6. COMANDOS
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

// 7. REGISTRO DE COMANDOS EN DISCORD
const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('clientReady', async () => {
  console.log(`🚀 Bot conectado como: ${client.user.tag}`);
  
  // Registra los comandos al instante en CADA servidor donde esté el bot
  try {
    const guildIds = client.guilds.cache.map(guild => guild.id);
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    }
    console.log('✅ ¡Comanditos /embed y /canalsetup registrados al instante!');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }
});

// Registrar comandos si entra a un servidor nuevo
client.on('guildCreate', async (guild) => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: commands });
  } catch (e) {}
});

// 8. MANEJO DE INTERACCIONES Y COMANDOS
client.on('interactionCreate', async interaction => {
  
  // Autocompletado de Colores
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

  // Ejecución de /embed
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

  // Ejecución de /canalsetup
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
