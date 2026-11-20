#!/usr/bin/env python3
"""
Build data/conditions.json for Wayward Bike.

Source: Open-Meteo (free, no key), at each destination's refElev.
  * climate: typical weather per month from 8 past years (cached on disk under data/cache/; it doesn't change)
  * now: the last 3 days of rain, the 7-day forecast and modelled snow on the ground,
    turned into a simple riding-conditions rating: good / mixed / poor, with the reasons.

Usage:
  python3 scripts/update_conditions.py              # everything (climate only fetched once per place)
  python3 scripts/update_conditions.py --only moab,girona
"""
import argparse, datetime as dt, json, os, statistics, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "cache")
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"
CLIM_YEARS = (2017, 2024)  # 8 full years


class DailyLimit(Exception):
    pass


def get(url, params, tries=4, timeout=60):
    q = url + "?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(q, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf8", "ignore")
            if e.code == 429:
                if "daily" in body.lower():
                    raise DailyLimit(body)
                wait = 3700 if "hourly" in body.lower() else 65
                print(f"  rate limited, sleeping {wait}s", flush=True)
                time.sleep(wait)
                continue
            if i == tries - 1:
                raise RuntimeError(f"HTTP {e.code}: {body[:200]}")
            time.sleep(3 * (i + 1))
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))
    raise RuntimeError("unreachable")


def avg(xs):
    xs = [x for x in xs if x is not None]
    return statistics.fmean(xs) if xs else None


def climate(d):
    """Typical weather per month: mean high/low (°C), rain (mm/month), rain days (>=1 mm), sunshine (h/day), max wind."""
    path = os.path.join(CACHE, f"clim_{d['id']}.json")
    key = f"{d['lat']},{d['lon']},{d['refElev']},{CLIM_YEARS}"
    if os.path.exists(path):
        c = json.load(open(path))
        if c.get("key") == key:
            return c["months"]
    js = get(ARCHIVE, {
        "latitude": d["lat"], "longitude": d["lon"], "elevation": d["refElev"],
        "start_date": f"{CLIM_YEARS[0]}-01-01", "end_date": f"{CLIM_YEARS[1]}-12-31",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max",
        "timezone": "auto",
    })["daily"]
    nyears = CLIM_YEARS[1] - CLIM_YEARS[0] + 1
    months = {}
    for m in range(1, 13):
        idx = [i for i, t in enumerate(js["time"]) if int(t[5:7]) == m]
        rain = [js["precipitation_sum"][i] or 0 for i in idx]
        months[m] = {
            "tmax": round(avg([js["temperature_2m_max"][i] for i in idx]), 1),
            "tmin": round(avg([js["temperature_2m_min"][i] for i in idx]), 1),
            "rain": round(sum(rain) / nyears),
            "rainDays": round(sum(1 for r in rain if r >= 1) / nyears, 1),
            "sun": round(avg([(js["sunshine_duration"][i] or 0) / 3600 for i in idx]), 1),
            "wind": round(avg([js["wind_speed_10m_max"][i] for i in idx])),
        }
    os.makedirs(CACHE, exist_ok=True)
    json.dump({"key": key, "months": months}, open(path, "w"))
    return months


def now(d):
    js = get(FORECAST, {
        "latitude": d["lat"], "longitude": d["lon"], "elevation": d["refElev"],
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
        "current": "snow_depth", "past_days": 3, "forecast_days": 7, "timezone": "auto",
    })
    dd = js["daily"]
    days = [{"date": dd["time"][i], "tmax": dd["temperature_2m_max"][i], "tmin": dd["temperature_2m_min"][i],
             "rain": round(dd["precipitation_sum"][i] or 0, 1), "pop": dd["precipitation_probability_max"][i],
             "wind": dd["wind_speed_10m_max"][i]} for i in range(len(dd["time"]))]
    past, nxt = days[:3], days[3:]
    snow = (js.get("current") or {}).get("snow_depth")
    return {"past3rain": round(sum(x["rain"] for x in past), 1), "next7": nxt,
            "snowDepth": round(snow * 100) if snow is not None else None, "today": nxt[0]["date"] if nxt else None}


