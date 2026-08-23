window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    !event.data ||
    event.data.type !== "MOODIN_MANUAL_NEWS_SUBMITTED" ||
    !event.data.alert
  ) {
    return;
  }
  chrome.runtime.sendMessage({
    type: "MOODIN_HANDLE_MANUAL_ALERT",
    alert: event.data.alert,
  });
});
