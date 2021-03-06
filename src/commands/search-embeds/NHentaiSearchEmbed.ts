import { BaseSearchEmbed } from './BaseSearchEmbed';
import { Client, Message } from 'discord.js';
import { CommandMessage, Discord } from '@typeit/discord';
import { BaseEmbedBrowser } from '../../embed-browsers/BaseEmbedBrowser';
import { NHentaiEmbedBrowser } from '../../embed-browsers/NHentaiEmbedBrowser';
import config from '../../configs/config.json';
import { CommandGroup } from '../../types/CommandGroup';
import { Command } from '../../ArgumentParser';
import { RestAsString } from '../../argument-types/RestAsString';
import { nhentai } from '../../apis/Instances';
import { RandomUtils } from '../../utils/RandomUtils';
import { get_prefix } from '../../server-config/ServerConfig';

@Discord(get_prefix)
export class NHentaiSearchEmbed extends BaseSearchEmbed {
    public pattern = /\(\s*(\d{5,6})(\s+\d+)?\s*\)/g;

    public name = 'NHentai';
    public info = 'Fetch gallery from nhentai';
    public usage = '(gallery) or (gallery page)';
    public nsfw = true;

    public associated_command = 'nh';

    @Command('nh', {
        description: 'Get random image from nhentai',
        group: CommandGroup.COMMUNITIES,
        aliases: ['nhentai'],
        nsfw: true
    })
    private async exec(message: CommandMessage, query: RestAsString) {
        message.channel.startTyping();
        const query_str = encodeURIComponent(query.get());
        const { pages } = await nhentai.search(query_str);
        const { books } = await nhentai.search(query_str, RandomUtils.randint(1, pages));
        const book = RandomUtils.choice<any>(books);
        if (!book) return message.reply('No search results found');
        const page = RandomUtils.randint(4, book.pages.length - 4);
        new NHentaiEmbedBrowser(book, page).send_embed(message);
    }

    public async embed_handler(message: Message, client: Client, match: RegExpMatchArray) {
        const gallery = +match[1];
        const page = +match[2] || 0;

        const embed_browser: BaseEmbedBrowser = (await (NHentaiEmbedBrowser.from_gallery(gallery, page).catch(() => {
            message.channel.send(`Unable to fetch gallery ${gallery}`);
            return null;
        })));

        return embed_browser;
    }
}