from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import BertTokenizer, BertForSequenceClassification
import torch
from datetime import datetime, timedelta
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
from soynlp.normalizer import repeat_normalize
import joblib

app = Flask(__name__)
CORS(app)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 모델 로딩
model_path = "model/hatedetection"
tokenizer = BertTokenizer.from_pretrained(model_path)
model = BertForSequenceClassification.from_pretrained(model_path)
model.to(device)
model.eval()

logreg_model = joblib.load("logreg_okt_model.pkl")
tfidf_vectorizer = joblib.load("tfidf_vectorizer.pkl")

recent_all_tweets = []

def clean_text(text):
    text = repeat_normalize(text, num_repeats=2)
    text = re.sub(r"[^가-힣a-zA-Z0-9\s]", "", text)
    return text.strip()

# 혐오 바이럴 판단: avg similarity 기준
def is_viral_hate(current_text, current_time, tweet_pool):
    cutoff = current_time - timedelta(hours=12)
    tweet_pool = [item for item in tweet_pool if item['time'] > cutoff]
    if not tweet_pool:
        return False, 0.0
    texts = [item['text'] for item in tweet_pool] + [current_text]
    tfidf = TfidfVectorizer().fit_transform(texts)
    sim_matrix = cosine_similarity(tfidf)
    similarities = sim_matrix[-1][:-1]
    avg_similarity = float(similarities.mean())
    print(f"[VIRAL HATE] avg_similarity: {avg_similarity:.4f}")
    return avg_similarity > 0.25, avg_similarity

# 광고 바이럴 판단: count >= 2 또는 avg_similarity > 0.25
def is_viral_ad(current_text, current_time, tweet_pool):
    cutoff = current_time - timedelta(hours=12)
    tweet_pool = [item for item in tweet_pool if item['time'] > cutoff]
    if not tweet_pool:
        return False, 0.0, "none"
    texts = [item['text'] for item in tweet_pool] + [current_text]
    tfidf = TfidfVectorizer().fit_transform(texts)
    sim_matrix = cosine_similarity(tfidf)
    similarities = sim_matrix[-1][:-1]
    avg_similarity = float(similarities.mean())
    high_sim_count = sum(1 for sim in similarities if sim > 0.25)
    print(f"[VIRAL AD] count: {high_sim_count}, avg_similarity: {avg_similarity:.4f}")

    if high_sim_count >= 2:
        return True, avg_similarity, "count"
    elif avg_similarity > 0.25:
        return True, avg_similarity, "average"
    return False, avg_similarity, "none"

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    text = data.get("text", "")
    now = datetime.now()

    try:
        print(f"\n[요청 수신] 원문: {text}")
        text = clean_text(text)
        print(f"[전처리 후] {text}")

        # 혐오 분류
        inputs = tokenizer(text, return_tensors="pt", truncation=True,
                           padding='max_length', max_length=128)
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.softmax(outputs.logits, dim=1)
            label = torch.argmax(probs, dim=1).item()
            confidence = probs[0][label].item()
            hate_prob = probs[0][1].item()

        if confidence < 0.5:
            label = 0
        hate_label = "혐오" if label == 1 else "비혐오"

        # 광고 분류
        ad_prob = logreg_model.predict_proba(tfidf_vectorizer.transform([text]))[0][1]
        ad_label = "광고" if ad_prob >= 0.5 else "비광고"

        # 바이럴 판단
        recent_all_tweets.append({'text': text, 'time': now})
        viral_hate, viral_score_hate = is_viral_hate(text, now, recent_all_tweets)
        viral_ad, viral_score_ad, viral_reason_ad = is_viral_ad(text, now, recent_all_tweets)

        return jsonify({
            "label": hate_label,
            "hate_prob": round(hate_prob, 4),
            "viral_hate": viral_hate,
            "viral_score": round(viral_score_ad if viral_ad else viral_score_hate, 4),
            "ad_label": ad_label,
            "ad_prob": round(ad_prob, 4),
            "viral_ad": viral_ad,
            "viral_reason_ad": viral_reason_ad
        })

    except Exception as e:
        print(f"[에러 발생] {e}")
        return jsonify({"error": "분석 중 오류 발생", "detail": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)