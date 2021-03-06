import { Discord, On, Client, CommandMessage, Guard, ArgsOf, Command as DiscordCommand } from '@typeit/discord';
import 'reflect-metadata';
import config from './configs/config.json';
import activities from './configs/activities.json';
import { Command, CommandMetadataStorage } from './ArgumentParser';
import { Owner } from './guards/Owner';
import { HelpEmbedBrowser } from './embed-browsers/HelpEmbedBrowser';
import { GIT_HASH, PACKAGE_VERSION, TYPESCRIPT_VERSION } from './constants';
import { RandomUtils } from './utils/RandomUtils';
import { MathUtils } from './utils/MathUtils';
import { BaseActivity } from './activities/BaseActivity';
import moment from 'moment-timezone';
import { findBestMatch } from 'string-similarity';
import { ServerHandler } from './workers/ServerHandler';
import { create_logger } from './utils/Logger';
import { MessageEmbed } from './utils/EmbedUtils';
import { get_prefix, get_prefix_str } from './server-config/ServerConfig';

const logger = create_logger(module);

@Discord(get_prefix)
export abstract class AppDiscord {
    private static _client: Client;

    private static last_activity: BaseActivity;
    private static last_timeout: NodeJS.Timer;

    private static activity_randomizer = RandomUtils.create_randomizer<{ new(client: Client): BaseActivity }>(activities.map(activity =>
        require(`./activities/${activity}`)[activity]
    ));

    private start_time: moment.Moment;

    private static constructed = false;

    public static get client() { return this._client; }

    public static start() {
        logger.info('logging in');

        this._client = new Client({
            classes: [
                `${__dirname}/commands/**/*.js`,
                `${__dirname}/events/*.js`,
                `${__dirname}/embed-browsers/BaseEmbedBrowser.js`
            ],
            variablesChar: ':',
            silent: true
        });

        this._client.login(config.token);

        ServerHandler.set_cache_dir(`${__dirname}/${config.cache_dir}/`);
    }

    constructor() {
        if (AppDiscord.constructed) return;
        AppDiscord.constructed = true;
        
        const outer_this = this;

        @Discord(config.prefix)
        abstract class DefaultHelpCommand {
            @DiscordCommand('h')
            private async help(message: CommandMessage, client: Client) {
                const prefix = get_prefix_str(message);
                if (prefix == config.prefix) return;

                const reply_message = await message.author.send(`The server you are in has a prefix of \`${prefix}\`, but you have used the default prefix`);

                // don't try this at home, kids
                return (outer_this.help as any)(new Proxy(message, {
                    get: (target, prop) => {
                        if (prop == 'channel') return reply_message.channel;
                        if (prop == 'reply') return reply_message.reply.bind(reply_message);

                        return target[prop];
                    }
                }), client);
            }
        }
    }

    @On('ready')
    private ready([]: ArgsOf<'ready'>, client: Client) {
        AppDiscord.process_next_activity();
        this.start_time = moment();
        ServerHandler.set_client(client);

        const user_count = new Set(client.guilds.cache.map(server => {
            return server.members.cache.map(member => {
                return member.user.id;
            });
        }).flat()).size;

        logger.info(`bot logged in, client id ${client.user.id}, serving ${client.guilds.cache.size} guilds and ${user_count} users with ${CommandMetadataStorage.get_commands().length} commands`);
        logger.info(`${client.user.username} version ${PACKAGE_VERSION} (${GIT_HASH}) built with TypeScript version ${TYPESCRIPT_VERSION}`);
    }

    public static async destroy() {
        await this.last_activity.destroy();
        this._client.destroy();
        logger.info(`destroying bot`);
    }

    private static async process_next_activity() {
        const client = this._client;
        client.clearTimeout(this.last_timeout);

        if (this.last_activity) await this.last_activity.destroy();

        await client.user.setPresence({
            status: 'online'
        });

        const constructor = this.activity_randomizer();

        const activity = new constructor(client);
        activity.create();

        AppDiscord.last_activity = activity;

        const next_delay = MathUtils.clamp(RandomUtils.gaussian(5, 20, .75), 2, Infinity);
        this.last_timeout = client.setTimeout(() => this.process_next_activity(), next_delay * 60e3);

        logger.debug(`bot switched activity to ${constructor.name}`);
    }

    @Command('ping', {
        infos: 'Round-trip ping',
        extraneous_argument_message: false
    })
    private async ping(message: CommandMessage, client: Client) {
        const reply = await message.channel.send(`Calculating ping...`);
        reply.edit(`:ping_pong: Pong! ~${(reply.createdTimestamp - message.createdTimestamp).toFixed(2)}ms RTT, ~${client.ws.ping.toFixed(2)}ms WS`);
    }

