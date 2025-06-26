// content.js 확정본 - 클로저 캡처 방식 개선 포함
console.log("콘텐츠 스크립트가 트위터 페이지에 로드되었습니다.");

tf.wasm.setWasmPath(chrome.runtime.getURL('js/tfjs-backend-wasm.wasm'));
tf.setBackend('wasm').then(() => {
    console.log('TensorFlow.js WASM 백엔드가 content.js에서 사용됩니다.');
    observeTweets();
}).catch(err => {
    console.error('content.js에서 TensorFlow.js 백엔드 설정 오류:', err);
});

function sendTweetTextToBackground(text, tweetElement) {
    if (!/[ㄱ-힝]/.test(text)) return;

    console.log("🔥 보내는 텍스트:", text);
    console.log("📌 트윗 본문 확인용 (전송용):", text.slice(0, 50));

    fetch("http://127.0.0.1:5000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text })
    })
    .then(response => response.json())
    .then(data => {
        console.log("📊 분석결과:", {
            hate_label: data.label,
            hate_prob: data.hate_prob,
            ad_label: data.ad_label,
            ad_prob: data.ad_prob,
            viral_hate: data.viral_hate,
            viral_ad: data.viral_ad,
            viral_score: data.viral_score,
            viral_reason_ad: data.viral_reason_ad
        });

        const isHate = data.label === "혐오" && data.viral_hate === true;
        const isAd = data.ad_label === "광고" && data.viral_ad === true;

        const tweetTextNode = tweetElement?.querySelector('div[data-testid="tweetText"]');

        if (tweetElement && isHate) {
            console.log("🧪 hate_prob 배너로 보냄:", data.hate_prob);
            displayHateDetectionResult(tweetTextNode, data.hate_prob, data.viral_score);
        }
        if (tweetElement && isAd) {
            displayAdDetectionResult(tweetTextNode, data.ad_prob, data.viral_score, data.viral_reason_ad);
        }
    })
    .catch(error => {
        console.error("API 요청 실패:", error);
        console.error("요청 텍스트:", text);
    });
}

function displayHateDetectionResult(tweetTextNode, hateProb, viralScore) {
    console.log("🧾 배너에 실제 표시될 hateProb:", hateProb, "| viralScore:", viralScore);

    const content = `⚠️ 바이럴 혐오 표현 탐지됨\n` +
                    `· 혐오 확률: ${(hateProb * 100).toFixed(1)}%\n` +
                    `· 바이럴 유사도: ${(viralScore * 100).toFixed(1)}%`;

    const existing = tweetTextNode?.parentElement?.querySelector('.hate-detection-result');
    if (existing) {
        existing.innerText = content;
        return;
    }

    const resultDiv = document.createElement('div');
    resultDiv.className = 'hate-detection-result';
    Object.assign(resultDiv.style, {
        backgroundColor: 'rgba(255, 77, 79, 0.85)',
        color: 'white',
        padding: '10px',
        borderRadius: '12px',
        marginBottom: '8px',
        fontSize: '0.8em',
        fontWeight: 'bold',
        textAlign: 'left',
        whiteSpace: 'pre-line',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
        fontFamily: 'Segoe UI, sans-serif',
        display: 'inline-block',
        maxWidth: '360px'
    });
    resultDiv.innerText = content;

    if (tweetTextNode && tweetTextNode.parentElement) {
        tweetTextNode.parentElement.insertBefore(resultDiv, tweetTextNode);
    }
}

function displayAdDetectionResult(tweetTextNode, adProb, viralScore, reason) {
    const viralMessage = reason === 'count'
        ? `· 유사 문장 다수 감지`
        : `· 바이럴 유사도: ${(viralScore * 100).toFixed(1)}%`;

    const content = `📢 바이럴 광고 탐지됨\n` +
                    `${viralMessage}\n` +
                    `· 광고 확률: ${(adProb * 100).toFixed(1)}%`;

    const existing = tweetTextNode?.parentElement?.querySelector('.ad-detection-result');
    if (existing) {
        existing.innerText = content;
        return;
    }

    const resultDiv = document.createElement('div');
    resultDiv.className = 'ad-detection-result';
    Object.assign(resultDiv.style, {
        backgroundColor: 'rgba(24, 144, 255, 0.85)',
        color: 'white',
        padding: '10px',
        borderRadius: '12px',
        marginBottom: '8px',
        fontSize: '0.8em',
        fontWeight: 'bold',
        textAlign: 'left',
        whiteSpace: 'pre-line',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
        fontFamily: 'Segoe UI, sans-serif',
        display: 'inline-block',
        maxWidth: '360px'
    });
    resultDiv.innerText = content;

    if (tweetTextNode && tweetTextNode.parentElement) {
        tweetTextNode.parentElement.insertBefore(resultDiv, tweetTextNode);
    }
}

function observeTweets() {
    const tweetSelectors = 'div[data-testid="tweetText"] span';

    document.querySelectorAll(tweetSelectors).forEach(span => {
        if (!span.dataset.analyzed) {
            const tweetText = span.innerText.trim();
            const tweetElement = span.closest('[data-testid="tweet"]');

            if (tweetText && tweetElement) {
                span.dataset.analyzed = 'true';
                (function(textCopy, elementCopy) {
                    sendTweetTextToBackground(textCopy, elementCopy);
                })(tweetText, tweetElement); // 클로저 캡처로 고정
            }
        }
    });

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.querySelector(tweetSelectors)) {
                        node.querySelectorAll(tweetSelectors).forEach(span => {
                            if (!span.dataset.analyzed) {
                                const tweetText = span.innerText.trim();
                                const tweetElement = span.closest('[data-testid="tweet"]');
                                if (tweetText && tweetElement) {
                                    span.dataset.analyzed = 'true';
                                    (function(textCopy, elementCopy) {
                                        sendTweetTextToBackground(textCopy, elementCopy);
                                    })(tweetText, tweetElement);
                                }
                            }
                        });
                    }
                });
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
