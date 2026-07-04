import asyncio, json, os, sys
import edge_tts

VOICE = "en-US-AriaNeural"
OUT_DIR = "audio/raw"
CONCURRENCY = 8

async def gen_one(sem, idx, text, results):
    path = f"{OUT_DIR}/{idx}.mp3"
    if os.path.exists(path) and os.path.getsize(path) > 0:
        results[idx] = "cached"
        return
    async with sem:
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(text, VOICE)
                await communicate.save(path)
                results[idx] = "ok"
                return
            except Exception as e:
                if attempt == 2:
                    results[idx] = f"FAIL: {e}"
                else:
                    await asyncio.sleep(1.5)

async def main():
    with open("audio/sentences.json", encoding="utf-8") as f:
        sentences = json.load(f)
    sem = asyncio.Semaphore(CONCURRENCY)
    results = {}
    tasks = [gen_one(sem, i, t, results) for i, t in enumerate(sentences)]
    total = len(tasks)
    done = 0
    for coro in asyncio.as_completed(tasks):
        await coro
        done += 1
        if done % 25 == 0 or done == total:
            print(f"{done}/{total}", flush=True)
    fails = {k: v for k, v in results.items() if v.startswith("FAIL")}
    if fails:
        print("FAILURES:", fails, file=sys.stderr)
        sys.exit(1)
    print("all done")

if __name__ == "__main__":
    asyncio.run(main())
