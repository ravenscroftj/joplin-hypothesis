export interface AnnotationTarget{
    source: string
    selector: AnnotationSelector[]
}

export interface AnnotationSelector{
    type: string
    start?: number
    end?: number
    exact?: string
    prefix?: string
    suffix?: string
}

export interface Annotation {
    id: string,
    created: string,
    updated: string,
    uri: string,
    text: string,
    tags: string[],
    target: AnnotationTarget[]
    hidden: boolean
    flagged: boolean
    // eslint-disable-next-line @typescript-eslint/naming-convention
    user_info: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        display_name: string
    }
    links:{
        html: string,
        incontext: string,
        json: string
    },
    document:{
        title: string[]
    }
}

export interface HypothesisResponse{
    total: number,
    rows: Annotation[]
}
