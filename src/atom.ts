export interface AtomLink {
    '$' : {
        rel: string
        type: string
        href: string
    } 
}

export interface AtomFeed {
    feed: {
        title: string[],
        subtitle: string[],
        updated: string[],
        link: object[]
        entry: AtomEntry[]
    }
}

export interface AtomEntry {
    id: string[],
    title: string[],
    updated: string[],
    published: string[]
    link: AtomLink[]
    author: string[],
    content: string[]
}

export function getJSONLink(links: AtomLink[]) : string{
    for (const link of links) {
        if (link.$.type == 'application/json'){
            return link.$.href
        }
    }
}