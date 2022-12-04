import joplin from 'api';
import { SettingItemType } from 'api/types';
import * as xml2js from 'xml2js'

import { AtomEntry, AtomFeed, AtomLink, getJSONLink } from './atom';
import { Annotation } from './hypothesis';

const HYPOTHESIS_FEED_URL = "https://hypothes.is/stream.atom?user="

const USER_PAGE_PREFIX = "https://hypothes.is/users"

const tagCache = new Map<string,string>()

async function upsertNotebook(){
	const annotationsNotebook = await joplin.settings.value('hypothesisNotebook')

	const nbresults = await joplin.data.get(['search'], {"type": "folder", "query": annotationsNotebook})
	let notebook = null

	if(nbresults.items.length < 1){
		console.info(`Create annotations notebook ${annotationsNotebook}`)
		notebook = await joplin.data.post(['folders'], {}, {"title": annotationsNotebook})
	}else{
		console.info(`use existing annotations notebook ${annotationsNotebook}`)
		notebook = nbresults.items[0]
	}

	return notebook
}


function generateNoteBody(entry: AtomEntry, annotation: Annotation, username: string) {

	let content : string[] = []

	// add context
	content.push(`[Web annotation](${annotation.links.html}) by [${annotation.user_info.display_name}](${USER_PAGE_PREFIX}/${username}) \n\n`)
	content.push(entry.content[0]['_'].trim())

	return content.join("")
}



async function updateTagCache(){

	let hasMore = true
	let page = 1

	while(hasMore) {
		const tags = await joplin.data.get(['tags'], {page})

		tags.items.map( (tag) => {
			tagCache.set(tag.title, tag.id)
		})

		hasMore = tags.has_more
		page++
	}

}

async function tagEntry(noteId: string, annotation: Annotation) {

	annotation.tags.map( async (tag) => {
		if (!tagCache.has(tag.toLowerCase())){
			
			const tagObject = await joplin.data.post(['tags'], {}, {title: tag})
			console.log(tag, tagObject.title)
			tagCache.set(tagObject.title, tagObject.id)
		}

		await joplin.data.post(['tags', tagCache.get(tag.toLowerCase()), 'notes'], {}, {id: noteId})
	})

}


async function checkAnnotations(){

	console.log("check annotation feed")

	
	const username = await joplin.settings.value('feedUser')
	const notebook = await upsertNotebook()

	if(!username || username == "test"){
		console.log("User is not set")
		return
	}

	//update tag cache
	await updateTagCache()


	const r = await fetch(`${HYPOTHESIS_FEED_URL}${username}`)

	const feed = await xml2js.parseStringPromise(await r.text()) as AtomFeed

	feed.feed.entry.map(async (entry) =>{

		//https://hypothes.is/a/WvwqSHHGEe2XoPtDtpjTlw

		const jsonLink = getJSONLink(entry.link)

		const res = await joplin.data.get(['search'], {"query": `sourceurl: ${jsonLink}`})

		if(res.items.length > 0){
			return
		}

		// get the contents of the json entry
        const jsonEntry = await fetch(jsonLink)

		const annotationObject = await jsonEntry.json()
		

		// create the note
		const note = await joplin.data.post(['notes'], {}, {
			title: entry.title,
			parent_id: notebook.id,
			source_url: jsonLink,
			body: generateNoteBody(entry, annotationObject, username),
			application_data: JSON.stringify(annotationObject)
		})

		await tagEntry(note.id, annotationObject)

		

	})


}

joplin.plugins.register({
	onStart: async function() {

		await joplin.settings.registerSection("hypothesis", {label:"Hypothes.is", description:"Joplin Hypothes.is settings"})
		await joplin.settings.registerSettings({
			feedUser: {public: true, value: "test", type: SettingItemType.String, label: "Hypothes.is Username", section:"hypothesis"},
			feedRefresh: {public: true, value: "15", type: SettingItemType.Int, label: "Feed Refresh Interval (Minutes)", section: "hypothesis"},
			hypothesisNotebook: {public:true, value:"Annotations", type: SettingItemType.String, label:"Annotations Notebook"},
			lastFeedRun: {public: false, value: 0, type: SettingItemType.Object, label: "Last Run Time", section:"hypothesis"},
			resetLastRun: {public:true, value: null, type: SettingItemType.Button, label:"Reset Last Run Time (force redownload)", section:"hypothesis"}
		})



		let intervalHandle : undefined | NodeJS.Timeout 


		//kick off first run and then set feed refresh interval
		(async () => {
			console.log("Run initial sync")
			await checkAnnotations()
			const feedRefreshInterval = await joplin.settings.value('feedRefresh')
			console.log(`Setting feed refresh to ${feedRefreshInterval} minutes`)
			intervalHandle = setInterval(checkAnnotations, feedRefreshInterval * 1000 * 60 )
		})()



		await joplin.settings.onChange(async (evt)=>{

			//trigger immediate update of annotation check
			await checkAnnotations()
			
			if(intervalHandle) {
				console.info("Clear interval for check annotations function")
				clearInterval(intervalHandle)
			}
			
			const feedRefreshInterval = await joplin.settings.value('feedRefresh')
			console.log(`Setting feed refresh to ${feedRefreshInterval} minutes`)
			intervalHandle = setInterval(checkAnnotations, feedRefreshInterval * 1000 * 60 )

			
		})

	},


});
