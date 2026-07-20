require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');

// Variables de entorno (Railway)
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
        description: 'Elige un color de la lista o escribe tu propio Hex (ej. #FF5555)',
        type: ApplicationCommandOptionType.String,
        autocomplete: true, // Activamos el autocompletado en lugar de cerrarlo a opciones fijas
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

// Escuchamos las interacciones del usuario
client.on('interactionCreate', async interaction => {
  
  // 1. MANEJAR EL AUTOCOMPLETADO DE COLORES
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused();
    
    // Nuestra lista de sugerencias rápidas
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

    // Filtra las opciones basadas en lo que el usuario esté escribiendo
    const filtrado = opcionesColor.filter(opcion => 
        opcion.name.toLowerCase().includes(focusedValue.toLowerCase()) || 
        opcion.value.toLowerCase().includes(focusedValue.toLowerCase())
    );

    await interaction.respond(filtrado);
    return;
  }

  // 2. MANEJAR EL COMANDO EN SÍ
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'embed') {
    const titulo = interaction.options.getString('titulo');
    const descripcion = interaction.options.getString('descripcion');
    const color = interaction.options.getString('color') || '#2B2D31'; 
    const foto = interaction.options.getAttachment('foto');

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descripcion);

    // Intentamos aplicar el color (ya sea de la lista o uno personalizado)
    try {
        embed.setColor(color);
    } catch (e) {
        // Si el usuario escribió cualquier cosa que no sea un Hex válido (ej. "hola"), ponemos un color por defecto para que no crashee.
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
