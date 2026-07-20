require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');

// Variables de entorno (Railway las inyectará automáticamente)
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID; 

if (!TOKEN || !CLIENT_ID) {
    console.error("Faltan las variables de entorno DISCORD_TOKEN o CLIENT_ID.");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  {
    name: 'embed',
    description: 'Crea un mensaje embed súper personalizado',
    // ESTA LÍNEA ES LA MAGIA PARA QUE SOLO LOS ADMINS LO USEN/VEAN
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
        description: 'Color en código Hex (ej. #FF0000 para rojo)',
        type: ApplicationCommandOptionType.String,
        required: false, 
      },
      {
        name: 'foto',
        description: 'Sube una imagen directa desde tu PC o celular',
        type: ApplicationCommandOptionType.Attachment,
        required: false, 
      }
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registrando el comando /embed...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('¡Comando registrado con éxito!');
  } catch (error) {
    console.error('Hubo un error al registrar el comando:', error);
  }
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'embed') {
    const titulo = interaction.options.getString('titulo');
    const descripcion = interaction.options.getString('descripcion');
    const color = interaction.options.getString('color') || '#2B2D31'; 
    const foto = interaction.options.getAttachment('foto');

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descripcion);

    try {
        embed.setColor(color);
    } catch (e) {
        embed.setColor('#2B2D31'); 
    }

    if (foto) {
      embed.setImage(foto.url);
    }

    await interaction.reply({ embeds: [embed] });
  }
});

client.once('ready', () => {
  console.log(`¡Listo! El bot ${client.user.tag} está encendido y funcionando.`);
});

client.login(TOKEN);
