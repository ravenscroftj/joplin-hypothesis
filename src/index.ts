import joplin from 'api';
import { MenuItemLocation, SettingItemType } from 'api/types';
import * as xml2js from 'xml2js'

import { AtomEntry, AtomFeed, AtomLink, getJSONLink } from './atom';
import { Annotation } from './hypothesis';

//const HYPOTHESIS_FEED_URL = "https://hypothes.is/stream.atom?user="

const HYPOTHESIS_ANNOTATION_API = "https://hypothes.is/api/search"

const USER_PAGE_PREFIX = "https://hypothes.is/users"

const tagCache = new Map<string,string>()

async function upsertNotebook(){
	const annotationsNotebook = await joplin.settings.value('hypothesisNotebook')

	const nbresults = await joplin.data.get(['search'], {"type": "folder", "query": annotationsNotebook})
	let notebook = null

	if(nbresults.items?.length < 1){
		console.info(`Create annotations notebook ${annotationsNotebook}`)
		notebook = await joplin.data.post(['folders'], {}, {"title": annotationsNotebook})
	}else{
		console.info(`use existing annotations notebook ${annotationsNotebook}`)
		notebook = nbresults.items[0]
	}

	return notebook
}


function generateNoteBody(entry: Annotation, username: string) {

	let content : string[] = []

	// add context
	content.push(`[Web annotation](${entry.links.html}) by [${entry.user_info.display_name}](${USER_PAGE_PREFIX}/${username}) \n\n`)
	//try to add the quoted text if possible

	console.log("Target:", entry.target)

	if( (entry.target?.length >0) && (entry.target[0].selector) ){
		for(let i=0; i < entry.target[0].selector.length; i++){
			let selector = entry.target[0].selector[i]
			
			if (selector.type == "TextQuoteSelector") {
				content.push(`\n<blockquote>${selector.exact}</blockquote>`)
				break
			}
		}
	}



	content.push("\n" + entry.text)

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
			
			const tagObject = await joplin.data.post(['tags'], {}, {title: tag.toLowerCase()})
			console.log(tag, tagObject.title)
			tagCache.set(tagObject.title, tagObject.id)
		}

		await joplin.data.post(['tags', tagCache.get(tag.toLowerCase()), 'notes'], {}, {id: noteId})
	})

}

function encodeGetParams(obj){
	return Object.entries(obj).map( kv => kv.map(encodeURIComponent).join("=")).join("&");
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

	const lastRun = await joplin.settings.value('lastFeedRun')

	console.log("lastRun", lastRun)
	
	let lastDate = new Date(lastRun)

	console.log("LastDate", lastDate)

	let i = 0;


	let moreAnnotations = true;

	while(moreAnnotations) {

		const query = {
			user: username,
			sort: "created",
			order: "asc",
			search_after: lastDate.toISOString()
		}

		console.log("Call Hypothesis API with query args:", query)

		const r = await fetch(HYPOTHESIS_ANNOTATION_API + "?" + encodeGetParams(query)) //`${HYPOTHESIS_ANNOTATION_API}`)
		let response = await r.json()

		console.log(`Got ${response.rows.length} rows`)

		if(response.rows.length < 20){

			moreAnnotations = false;

			if (response.rows.length < 1){
				break
			}
		}


		// set the last run date as the most recent annotation's created date
		let dates = response.rows.map( (row) => new Date(row.created) ).sort( (a,b) => b-a )

		lastDate = dates[0]

		console.log("lastDate", lastDate)

		await handleApiResponse(response, notebook.id, username)

		i++;

		if(i > 2){
			break
		}
	}

	// store the lastDate

	//round to the next second to avoid double fetching most recent entry
	lastDate.setSeconds(lastDate.getSeconds()+1)

	joplin.settings.setValue("lastFeedRun", lastDate)



}

/**
 * This function processses the annotations returned from a single call to the hypothes.is API
 * 
 * @param response API response from hypothes.is
 * @param notebookId the ID of the notebook that annotations reside in
 * @param username the username being monitored (for generation of friendly links)
 */
