# Joplin Hypothes.is Plugin

This plugin allows users to automatically import their [hypothes.is](https://hypothes.is/) annotations into their Joplin notes by monitoring their user Atom RSS feed.

## Features

- Import annotations from a Hypothes.is user RSS feed into Joplin
- Customisable feed polling frequency allowing the user to pull down new annotations as they are added

## Installation

### Manual install via JPL

1. Install the latest version of Joplin
2. Download the Joplin Hypothes.is RSS Plugin from the [GitHub releases page](https://github.com/ravenscroftj/joplin-hypothesis/releases)
3. In Joplin, go to the `Tools` menu and select `Plugins`
4. Click on the `Install Plugin` button and select the downloaded plugin `.jpl` file

### Install from Joplin Plugin Directory

Coming soon!

## Configuration

1. In Joplin, go to the `Tools` menu and select `Options`.
2. Select `Hypothes.is` in the options sidebar.
3. Enter your Hypothesis Username and the name of the Notebook to import your annotations into. 
4. Customise the feed poll frequency if desired. 

**note: the plugin will not work if you leave the user empty or set it to 'test'**

## Usage

Once configured the plugin will poll hypothes.is every few minutes (15 by default but configurable in the options menu) and check for new annotations. 

## Current Limitations

I've tried to pre-emptively note down some existing problems in [issues](https://github.com/ravenscroftj/joplin-hypothesis/issues). 

## Re-importing Old Annotations

The plugin will keep a record of the most recently created annotations within your hypothes.is account and will only attempt to download newer annotations. If you want to re-download all of your historical annotations then you can reset this value via the `Reset Hypothes.is Last Retrieval` option in the Tools menu.

## Support

If you have any questions or encounter any issues, please [file a bug report on the GitHub issues page](https://github.com/ravenscroftj/joplin-hypothesis/issues) for this plugin. Contact me via my personal site [brainsteam](https://brainsteam.co.uk).
