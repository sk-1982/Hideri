import { Discord, CommandMessage } from '@typeit/discord';
import config from '../configs/config.json';
import image_emotes from '../configs/image_emotes.json';
import { Command } from '../ArgumentParser';
import { CommandGroup } from '../types/CommandGroup';
import { MessageEmbed } from '../utils/EmbedUtils';
import { get_prefix } from '../server-config/ServerConfig';
import { RandomUtils } from '../utils/RandomUtils';

image_emotes.forEach(({ name, info, description, url, aliases, raw, nsfw }) => {
    @Discord(get_prefix)
    class ImageEmote {
        @Command(name, {
            infos: info,
            description: description,
            group: CommandGroup.IMAGE_EMOTES,
            aliases: aliases ?? [],
            nsfw: nsfw ?? false
        })
        private async exec(message: CommandMessage) {
            const image = Array.isArray(url) ? RandomUtils.choice(url) : url;

            if (raw) return message.channel.send(image);

            const embed = new MessageEmbed();
            embed.setImage(image);
            message.channel.send(embed);
        }
    }
});