    @Command('h', {
        infos: 'Get help',
        description: `Gets help (use \`h [command]\` for command details`,
        extraneous_argument_message: false,
        aliases: ['help']
    })
    private async help(message: CommandMessage, command: string = null) {
        if (!command) return new HelpEmbedBrowser().send_embed(message);
        
        const commands = CommandMetadataStorage.get_commands();
        command = command.trim().replace(get_prefix(message), '');
        const command_obj = commands.find(({ commandName, aliases }) => commandName == command || aliases?.includes(command));
        
        if (!command_obj || command_obj.hide) {
            let { ratings } = findBestMatch(command, commands.filter(command => !command.hide).flatMap(command => [command.commandName, ...(command.aliases ?? [])]));
            ratings = ratings.filter(({ rating }) => rating > .35).map(({ target }) => target);

            if (!ratings.length) return message.reply(`Error: command \`${command}\` not found`);

            const embed = new MessageEmbed({ title: `Command \`${command}\` not found` });
            embed.addField('Did you mean the following?', ratings.map(name => {
                const command_obj = commands.find(({ commandName, aliases }) => commandName == name || aliases?.includes(name));
                if (!command_obj) return '';

                return `\`${name}\`, from ${command_obj.group}: ${command_obj.infos ?? ''}`;
            }).filter(x => x).join('\n'))

            return message.channel.send(embed);
        }
        
        const embed = new MessageEmbed({ title: `\`${command_obj.commandName}\` command` });
        embed.addField('Group', command_obj.group);
        embed.addField('Info', command_obj.infos ?? 'None');
        embed.addField('Description', command_obj.description ?? 'None');
        embed.addField('Usage', `\`${get_prefix_str(message)}${command_obj.usage}\``);
        if (command_obj.aliases?.length) embed.addField('Aliases', `\`${command_obj.aliases.join(', ')}\``);
        if (command_obj.example) embed.addField('Examples', '```\n' + command_obj.example + '\n```');
        message.channel.send(embed);
    }

    @Command('version', {
        infos: `Get info about this version of the bot`,
        extraneous_argument_message: false
    })
    private async version(message: CommandMessage, client: Client) {
        message.channel.send(`${client.user.username} version \`${PACKAGE_VERSION} (${GIT_HASH})\` built with TypeScript version \`${TYPESCRIPT_VERSION}\``);
    }

    @Command('invite', {
        infos: 'Invite',
        description: 'Get invite link for bot',
        extraneous_argument_message: false
    })
    private async invite(message: CommandMessage, client: Client) {
        const user_count = new Set(client.guilds.cache.map(server => {
            return server.members.cache.map(member => {
                return member.user.id;
            });
        }).flat()).size;

        const embed = new MessageEmbed({
            title: `Invite ${client.user.username}`,
            url: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=640928832`,
            thumbnail: {
                url: client.user.avatarURL()
            },
            fields: [{
                name: 'Created by SK1982#6578',
                value: `Running on ${client.guilds.cache.size} servers\nServing ${user_count} users`
            }]
        });

        message.channel.send(embed);
    }

    @Command('info', {
        infos: 'Get info',
        extraneous_argument_message: false,
        aliases: [
            'infos'
        ]
    })
    private async info(message: CommandMessage, client: Client) {
        const embed = new MessageEmbed({
            title: client.user.username,
            thumbnail: {
                url: client.user.avatarURL()
            },
            description: `${client.user.username} is a multi-purpose bot focused on sending images, doujins, and videos from many popular hentai sites, such as NHentai, ExHentai, HAnime, and more. ${client.user.username} comes with many other fun commands for your Discord server.`,
            fields: [{
                name: 'Created by SK1982#6578',
                value: 'For help: `<h`\nTo get the invite link to this bot: `<invite`\nTo get the version of this bot: `<version`\n\n*This bot is [open source](https://github.com/sk-1982/Hideri)*\n*Please send issues/bug reports to the [issue tracker](https://github.com/sk-1982/Hideri/issues)*'
            }],
            footer: {
                text: `v${PACKAGE_VERSION} | TS v${TYPESCRIPT_VERSION} | commit ${GIT_HASH}`
            }
        });

        message.channel.send(embed);
    }

    @Command('uptime', {
        infos: 'Get uptime',
        description: 'Get the uptime of this bot',
        extraneous_argument_message: false
    })
    private async uptime(message: CommandMessage) {
        const uptime_string = moment.duration(moment().diff(this.start_time)).format('w [weeks], d [days], h [hrs], m [minutes]');
        const start_string = this.start_time.format('MMM Do, Y, h:mm:ss A UTCZZ');

        message.channel.send(`${uptime_string} (since ${start_string})`);
    }

    @Guard(Owner())
    @Command('load_ext', {
        hide: true
    })
    private async load_ext(message: CommandMessage, module: string) {
        try {
            require(module);
            message.reply(`loaded module \`${module}\` successfully`);
        } catch (e) {
            message.reply(`error loading module \`${module}\`, \`${e.name} ${e.message}\``);
        }
    }
}