def rate(d, n):
    """good / mixed / poor for riding over the next week, with the reasons in plain words. Worst reason wins."""
    nxt = [x for x in n["next7"] if x["tmax"] is not None]
    if not nxt:
        return None
    hi = statistics.fmean(x["tmax"] for x in nxt)
    lo = statistics.fmean(x["tmin"] for x in nxt)
    wet = sum(1 for x in nxt if x["rain"] >= 3)
    rain7 = round(sum(x["rain"] for x in nxt))
    windy = sum(1 for x in nxt if (x["wind"] or 0) >= 45)
    dirt = d["category"] in ("mtb", "gravel")
    out = []  # (level, text) with level 2 = poor, 1 = mixed
    if (n["snowDepth"] or 0) >= 5:
        out.append((2, f"Snow on the ground at ~{d['refElev']:,} m ({n['snowDepth']} cm, modelled)"))
    if hi < 5: out.append((2, f"Cold: highs around {hi:.0f}°C"))
    elif hi < 11: out.append((1, f"Chilly: highs around {hi:.0f}°C"))
    if hi >= 36: out.append((2, f"Very hot: highs around {hi:.0f}°C"))
    elif hi >= 31: out.append((1, f"Hot: highs around {hi:.0f}°C"))
    if wet >= 4: out.append((2, f"Wet week: rain on {wet} of the next 7 days ({rain7} mm)"))
    elif wet >= 2: out.append((1, f"Some rain: {wet} wet days in the next 7 ({rain7} mm)"))
    if dirt and n["past3rain"] >= 25: out.append((2, f"Trails likely muddy: {n['past3rain']:.0f} mm of rain in the last 3 days"))
    elif dirt and n["past3rain"] >= 10: out.append((1, f"Trails may be wet: {n['past3rain']:.0f} mm of rain in the last 3 days"))
    if windy >= 3: out.append((1, f"Windy: gusty days ahead"))
    level = max([l for l, _ in out], default=0)
    reasons = [t for l, t in sorted(out, key=lambda x: -x[0])]
    if not reasons:
        reasons = [f"Mostly dry, highs around {hi:.0f}°C" + (f", lows {lo:.0f}°C" if lo < 8 else "")]
    return {"rating": ["good", "mixed", "poor"][level], "reasons": reasons, "hi": round(hi), "lo": round(lo), "wetDays": wet, "rain7": rain7}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--pause", type=float, default=0.3)
    args = ap.parse_args()
    dj = json.load(open(os.path.join(DATA, "destinations.json")))
    dests = dj["destinations"]
    if args.only:
        keep = set(args.only.split(","))
        dests = [d for d in dests if d["id"] in keep]
    path = os.path.join(DATA, "conditions.json")
    out = json.load(open(path)) if os.path.exists(path) else {"destinations": {}}
    ok = fail = 0
    for d in dests:
        try:
            c = climate(d)
            n = now(d)
            out["destinations"][d["id"]] = {"climate": c, **n, "rated": rate(d, n), "asOf": dt.date.today().isoformat()}
            ok += 1
            print(f"{d['id']:<20} {out['destinations'][d['id']]['rated']['rating'] if out['destinations'][d['id']]['rated'] else '-':<6} {'; '.join(out['destinations'][d['id']]['rated']['reasons']) if out['destinations'][d['id']]['rated'] else ''}", flush=True)
        except DailyLimit:
            print("Daily API limit reached: saving what we have.", flush=True)
            break
        except Exception as e:
            fail += 1
            print(f"{d['id']:<20} FAILED: {e}", flush=True)
        time.sleep(args.pause)
    out["generated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    json.dump(out, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"done: {ok} ok, {fail} failed")
    sys.exit(1 if fail and not ok else 0)


if __name__ == "__main__":
    main()
