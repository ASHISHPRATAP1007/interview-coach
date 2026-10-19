import os
import time
from collections import defaultdict, deque

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
API_KEY = os.getenv("GEMINI_API_KEY", "")
MAX_REQ_PER_MIN = int(os.getenv("MAX_REQ_PER_MIN", "15"))

app = FastAPI(title="Interview Coach API")

origins = [o.strip() for o in os.getenv("FRONTEND_URL", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

SYSTEM = (
    "Tum ek helpful interview coach ho. User jis language mein likhe (Hindi, Hinglish ya English), "
    "usi mein jawab do. Jawab saaf, sahi aur chhota rakho."
)

# Simple rate limit: har IP par har minute mein limited requests (kharcha bachane ke liye)
hits: dict[str, deque] = defaultdict(deque)


def check_rate(request: Request) -> None:
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    now = time.time()
    q = hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= MAX_REQ_PER_MIN:
        raise HTTPException(status_code=429, detail="Bahut zyada requests. Thodi der baad try karo.")
    q.append(now)


def ask(prompt: str, max_tokens: int = 700) -> dict:
    if not API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY set nahi hai.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    try:
        r = requests.post(url, json=body, headers={"x-goog-api-key": API_KEY}, timeout=60)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="AI se connect nahi ho paya.")
    if r.status_code == 429:
        raise HTTPException(status_code=429, detail="AI ki free limit poori ho gayi. Thodi der baad try karo.")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI se jawab nahi mila (code {r.status_code}). Model ka naam check karo.")
    try:
        parts = r.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="AI ne khali jawab diya. Dobara try karo.")
    return {"text": text.strip()}


class Base(BaseModel):
    role: str = Field("general", max_length=200)
    notes: str = Field("", max_length=4000)


class QuestionIn(Base):
    asked: list[str] = Field(default_factory=list, max_length=30)


class FeedbackIn(Base):
    question: str = Field(..., max_length=1000)
    answer: str = Field(..., max_length=4000)


class TranscriptIn(Base):
    transcript: str = Field(..., max_length=20000)


def ctx(b: Base) -> str:
    return f"Role: {b.role or 'general'}\nUser ke notes: {b.notes or 'koi nahi'}"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/question")
def question(body: QuestionIn, request: Request):
    check_rate(request)
    avoid = f"\nPehle puchhe sawal (dobara mat puchho): {' | '.join(body.asked)}" if body.asked else ""
    return ask(
        "Tum ek interviewer ho. Neeche ke role ke liye sirf ek interview sawal poochho. "
        f"Bas sawal likho, aur kuch nahi.\n{ctx(body)}{avoid}",
        max_tokens=200,
    )


@app.post("/api/feedback")
def feedback(body: FeedbackIn, request: Request):
    check_rate(request)
    return ask(
        f"Sawal: {body.question}\nUmeedwar ka jawab: {body.answer}\n{ctx(body)}\n"
        "Honest feedback do: kya achha tha, kya sudharna hai, aur ek behtar sample jawab. Chhota rakho."
    )


@app.post("/api/suggest")
def suggest(body: TranscriptIn, request: Request):
    check_rate(request)
    return ask(
        f"Ye ek call ka transcript hai (aakhri hissa sabse naya):\n{body.transcript[-3000:]}\n{ctx(body)}\n"
        "Aakhri sawal ya baat ka chhota jawab suggest karo (3-5 points ya 2-3 vaakya)."
    )


@app.post("/api/notes")
def notes(body: TranscriptIn, request: Request):
    check_rate(request)
    return ask(
        f"Is call ke notes banao: Summary, Questions, Next Steps.\n{ctx(body)}\nTranscript:\n{body.transcript[-8000:]}",
        max_tokens=900,
    )
