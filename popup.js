// Get UI elements
const batchSizeInput = document.getElementById("batch-size");
const includeFoldersInput = document.getElementById("include-folders");
const nextBtn = document.getElementById("download-next-btn");
const allBtn = document.getElementById("download-all-btn");
const resetBtn = document.getElementById("reset-progress-btn");
const statusDiv = document.getElementById("status");

let currentTab;
let folderKey;

// --- Helper Functions ---
const saveSettings = () => {
  browser.storage.sync.set({
    batchSize: parseInt(batchSizeInput.value, 10) || 50,
    includeFolders: includeFoldersInput.checked,
  });
};

const disableButtons = (isDisbled) => {
  nextBtn.disabled = isDisbled;
  allBtn.disabled = isDisbled;
  resetBtn.disabled = isDisbled;
};

// --- Main Logic ---

// Function to update the status display
const updateStatus = async () => {
  if (!folderKey) return;
  const data = await browser.storage.local.get(folderKey);
  const progress = data[folderKey] || {};
  if (progress.totalFiles === undefined) {
    statusDiv.textContent = "Ready to start. Click a download button.";
  } else {
    const processedCount = progress.processedIds
      ? progress.processedIds.length
      : 0;
    const remaining = progress.totalFiles - processedCount;
    statusDiv.textContent = `Processed: ${processedCount} / ${progress.totalFiles}\nRemaining: ${remaining}`;
    if (remaining <= 0) {
      allBtn.disabled = true;
      nextBtn.disabled = true;
      statusDiv.textContent += "\n\nAll items processed!";
    }
  }
};

// Initializes the popup, gets tab info, and updates status
document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const settings = await browser.storage.sync.get([
    "batchSize",
    "includeFolders",
  ]);
  batchSizeInput.value = settings.batchSize || 50;
  includeFoldersInput.checked = settings.includeFolders === true;

  // Get current tab info
  [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!currentTab.url || !currentTab.url.includes("files.fm")) {
    statusDiv.textContent = "Not on a files.fm page.";
    disableButtons(true);
    return;
  }

  // Create a unique key for the current folder
  const url = new URL(currentTab.url);
  folderKey = `progress_${url.hostname}${url.pathname}${url.hash}`;

  // Add event listeners
  batchSizeInput.addEventListener("change", saveSettings);
  includeFoldersInput.addEventListener("change", saveSettings);
  nextBtn.addEventListener("click", () => handleAction("DOWNLOAD_BATCH"));
  allBtn.addEventListener("click", () => handleAction("DOWNLOAD_ALL"));
  resetBtn.addEventListener("click", handleReset);

  await updateStatus();
});

// Generic handler for download actions
const handleAction = async (action) => {
  disableButtons(true);
  statusDiv.textContent = "Processing...";

  const config = {
    batchSize: parseInt(batchSizeInput.value, 10),
    includeFolders: includeFoldersInput.checked,
    folderKey: folderKey,
    action: action,
  };

  try {
    await browser.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: contentScript,
      args: [config],
    });

    if (action === "DOWNLOAD_ALL") {
      statusDiv.textContent = "Automatic download started...";
    } else {
      statusDiv.textContent = "Batch download initiated!";
    }

    setTimeout(() => window.close(), 2000);
  } catch (e) {
    console.error(`Error during ${action}:`, e);
    statusDiv.textContent = `Error: ${e.message}`;
    disableButtons(false);
  }
};

// Handler for the reset button
const handleReset = async () => {
  if (
    confirm(
      "Are you sure you want to reset the download progress for this folder?"
    )
  ) {
    disableButtons(true);
    await browser.storage.local.remove(folderKey);
    statusDiv.textContent = "Progress has been reset.";
    disableButtons(false);
    await updateStatus();
  }
};

/**
 * This is the content script injected into the page.
 */
