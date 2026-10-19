import os
import time
from collections import defaultdict, deque

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
API_KEY = os.getenv("GEMINI_API_KEY", "")
MAX_REQ_PER_MIN = int(os.getenv("MAX_REQ_PER_MIN", "30"))

app = FastAPI(title="Interview Coach API")

origins = [o.strip().rstrip("/") for o in os.getenv("FRONTEND_URL", "https://interview-coach-api.onrender.com").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://[a-z0-9-]+\.onrender\.com",  # Render ke saare URLs allow
    allow_methods=["*"],
    allow_headers=["*"],
)

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


def _generate(parts: list, max_tokens: int, system: str | None = SYSTEM) -> str:
    if not API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY set nahi hai.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"maxOutputTokens": max(max_tokens, 1500)},
    }
    if "2.5-flash" in MODEL:
        body["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    try:
        r = requests.post(url, json=body, headers={"x-goog-api-key": API_KEY}, timeout=60)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="AI se connect nahi ho paya.")
    if r.status_code == 429:
        raise HTTPException(status_code=429, detail="AI ki free limit poori ho gayi. Thodi der baad try karo.")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI se jawab nahi mila (code {r.status_code}). Model ka naam check karo.")
    try:
        got = r.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in got).strip()
    except (KeyError, IndexError):
        return ""


def ask(prompt: str, max_tokens: int = 700) -> dict:
    text = _generate([{"text": prompt}], max_tokens)
    if not text:
        raise HTTPException(status_code=502, detail="AI ne khali jawab diya. Dobara try karo.")
    return {"text": text}


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
    return {"ok": True, "key_set": bool(API_KEY), "model": MODEL}


@app.get("/api/test")
def test(request: Request):
    check_rate(request)
    return ask("Sirf ek shabd likho: OK", max_tokens=200)


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
        f"Ye ek call ka transcript hai (aakhri hissa sabse naya). 'Interviewer:' wali lines dusre vyakti ki hain, "
        f"'Aap:' wali user ki.\n{body.transcript[-3000:]}\n{ctx(body)}\n"
        "Interviewer ke aakhri sawal ka chhota jawab suggest karo (3-5 points ya 2-3 vaakya). "
        "Agar koi sawal nahi pucha gaya hai to sirf likho: Abhi koi sawal nahi mila."
    )


class AudioIn(BaseModel):
    audio: str = Field(..., max_length=3_000_000)  # base64 WAV
    mime: str = Field("audio/wav", max_length=50)


@app.post("/api/transcribe")
def transcribe(body: AudioIn, request: Request):
    check_rate(request)
    text = _generate(
        [
            {"text": "Is audio mein jo bola gaya hai use waisa hi likho, usi language mein. "
                     "Agar saaf awaaz ya bolna nahi hai to bilkul khali jawab do. Sirf transcript likho."},
            {"inline_data": {"mime_type": body.mime, "data": body.audio}},
        ],
        max_tokens=500,
        system=None,
    )
    return {"text": text}


@app.post("/api/notes")
def notes(body: TranscriptIn, request: Request):
    check_rate(request)
    return ask(
        f"Is call ke notes banao: Summary, Questions, Next Steps.\n{ctx(body)}\nTranscript:\n{body.transcript[-8000:]}",
        max_tokens=900,
    )
