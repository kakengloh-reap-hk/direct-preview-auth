void (async function syncStagingTokens() {
  const pending = await sendMessage({ type: "applyPendingStagingTokens" });

  if (pending?.tokens?.access_token && pending?.tokens?.refresh_token) {
    localStorage.setItem("access_token", pending.tokens.access_token);
    localStorage.setItem("refresh_token", pending.tokens.refresh_token);
  }

  const tokens = {
    access_token: localStorage.getItem("access_token"),
    refresh_token: localStorage.getItem("refresh_token"),
  };

  if (!tokens.access_token || !tokens.refresh_token) {
    return;
  }

  chrome.runtime.sendMessage({ type: "saveTokens", tokens });
})();

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}