async function handleApiResponse(response: any, notebookId: string, username: string) {

	// handle tags
	const tags : Set<string> = new Set()

	response.rows.map( (row) => {
		row.tags.map( (tag) => tags.add(tag) )
	})

	console.log("set of tags:", tags)

	// init tags if they're not already in the system
	tags.forEach( async (tag) => {
		
			if (!tagCache.has(tag.toLowerCase())){
				
				const tagObject = await joplin.data.post(['tags'], {}, {title: tag.toLowerCase()})
				console.log("Create tag", tagObject.title)
				tagCache.set(tagObject.title, tagObject.id)
			}
	})


	response.rows.map(async (entry) =>{


		const res = await joplin.data.get(['search'], {"query": `sourceurl: ${entry.links.json}`})

		if(res.items?.length > 0){
			return
		}
		
		// create the note
		const note = await joplin.data.post(['notes'], {}, {
			title: entry.document.title,
			parent_id: notebookId,
			source_url: entry.links.json,
			body: generateNoteBody(entry, username),
		})

		await tagEntry(note.id, entry)

	})
}

joplin.plugins.register({
	onStart: async function() {

		

		await joplin.settings.registerSection("hypothesis", {label:"Hypothes.is", description:"Joplin Hypothes.is settings"})
		await joplin.settings.registerSettings({
			feedUser: {public: true, value: "test", type: SettingItemType.String, label: "Hypothes.is Username", section:"hypothesis"},
			feedRefresh: {public: true, value: "15", type: SettingItemType.Int, label: "Feed Refresh Interval (Minutes)", section: "hypothesis"},
			hypothesisNotebook: {public:true, value:"Annotations", type: SettingItemType.String, label:"Annotations Notebook", section: "hypothesis"},
			lastFeedRun: {public: false, value: '1970-01-01', type: SettingItemType.String, label: "Last Run Time", section:"hypothesis"},
		})

		await joplin.commands.register({
			name: 'resetRetrievalTime',
			label: 'Reset Hypothes.is Last Retrieval',
			iconName: 'fas fa-drum',
			execute: async () => {
				await joplin.settings.setValue('lastFeedRun', "1970-01-01")
				alert('Last Hypothes.is Retrieval Time Reset');
			},
		});

		let isSyncing = false
		let runDeferred = false


		joplin.workspace.onSyncStart( () =>{
			isSyncing = true
		})

		joplin.workspace.onSyncComplete(() => {
			isSyncing = false

			if(runDeferred) {
				console.log("Running deferred annotation sync post joplin sync")
				checkAnnotations()
				runDeferred = false
			}
		})

		await joplin.views.menuItems.create('toolsResetRetrievalTime', 'resetRetrievalTime', MenuItemLocation.Tools);

		let intervalHandle : undefined | NodeJS.Timeout 



		const deferredCheckAnnotations = () => {
			if(isSyncing){
				console.log("Run annotation pull after next joplin sync completes")
				runDeferred = true
			}else{
				checkAnnotations()
			}
		}


		//kick off first run and then set feed refresh interval
		(async () => {

			// use global sync target setting to find out whether or not to wait for sync locks
			// uses undocumented setting names extracted from https://github.com/laurent22/joplin/blob/dev/packages/lib/models/Setting.ts#L142
			// as suggested by Laurent in the dev docs here: https://joplinapp.org/api/references/plugin_api/classes/joplinsettings.html#globalvalue
			const syncTarget = await joplin.settings.globalValue('sync.target')
			if(syncTarget > 0) {

				console.log("Wait for first joplin sync before running initial hypothesis sync")
				runDeferred = true

			}else{
				console.log("Run initial hypothesis sync")
				await deferredCheckAnnotations()
			}



			const feedRefreshInterval = await joplin.settings.value('feedRefresh')
			console.log(`Setting h feed refresh to ${feedRefreshInterval} minutes`)
			intervalHandle = setInterval(deferredCheckAnnotations, feedRefreshInterval * 1000 * 60 )
		})()

		await joplin.settings.onChange(async (evt)=>{

			// we don't waant to rerun if the only change was the lastFeedRun
			if( (evt.keys.length == 1) && evt.keys.includes('lastFeedRun') ){
				return
			}

			//trigger immediate update of annotation check
			await deferredCheckAnnotations()
			
			if(intervalHandle) {
				console.info("Clear interval for check annotations function")
				clearInterval(intervalHandle)
			}
			
			const feedRefreshInterval = await joplin.settings.value('feedRefresh')
			console.log(`Setting h feed refresh to ${feedRefreshInterval} minutes`)
			intervalHandle = setInterval(deferredCheckAnnotations, feedRefreshInterval * 1000 * 60 )

			
		})

	},


});
