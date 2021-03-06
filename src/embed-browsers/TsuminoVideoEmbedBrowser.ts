import { BaseEmbedBrowser, EmbedBrowserOptions } from './BaseEmbedBrowser';
import { Video } from '../apis/Tsumino';
import plur from 'plur';
import { MessageEmbed } from '../utils/EmbedUtils';

export class TsuminoVideoEmbedBrowser extends BaseEmbedBrowser {
    constructor(private video: Video, options?: EmbedBrowserOptions) {
        super(options);
    }

    async get_embed() {
        const embed = new MessageEmbed();
        embed.setImage(this.video.thumbnail_url);
        embed.setURL(this.video.url);
        embed.setTitle(this.video.title);
        if (this.video.uploaded) embed.addField('Uploaded On', this.video.uploaded, true);
        if (this.video.uploader) embed.addField('Uploaded By', this.video.uploader, true);
        if (this.video.rating) embed.addField('Rating', this.video.rating, true);
        embed.addField('Duration', this.video.duration, true);
        if (this.video.parody.length) embed.addField(plur('Parody', this.video.parody.length), this.video.parody.join(', '), true);
        if (this.video.collection.length) embed.addField(plur('Collection', this.video.collection.length), this.video.collection.join(', '), true);
        embed.addField('Tags', this.video.tags.join(', '));
        embed.setFooter('min 5 digits');

        return embed;
    }
}