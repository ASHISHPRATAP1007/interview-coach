# Interview Coach

Next.js + Tailwind (frontend) aur FastAPI (backend). Mock interview aur khula live call assistant.

## Local par chalana
Backend:
    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=apni_key
    uvicorn main:app --reload --port 8000

Frontend (naye terminal mein):
    cd frontend
    cp .env.example .env.local
    npm install
    npm run dev       # http://localhost:3000

## Render par live karna (free)
1. Ye folder GitHub par push karo.
2. Render.com par New > Blueprint, apna repo chuno (render.yaml apne aap padh leta hai).
3. Pehle API service deploy hone do. Uska URL copy karo (jaise https://interview-coach-api.onrender.com).
4. Web service mein NEXT_PUBLIC_API_URL = API ka URL daalo, fir Manual Deploy karo (ye build ke time chahiye).
5. API service mein ANTHROPIC_API_KEY = apni key, aur FRONTEND_URL = web service ka URL daalo.
6. Dono redeploy karo. Ho gaya.

Note: Free plan par service 15 minute idle rehne par so jati hai, pehli request 30-60 second le sakti hai.
API key kabhi frontend ya GitHub mein mat daalo. Sirf Render ke env variables mein rakho.
