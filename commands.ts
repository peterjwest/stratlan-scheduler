import {
    Client,
    Events,
    SlashCommandBuilder,
    Collection,
    CacheType,
    ChatInputCommandInteraction,
    Interaction,
    MessageFlags,
    Routes,
} from 'discord.js';

type Command = {
    data: SlashCommandBuilder;
    execute: (interaction: Interaction<CacheType>) => Promise<void>;
};

const COMMAND_ERROR = 'There was an error while executing this command!';

const commands = new Collection<string, Command>();

const command = new SlashCommandBuilder()
    .setName('user')
    .setDescription('Provides information about the user.');

commands.set(command.name, {
    data: command,
    execute: async function (interaction: ChatInputCommandInteraction<CacheType>) {
        await interaction.reply(`This command was run by ${interaction.user.username}`);
    },
});

async function putCommands(discordClient: Client, clientId: string, commands: SlashCommandBuilder[]) {
    await discordClient.rest.put(
        Routes.applicationCommands(clientId),
        { body: commands.map((command) => command.toJSON()) },
    );
}

export default async function setupCommands(discordClient: Client, clientId: string) {
    await putCommands(discordClient, clientId, [command]);

    discordClient.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Command failed: ${error}`);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: COMMAND_ERROR, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: COMMAND_ERROR, flags: MessageFlags.Ephemeral });
            }
        }
    });
}
