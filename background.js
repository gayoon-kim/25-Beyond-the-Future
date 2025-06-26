chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeTweet") {
    const tweetText = request.tweetText;

    fetch("http://127.0.0.1:5000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: tweetText })
    })
    .then(response => response.json())
    .then(data => {
      sendResponse({ result: data.result });
    })
    .catch(error => {
      console.error("API 요청 오류:", error);
      sendResponse({ result: "분석 실패" });
    });

    return true;
  }
});
