require('dotenv').config();
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
const fs = require('fs'); // Librería nativa de Node.js para leer/escribir archivos

const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

if (!TOKEN || !CLIENT_ID) {
    console.error("Faltan las variables de entorno DISCORD_TOKEN o CLIENT_ID.");
    process.exit(1);
}

// Archivo donde guardaremos qué canal de logs usa cada servidor
const logFile = './logChannels.json';

// Funciones para guardar y leer la configuración
function saveLogChannel(guildId, channelId) {
    let data = {};
    if (fs.existsSync(logFile)) data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    data[guildId] = channelId;
    fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
}

function getLogChannel(guildId) {
    if (fs.existsSync(logFile)) {
        const data = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        return data[guildId];
    }
    return null;
}

// Inicializamos el bot con los Intents necesarios para leer TODO
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Para leer contenido de mensajes
    GatewayIntentBits.GuildModeration // Para leer bans, kicks y mutes
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User] // Para detectar mensajes antiguos
});

// Definimos nuestros comandos
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
    name: 'canal-setup',
    description: 'Configura el canal donde se enviarán los registros/logs',
    default_member_permissions: String(PermissionFlagsBits.Administrator), // Solo admins
    options: [
      {
        name: 'canal',
        description: 'Selecciona el canal de texto para los logs',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildText], // Solo permite canales de texto
        required: true,
      }
    ],
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registrando comandos (/embed, /canal-setup)...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('¡Comandos registrados con éxito!');
  } catch (error) {
    console.error('Hubo un error al registrar los comandos:', error);
  }
})();

// INTERACCIONES CON COMANDOS Y AUTOCOMPLETADO
client.on('interactionCreate', async interaction => {
  
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    const opcionesColor = [
        { name: '🔴 Rojo', value: '#FF0000' },
        { name: '🔵 Azul', value: '#0000FF' },
        { name: '🟢 Verde', value: '#00FF00' },
        { name: '⚪ Blanco', value: '#FFFFFF' },
        { name: '⚫ Negro', value: '#000000' }
    ];
    const filtrado = opcionesColor.filter(opcion => 
        opcion.name.toLowerCase().includes(focusedValue.toLowerCase()) || 
        opcion.value.toLowerCase().includes(focusedValue.toLowerCase())
    );
    await interaction.respond(filtrado);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Comando /embed
  if (interaction.commandName === 'embed') {
    const titulo = interaction.options.getString('titulo');
    const descripcion = interaction.options.getString('descripcion');
    const color = interaction.options.getString('color') || '#2B2D31'; 
    const foto = interaction.options.getAttachment('foto');

    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descripcion);
    try { embed.setColor(color); } catch (e) { embed.setColor('#2B2D31'); }
    if (foto) embed.setImage(foto.url);

    await interaction.reply({ embeds: [embed] });
  }

  // Comando /canal-setup
  if (interaction.commandName === 'canal-setup') {
    const canal = interaction.options.getChannel('canal');
    saveLogChannel(interaction.guildId, canal.id);
    
    await interaction.reply({ 
      content: `✅ ¡Listo! A partir de ahora enviaré todos los registros de moderación y mensajes borrados en ${canal}`, 
      ephemeral: true // Mensaje visible solo para quien usó el comando
    });
  }
});

// ==========================================
// SISTEMA DE LOGS (EVENTOS)
// ==========================================

// 1. MENSAJES BORRADOS
client.on('messageDelete', async (message) => {
    if (!message.guild) return; // Ignorar mensajes en MD
    const logChannelId = getLogChannel(message.guild.id);
    if (!logChannelId) return; // Si no han configurado el canal, no hacer nada

    const logChannel = message.guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const autor = message.author ? message.author.tag : 'Desconocido (El bot no alcanzó a leerlo)';
    const contenido = message.content || 'Sin texto (probablemente una imagen o embed)';

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Mensaje Borrado')
        .setColor('#FF5555')
        .addFields(
            { name: 'Autor', value: autor, inline: true },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Contenido', value: contenido }
        )
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
});

// 2. BANS, KICKS Y MUTES (TIMEOUTS)
client.on('guildAuditLogEntryCreate', async (auditLog, guild) => {
    const logChannelId = getLogChannel(guild.id);
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const { action, executor, target, reason, changes } = auditLog;
    const embed = new EmbedBuilder().setTimestamp();

    // Expulsiones (Kicks)
    if (action === AuditLogEvent.MemberKick) {
        embed.setTitle('👢 Usuario Expulsado')
             .setColor('#FFA500')
             .setDescription(`**Usuario:** ${target.tag}\n**Moderador:** ${executor.tag}\n**Razón:** ${reason || 'No especificada'}`);
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    
    // Baneos
    else if (action === AuditLogEvent.MemberBanAdd) {
        embed.setTitle('🔨 Usuario Baneado')
             .setColor('#FF0000')
             .setDescription(`**Usuario:** ${target.tag}\n**Moderador:** ${executor.tag}\n**Razón:** ${reason || 'No especificada'}`);
        logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // Mutes (Timeouts)
    else if (action === AuditLogEvent.MemberUpdate) {
        const timeoutChange = changes.find(c => c.key === 'communication_disabled_until');
        if (timeoutChange) {
            if (timeoutChange.new) {
                // Fue silenciado
                const time = Math.floor(new Date(timeoutChange.new).getTime() / 1000);
                embed.setTitle('🔇 Usuario Silenciado (Timeout)')
                     .setColor('#FFFF00')
                     .setDescription(`**Usuario:** ${target.tag}\n**Moderador:** ${executor.tag}\n**Duración:** Hasta <t:${time}:R>\n**Razón:** ${reason || 'No especificada'}`);
            } else {
                // Le quitaron el silencio
                embed.setTitle('🔊 Silencio Removido')
                     .setColor('#00FF00')
                     .setDescription(`**Usuario:** ${target.tag}\n**Moderador:** ${executor.tag}`);
            }
            logChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

client.once('ready', () => {
  console.log(`¡Listo! El bot ${client.user.tag} está encendido y funcionando con logs.`);
});

client.login(TOKEN);
