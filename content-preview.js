(async function applyPreviewAuth() {
  if (!/^deploy-preview-\d+--reapdirect\.netlify\.app$/.test(location.hostname)) {
    return;
  }

  startTokenSync();

  if (sessionStorage.getItem("__reap_preview_auth_applied") === "1") {
    return;
  }

  const tokens = await getTokens();

  if (!tokens?.access_token || !tokens?.refresh_token) {
    console.warn(
      "Reap Preview Auth: open staging.dashboard.reap.global in a logged-in tab first.",
    );
    return;
  }

  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("refresh_token", tokens.refresh_token);
  localStorage.setItem("remember_me", "true");
  localStorage.setItem(
    "remember_me_expiry",
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  );
  publishCurrentTokens();
  sessionStorage.setItem("__reap_preview_auth_applied", "1");
  location.reload();
})();

function startTokenSync() {
  let lastSignature = "";

  const syncIfChanged = () => {
    const tokens = readCurrentTokens();

    if (!tokens.access_token || !tokens.refresh_token) {
      return;
    }

    const signature = `${tokens.access_token}:${tokens.refresh_token}`;

    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;
    sendMessage({ type: "savePreviewTokens", tokens });
  };

  syncIfChanged();
  setInterval(syncIfChanged, 2000);
  window.addEventListener("pagehide", syncIfChanged);
  window.addEventListener("beforeunload", syncIfChanged);
}

function publishCurrentTokens() {
  const tokens = readCurrentTokens();

  if (tokens.access_token && tokens.refresh_token) {
    sendMessage({ type: "savePreviewTokens", tokens });
  }
}

function readCurrentTokens() {
  return {
    access_token: localStorage.getItem("access_token"),
    refresh_token: localStorage.getItem("refresh_token"),
  };
}

async function getTokens() {
  const cached = await sendMessage({ type: "getTokens" });

  if (cached?.tokens?.access_token && cached?.tokens?.refresh_token) {
    return cached.tokens;
  }

  const harvested = await sendMessage({ type: "harvestTokensFromStagingTab" });
  return harvested?.tokens ?? null;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}
