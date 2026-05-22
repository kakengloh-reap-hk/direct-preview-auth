const TOKEN_KEYS = ["access_token", "refresh_token"];
const STAGING_URL_PATTERN = "https://staging.dashboard.reap.global/*";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "saveTokens") {
    saveTokens(message.tokens).then(sendResponse);
    return true;
  }

  if (message?.type === "savePreviewTokens") {
    savePreviewTokens(sender.tab?.id, message.tokens).then(sendResponse);
    return true;
  }

  if (message?.type === "getTokens") {
    getTokens().then((tokens) => sendResponse({ ok: Boolean(tokens), tokens }));
    return true;
  }

  if (message?.type === "applyPendingStagingTokens") {
    applyPendingStagingTokensToSender(sender.tab?.id).then(sendResponse);
    return true;
  }

  if (message?.type === "harvestTokensFromStagingTab") {
    harvestTokensFromStagingTab().then(sendResponse);
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleRemovedTab(tabId);
});

async function handleRemovedTab(tabId) {
  const { previewTokensByTab = {} } = await chrome.storage.local.get(
    "previewTokensByTab",
  );
  const tokens = previewTokensByTab[tabId];
  delete previewTokensByTab[tabId];
  await chrome.storage.local.set({ previewTokensByTab });

  if (!hasTokens(tokens)) {
    return;
  }

  pasteTokensBackToStaging(tokens);
}

async function saveTokens(tokens) {
  if (!hasTokens(tokens)) {
    return { ok: false, reason: "missing_tokens" };
  }

  await chrome.storage.local.set({ reapPreviewAuthTokens: pickTokens(tokens) });
  return { ok: true };
}

async function savePreviewTokens(tabId, tokens) {
  if (!hasTokens(tokens)) {
    return { ok: false, reason: "missing_tokens" };
  }

  const pickedTokens = pickTokens(tokens);

  if (typeof tabId === "number") {
    const { previewTokensByTab = {} } = await chrome.storage.local.get(
      "previewTokensByTab",
    );
    previewTokensByTab[tabId] = pickedTokens;
    await chrome.storage.local.set({ previewTokensByTab });
  }

  await chrome.storage.local.set({ reapPreviewAuthTokens: pickedTokens });
  return { ok: true };
}

async function getTokens() {
  const { reapPreviewAuthTokens } = await chrome.storage.local.get(
    "reapPreviewAuthTokens",
  );

  return hasTokens(reapPreviewAuthTokens) ? reapPreviewAuthTokens : null;
}

async function harvestTokensFromStagingTab() {
  const tabs = await chrome.tabs.query({ url: STAGING_URL_PATTERN });
  const stagingTab = tabs.find((tab) => typeof tab.id === "number");

  if (!stagingTab) {
    return { ok: false, reason: "staging_tab_not_found" };
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: stagingTab.id },
      func: readTokensFromLocalStorage,
      args: [TOKEN_KEYS],
    });

    const tokens = result?.result;

    if (!hasTokens(tokens)) {
      return { ok: false, reason: "missing_tokens" };
    }

    await saveTokens(tokens);
    return { ok: true, tokens: pickTokens(tokens) };
  } catch (_error) {
    return { ok: false, reason: "staging_tab_injection_failed" };
  }
}

async function pasteTokensBackToStaging(tokens) {
  const pickedTokens = pickTokens(tokens);
  await chrome.storage.local.set({ pendingStagingTokens: pickedTokens });

  const tabs = await chrome.tabs.query({ url: STAGING_URL_PATTERN });
  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map((tab) => injectTokensIntoStagingTab(tab.id, pickedTokens)),
  );
}

async function applyPendingStagingTokensToSender(tabId) {
  const { pendingStagingTokens } = await chrome.storage.local.get(
    "pendingStagingTokens",
  );

  if (!hasTokens(pendingStagingTokens)) {
    return { ok: false, reason: "no_pending_tokens" };
  }

  if (typeof tabId === "number") {
    await chrome.storage.local.remove("pendingStagingTokens");
  }

  return { ok: true, tokens: pendingStagingTokens };
}

async function injectTokensIntoStagingTab(tabId, tokens) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: writeTokensToLocalStorage,
      args: [pickTokens(tokens)],
    });
    await chrome.storage.local.remove("pendingStagingTokens");
  } catch (_error) {
    // Keep pendingStagingTokens for the next staging page load.
  }
}

function readTokensFromLocalStorage(keys) {
  return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
}

function writeTokensToLocalStorage(tokens) {
  Object.entries(tokens).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });
}

function hasTokens(tokens) {
  return TOKEN_KEYS.every(
    (key) => typeof tokens?.[key] === "string" && tokens[key].length > 0,
  );
}

function pickTokens(tokens) {
  return Object.fromEntries(TOKEN_KEYS.map((key) => [key, tokens[key]]));
}
