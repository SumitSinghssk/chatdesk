import os

import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8001")),
        reload=True,
        reload_dirs=["app"],
        # Longer than the Next.js proxy's keep-alive, so it never reuses a socket uvicorn just closed (ECONNRESET)
        timeout_keep_alive=75,
    )