async function contentScript(config) {
  const { batchSize, includeFolders, folderKey, action } = config;
  const BATCH_DELAY_MS = 6000; // Increased delay to ensure download starts

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  const getItems = async (isInitialScan = false) => {
    let allItems = Array.from(
      document.querySelectorAll("div.main_content div.item.item-selectable")
    );

    if (!includeFolders) {
      allItems = allItems.filter((item) => !item.classList.contains("upload"));
    }

    const data = await browser.storage.local.get(folderKey);
    const progress = data[folderKey] || { processedIds: [], totalFiles: 0 };
    const processedIds = new Set(progress.processedIds);

    const unprocessedItems = allItems.filter(
      (item) => !processedIds.has(item.id)
    );

    if (isInitialScan && progress.totalFiles !== allItems.length) {
      progress.totalFiles = allItems.length;
      await browser.storage.local.set({ [folderKey]: progress });
    }

    return { unprocessedItems, processedIds, totalFiles: allItems.length };
  };

  const processBatch = async (batch) => {
    if (batch.length === 0) return false;

    console.log(
      `[Files.fm Downloader] Selecting batch of ${batch.length} items.`
    );
    batch.forEach((item) => {
      const checkbox = item.querySelector("input.item_selector");
      if (checkbox) checkbox.click();
    });

    await new Promise((resolve, reject) => {
      const downloadButton = document.getElementById(
        "filebrowser_top_action__multi_download"
      );
      if (!downloadButton)
        return reject(new Error("Download button not found!"));

      const observer = new MutationObserver(() => {
        if (downloadButton.style.display !== "none") {
          observer.disconnect();
          clearTimeout(fallback);
          downloadButton.click();
          resolve();
        }
      });
      const fallback = setTimeout(() => {
        observer.disconnect();
        if (downloadButton.style.display !== "none") {
          downloadButton.click();
          resolve();
        } else {
          reject(new Error("Download button did not appear."));
        }
      }, 4000);

      observer.observe(downloadButton, {
        attributes: true,
        attributeFilter: ["style"],
      });
    });

    // **BUG FIX**: Wait and then deselect the items to prepare for the next batch.
    await delay(2000); // Wait 2 seconds for download to initiate and UI to update.
    console.log(`[Files.fm Downloader] Deselecting ${batch.length} items.`);
    const masterDeselect = document.querySelector(
      "#filebrowser_top_action__multi_select_deselect"
    );
    if (masterDeselect && masterDeselect.checked) {
      masterDeselect.click(); // This is the most efficient way to deselect all.
    } else {
      // Fallback: deselect one by one if the master checkbox fails
      batch.forEach((item) => {
        const checkbox = item.querySelector("input.item_selector");
        if (checkbox && checkbox.checked) checkbox.click();
      });
    }

    // Update storage with the processed items
    const { processedIds } = await getItems();
    batch.forEach((item) => processedIds.add(item.id));
    const currentData = await browser.storage.local.get(folderKey);
    const progress = currentData[folderKey] || {};
    progress.processedIds = Array.from(processedIds);
    await browser.storage.local.set({ [folderKey]: progress });

    return true;
  };

  // --- Main Actions ---
  if (action === "DOWNLOAD_BATCH") {
    const { unprocessedItems } = await getItems(true);
    if (unprocessedItems.length === 0) {
      alert("All files for this folder have been processed!");
      return;
    }
    const batchToProcess = unprocessedItems.slice(0, batchSize);
    await processBatch(batchToProcess);
  } else if (action === "DOWNLOAD_ALL") {
    alert(
      "Starting automatic download of all remaining files. Please keep this tab open."
    );

    while (true) {
      const { unprocessedItems } = await getItems(true);
      if (unprocessedItems.length === 0) {
        alert("Automatic download complete! All files have been processed.");
        break;
      }

      const batchToProcess = unprocessedItems.slice(0, batchSize);
      const success = await processBatch(batchToProcess);

      if (!success) break;

      // Check if we are done before waiting
      const { unprocessedItems: remainingItems } = await getItems();
      if (remainingItems.length === 0) {
        alert("Automatic download complete! All files have been processed.");
        break;
      }

      console.log(
        `[Files.fm Downloader] Batch finished. Waiting ${
          BATCH_DELAY_MS / 1000
        } seconds...`
      );
      await delay(BATCH_DELAY_MS);
    }
  }
}
