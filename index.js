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

// ==========================================
// 🌐 SERVIDOR HTTP PARA MANTENER EL BOT 24/7
// ==========================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🤖 Bot de Discord activo y funcionando 24/7 sin fallos!');
}).listen(PORT, () => {
  console.log(`[Servidor Web] Activo en el puerto ${PORT} para mantener el bot despierto.`);
});

// ==========================================
// CONFIGURACIÓN Y CREDENCIALES
// ==========================================
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ Faltan las variables de entorno DISCORD_TOKEN o CLIENT_ID en Railway.");
    process.exit(1);
}

// 🛡️ SISTEMA ANTI-CRASH TOTAL (Evita que el bot se apague por errores)
process.on('unhandledRejection', (reason, promise) => {
    console.error('🛡️ [Anti-Crash] Promesa rechazada no manejada:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error('🛡️ [Anti-Crash] Excepción no capturada:', err);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error('🛡️ [Anti-Crash] Monitor de excepción no capturada:', err);
});

// ==========================================
// BASE DE DATOS LOCAL PARA LOGS
// ==========================================
const logFile = './logChannels.json';

function saveLogChannel(guildId, channelId) {
    let data = {};
    try {
        if (fs.existsSync(logFile)) data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        data[guildId] = channelId;
        fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("⚠️ Error al guardar el canal de logs:", e);
    }
}

function getLogChannel(guildId) {
    try {
        if (fs.existsSync(logFile)) {
            const data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            return data[guildId];
        }
    } catch (e) {
        return null;
    }
    return null;
}

// ==========================================
// INICIALIZACIÓN DEL BOT
// ==========================================
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // ⚠️ RECUERDA ACTIVAR ESTO EN EL DISCORD DEVELOPER PORTAL
    GatewayIntentBits.GuildModeration 
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User] 
});

// ==========================================
// DEFINICIÓN DE COMANDOS
// ==========================================
const commands = [
  {
    name: 'embed',
    description: 'Crea un mensaje embed súper personalizado',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'titulo',
        description: 'El título que llevará el embed',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'descripcion',
        description: 'El texto principal de tu embed',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'color',
        description: 'Elige un color de la lista o escribe tu propio Hex',
        type: ApplicationCommandOptionType.String,
        autocomplete: true, 
        required: false, 
      },
      {
        name: 'foto',
        description: 'Sube una imagen directa',
        type: ApplicationCommandOptionType.Attachment,
        required: false, 
      }
    ],
  },
  {
    name: 'canalsetup',
    description: 'Configura el canal donde se enviarán los registros/logs',
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'canal',
        description: 'Selecciona el canal de texto para los logs',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildText],
        required: true,
      }
    ],
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('⏳ Registrando comandos (/embed, /canalsetup)...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ ¡Comandos registrados con éxito!');
  } catch (error) {
    console.error('❌ Hubo un error al registrar los comandos:', error);
  }
})();

// ==========================================
// MANEJO DE INTERACCIONES (COMANDOS)
// ==========================================
client.on('interactionCreate', async interaction => {
  
  // 1. AUTOCOMPLETADO DE COLORES
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

  // 2. EJECUCIÓN DE COMANDOS CHAT INPUT
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'embed') {
    const titulo = interaction.options.getString('titulo');
    const descripcion = interaction.options.getString('descripcion');
    const color = interaction.options.getString('color') || '#2B2D31'; 
    const foto = interaction.options.getAttachment('foto');

    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descripcion);
    
    // Evitar fallos si introducen un código de color inválido
    try { 
        embed.setColor(color); 
    } catch (e) { 
        embed.setColor('#2B2D31'); 
    }
    
    if (foto) embed.setImage(foto.url);

    await interaction.reply({ embeds: [embed] }).catch(() => {});
  }

  if (interaction.commandName === 'canalsetup') {
    const canal = interaction.options.getChannel('canal');
    saveLogChannel(interaction.guildId, canal.id);
    
    await interaction.reply({ 
      content: `✅ ¡Listo! A partir de ahora enviaré todos los registros de moderación y mensajes borrados en ${canal}`, 
      ephemeral: true 
    }).catch(() => {});
  }
});

// ==========================================
// EVENTOS DE LOGS (BORRADO, BANS, KICKS, MUTES)
// ==========================================
client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return; // Ignorar mensajes en MD o de otros bots para evitar spam

    const logChannelId = getLogChannel(message.guild.id);
    if (!logChannelId) return;

    const logChannel = message.guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const autor = message.author ? message.author.tag : 'Desconocido';
    const contenido = message.content || 'Sin texto (imagen o embed)';

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Mensaje Borrado')
        .setColor('#FF5555')
        .addFields(
            { name: 'Autor', value: autor, inline: true },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Contenido', value: contenido.substring(0, 1024) } // Límite de caracteres de Discord
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
                embed.setTitle('🔇 Usuario Silenciado (Timeout)')
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

// ==========================================
// ARRANQUE DEL BOT
// ==========================================
client.once('clientReady', () => {
  console.log(`🚀 ¡Listo! El bot ${client.user.tag} está en línea, blindado contra fallos y funcionando 24/7.`);
});

client.login(TOKEN);
