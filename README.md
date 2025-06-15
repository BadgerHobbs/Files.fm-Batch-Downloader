# Files.fm Batch Downloader

This Firefox Web Extension enhances the user experience on files.fm by providing tools for batch downloading files and folders, with progress tracking to manage large directories.

![image](https://github.com/user-attachments/assets/17469ed8-50c6-4e67-ba4b-9be7622b8fca)

## Features

- **Manual Batch Downloads**: Download a specific number of files at a time.
- **Fully Automatic Batch Downloads**: Let the extension download all remaining files in a folder, one batch after another.
- **Progress Tracking**: The extension remembers which files have been processed for each folder, so you can leave and come back later.
- **Configurable Batch Size**: You can set the number of files to include in each batch.
- **Option to Include/Exclude Folders**: Choose whether or not folders are included in the download selection.
- **Simple Dark Mode UI**: A clean, dark-themed interface for comfortable use.

## File Structure

The extension is composed of the following files:

```
filesfm-downloader/
├── icons/
│   └── icon-48.png
│   └── icon-128.png
├── manifest.json
├── popup.html
├── popup.js
└── README.md
```

## Setup and Installation

Since this is an unsigned, local extension, it must be loaded as a "temporary add-on" in Firefox. It will remain active until you close the browser.

1. Open Firefox and navigate to the `about:debugging` page by typing it in the address bar and pressing Enter.
2. In the left-hand menu, click on **"This Firefox"**.
3. Click the **"Load Temporary Add-on..."** button.
4. Navigate to your `filesfm-downloader` folder and select the `manifest.json` file.
5. The extension's icon will now appear in your Firefox toolbar.

_Note: If you are updating the extension, it is best to first **Remove** the old version from the `about:debugging` page and then load the new one._

## Usage Instructions

1. Navigate to a `files.fm` folder page containing the files you wish to download.
2. Click the extension icon in your toolbar to open the control panel.

### Manual Batching

- **Batch Size**: Set the number of files you want to download in a single batch.
- **Include folders**: Check this box if you want folders to be part of the selection.
- **Download Next Batch**: Click this button to select and download the next available batch of files based on your settings. The extension will remember what was previously downloaded.

### Automatic Batching

- **Download All in Batches**: Click this to start an automated process. The extension will download one batch, wait a few seconds, then download the next, continuing until all unprocessed files in the folder are downloaded.
- **Important**: You must keep the files.fm browser tab open and active while this process is running.

### Resetting Progress

- **Reset Progress for This Folder**: If you want to start the download process over for the current folder, click this button. It will erase the extension's memory of downloaded files for that specific folder URL.
