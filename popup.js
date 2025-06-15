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
    batchSize: parseInt(batchSizeInput.value, 10) || 5,
    includeFolders: includeFoldersInput.checked,
  });
};

const disableButtons = (isDisbled) => {
  nextBtn.disabled = isDisbled;
  allBtn.disabled = isDisbled;
  resetBtn.disabled = isDisbled;
};

// --- Main Logic ---

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

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await browser.storage.sync.get([
    "batchSize",
    "includeFolders",
  ]);
  batchSizeInput.value = settings.batchSize || 50;
  includeFoldersInput.checked = settings.includeFolders === true;

  [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!currentTab.url || !currentTab.url.includes("files.fm")) {
    statusDiv.textContent = "Not on a files.fm page.";
    disableButtons(true);
    return;
  }

  const url = new URL(currentTab.url);
  folderKey = `progress_${url.hostname}${url.pathname}${url.hash}`;

  batchSizeInput.addEventListener("change", saveSettings);
  includeFoldersInput.addEventListener("change", saveSettings);
  nextBtn.addEventListener("click", () => handleAction("DOWNLOAD_BATCH"));
  allBtn.addEventListener("click", () => handleAction("DOWNLOAD_ALL"));
  resetBtn.addEventListener("click", handleReset);

  await updateStatus();
});

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

  const createOverlay = () => {
    const overlayId = "ffm-downloader-overlay";
    if (document.getElementById(overlayId)) return;

    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.75); z-index: 99999999;
            display: flex; justify-content: center; align-items: center;
            color: white; font-size: 24px; font-family: Arial, sans-serif;
        `;
    overlay.innerHTML = `
            <div style="text-align: center; padding: 20px; background: rgba(0,0,0,0.5); border-radius: 10px;">
                <p>Automatic download in progress...</p>
                <p style="font-size: 16px;">Please keep this tab open.</p>
                <p id="ffm-overlay-status" style="font-size: 18px; margin-top: 20px;"></p>
            </div>
        `;
    document.body.appendChild(overlay);
  };

  const removeOverlay = () => {
    document.getElementById("ffm-downloader-overlay")?.remove();
  };

  const updateOverlayStatus = (text) => {
    const statusEl = document.getElementById("ffm-overlay-status");
    if (statusEl) statusEl.textContent = text;
  };

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

  const waitForDeselection = () =>
    new Promise((resolve, reject) => {
      const downloadButton = document.getElementById(
        "filebrowser_top_action__multi_download"
      );
      if (!downloadButton)
        return reject(new Error("Download button not found!"));

      // If the button is already hidden, we're good to go.
      if (downloadButton.style.display === "none") return resolve();

      const observer = new MutationObserver(() => {
        if (downloadButton.style.display === "none") {
          observer.disconnect();
          clearTimeout(fallback);
          resolve();
        }
      });

      const fallback = setTimeout(() => {
        observer.disconnect();
        console.warn(
          "[Files.fm Downloader] Waited for deselection, but button did not hide. Proceeding anyway."
        );
        resolve();
      }, 5000); // 5-second safety timeout

      observer.observe(downloadButton, {
        attributes: true,
        attributeFilter: ["style"],
      });
    });

  const processBatch = async (batch) => {
    if (batch.length === 0) return false;

    console.log(
      `[Files.fm Downloader] Selecting batch of ${batch.length} items.`
    );
    batch.forEach((item) => item.querySelector("input.item_selector")?.click());

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
        if (downloadButton.style.display !== "none") downloadButton.click();
        resolve();
      }, 4000);
      observer.observe(downloadButton, {
        attributes: true,
        attributeFilter: ["style"],
      });
    });

    const masterDeselect = document.querySelector(
      "#filebrowser_top_action__multi_select_deselect"
    );
    if (masterDeselect?.checked) masterDeselect.click();

    // **THE KEY SPEED IMPROVEMENT**: Wait for the UI to confirm deselection.
    await waitForDeselection();

    const { processedIds, totalFiles } = await getItems();
    batch.forEach((item) => processedIds.add(item.id));
    const progress = { processedIds: Array.from(processedIds), totalFiles };
    await browser.storage.local.set({ [folderKey]: progress });

    updateOverlayStatus(
      `Processed ${progress.processedIds.length} of ${totalFiles} files.`
    );
    return true;
  };

  // --- Main Actions ---
  try {
    if (action === "DOWNLOAD_BATCH") {
      const { unprocessedItems } = await getItems(true);
      if (unprocessedItems.length === 0) {
        alert("All files for this folder have been processed!");
        return;
      }
      await processBatch(unprocessedItems.slice(0, batchSize));
    } else if (action === "DOWNLOAD_ALL") {
      createOverlay();
      while (true) {
        const { unprocessedItems } = await getItems(true);
        if (unprocessedItems.length === 0) {
          alert("Automatic download complete! All files have been processed.");
          break;
        }
        await processBatch(unprocessedItems.slice(0, batchSize));
      }
    }
  } catch (error) {
    console.error("[Files.fm Downloader] An error occurred:", error);
    alert(
      "An error occurred during the download process. Please check the browser console for details."
    );
  } finally {
    removeOverlay();
  }
}
