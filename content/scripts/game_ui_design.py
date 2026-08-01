#!/usr/bin/env python3
"""
Game AI Kit — Game UI Design Tool
Generates game UI screen mockups using gpt-image-2 API.
Usage: python game_ui_design.py --type main_screen --game "凡人修仙传" --genre xianxia
"""

import os
import sys
import json
import base64
import argparse
import requests
from pathlib import Path
from datetime import datetime

OUTPUT_DIR = None  # resolved at runtime to <cwd>/game-ai-kit-output

# ---------------------------------------------------------------------------
# Art style descriptors
# ---------------------------------------------------------------------------
STYLE_PRESETS = {
    "card": (
        "smooth clean 2D anime illustration, cel-shaded, NO grain, NO noise, "
        "smooth gradients, crisp clean lines, similar to Onmyoji / Arknights / FGO mobile game style"
    ),
    "rpg": (
        "cinematic 3D RPG style, detailed environment, dramatic lighting, "
        "similar to Genshin Impact quality"
    ),
    "casual": (
        "bright cheerful cartoon style, flat design, clean colors, "
        "similar to casual mobile game aesthetics"
    ),
    "dark": (
        "dark fantasy style, moody atmosphere, detailed textures, gothic elements, "
        "similar to dark RPG mobile games"
    ),
}

# ---------------------------------------------------------------------------
# Game genre themes
# ---------------------------------------------------------------------------
GAME_GENRES = {
    "xianxia": {
        "color_scheme": "deep navy blue + celestial gold + jade green accents + white mist — elegant classical Chinese aesthetics",
        "bg_xianxia": "Soft illustrated Chinese immortal palace courtyard, gentle light beams, clean pastel gradients, airy atmosphere",
        "bg_default": "Mystical Chinese mountain floating islands, stylized sky, smooth illustrated style",
        "art_style": "Chinese xianxia cultivation robes with gold trim, spiritual energy particle effects",
    },
    "fantasy": {
        "color_scheme": "royal purple + warm gold + amber — Western high-fantasy aesthetics",
        "bg_xianxia": "Fantasy castle courtyard with magic particles, illustrated style",
        "bg_default": "Epic fantasy landscape, castle towers, dramatic sky",
        "art_style": "Fantasy armor and weapons, magical glowing effects",
    },
    "scifi": {
        "color_scheme": "electric cyan + deep black + neon purple — futuristic sci-fi aesthetics",
        "bg_xianxia": "Futuristic city skyline with holographic elements",
        "bg_default": "Space station interior, holographic displays, clean tech aesthetic",
        "art_style": "Futuristic suit with tech accents and energy effects",
    },
    "default": {
        "color_scheme": "deep navy + soft gold + white + mint green accents — clean modern mobile game palette",
        "bg_xianxia": "Beautiful illustrated game world background",
        "bg_default": "Beautiful illustrated game world background",
        "art_style": "game character with distinctive costume",
    },
}

# ---------------------------------------------------------------------------
# UI screen prompt templates
# ---------------------------------------------------------------------------
UI_TEMPLATES = {

    "main_screen": {
        "name": "主界面",
        "prompt": """\
Modern mobile card RPG main screen, portrait 9:16. {style_desc}.

BACKGROUND: {background} for game "{game_name}".

CHARACTER: Main protagonist clean anime 2D illustration, centered slightly left, \
confident dynamic pose, {art_style}.

UI LAYOUT — standard card game HUD:
TOP BAR: semi-transparent dark strip; left: circular player avatar + name + level badge; \
center: stamina bar with lightning icon; right: diamond gem count + gold coin count icons.
CENTER AREA: large rounded event banner "限时活动 · 新卡登场" with character art right side, \
soft drop shadow, rounded-16px corners.
BELOW BANNER: 3 stacked announcement/news items, small thumbnail left + text right, \
rounded panel cards with subtle separator.
BOTTOM NAV BAR: clean flat pill-shaped tab bar, 5 tabs with icon + Chinese label each — \
主城(home icon) 卡牌(cards icon) 副本(dungeon icon) 商城(shop icon) 活动(event icon); \
active tab highlighted with gold accent background.
Red notification dot badges on 副本 and 活动 tabs.

COLORS: {color_scheme}. NO heavy grain. NO noise. Smooth, comfortable to read.\
""",
    },

    "character_detail": {
        "name": "角色详情",
        "prompt": """\
Modern mobile card RPG character detail screen, portrait 9:16. {style_desc}.

CHARACTER: "{character_name}" from "{game_name}", full body clean anime 2D illustration, \
right side of screen, {art_style}, soft rim lighting, transparent background blending into scene.

UI LAYOUT — character info panel:
TOP BAR: back arrow left, title "角色详情" center, share icon right.
LEFT PANEL: large circular character portrait frame with 5-star rarity border, \
character name in bold below, element/type badge icon (e.g. 金 / 木 / 火), \
short character tagline in italic text, faction badge.
STATS SECTION: clean 4-row stat list — ATK / DEF / HP / SPD; \
each row: icon + label left, progress bar center, numeric value right.
SKILL ROW: 3 large skill icon buttons in a row, rounded frame, skill name label below each.
BOTTOM: two CTA buttons side by side — "强化" (enhance, secondary gray) and \
"上阵" (deploy, primary gold gradient), rounded full-width style.

BACKGROUND: blurred dark overlay of game world, character stands out with soft glow.
COLORS: {color_scheme}. Elegant, readable, professional.\
""",
    },

    "battle": {
        "name": "战斗界面",
        "prompt": """\
Modern mobile card RPG real-time battle screen, portrait 9:16. {style_desc}.

BATTLE SCENE: Dynamic environment for "{game_name}", {background}, dramatic action atmosphere.

CHARACTERS: Large enemy/boss monster visible upper-center area; \
player character smaller in lower-center in attack pose.

UI LAYOUT — battle HUD:
TOP BAR: thin strip; left: player HP bar (green) with heart icon + shield icon; \
right: boss name "精英BOSS" + boss HP bar (red); center: turn/wave indicator "第3波".
SKILL BAR (bottom panel): frosted glass dark panel, 5 large skill icon buttons in a row \
with circular cooldown overlay animation, skill name label below each, rounded icon frames.
BOTTOM LEFT: auto-battle toggle "自动" with ON state glow, speed-up "2x" button.
BOTTOM RIGHT: settings gear icon, flee button.
COMBO INDICATOR: "连击 ×5" floating text upper-left with streak glow effect.

COLORS: {color_scheme}. High contrast for fast action readability. NO noise.\
""",
    },

    "shop": {
        "name": "商城界面",
        "prompt": """\
Modern mobile card RPG shop/store screen, portrait 9:16. {style_desc}.

UI LAYOUT — shop interface:
TOP BAR: back arrow, "商城" title center, player diamonds icon + count top-right.
TAB ROW: horizontal scroll tab bar — 精选 每日特惠 道具 礼包 月卡; active tab underlined gold.
FEATURED BANNER: large top promotional banner with game character art, \
"限时礼包" badge, sale price tag, rounded-16px corners.
PRODUCT GRID: 2-column grid of product cards; each card: \
illustrated item icon, item name, price row with currency icon, "购买" button in gold.
SPECIAL CARD: highlighted card with bright red corner badge "7折优惠" and countdown timer.
BOTTOM STICKY: floating wide button "首充大礼包" in gradient gold, pulsing glow.

BACKGROUND: clean dark background, subtle game world motif, premium feel.
COLORS: {color_scheme}. Warm gold tones for premium items. Clean e-commerce adapted style.\
""",
    },

    "inventory": {
        "name": "背包界面",
        "prompt": """\
Modern mobile card RPG inventory/backpack screen, portrait 9:16. {style_desc}.

UI LAYOUT — inventory grid:
TOP: title "背包", horizontal filter tabs — 全部 装备 道具 材料 碎片; \
top-right capacity "80/120" with warning color if near full.
SORT BAR: thin row with "排序: 稀有度" dropdown and filter icon button.
ITEM GRID: 4-column grid of item slots; each slot: \
item icon centered, rarity-colored border frame (gray=普通 blue=稀有 purple=史诗 gold=传说), \
small white quantity badge bottom-right corner of slot.
SELECTED ITEM PANEL (bottom drawer): large item icon left, \
item name bold + rarity stars + description text, \
two action buttons right — "使用" (primary gold) and "出售" (secondary gray).

BACKGROUND: dark semi-transparent overlay on game world.
COLORS: {color_scheme}. Clean organized grid, rarity colors clearly distinct.\
""",
    },

    "gacha": {
        "name": "抽卡界面",
        "prompt": """\
Modern mobile card RPG gacha/summon screen, portrait 9:16. {style_desc}.

ATMOSPHERE: Dramatic swirling magical energy background, glowing particle effects, \
mystical summoning portal, cinematic lighting for "{game_name}".

CHARACTER BANNER: Large character artwork top-center — "{character_name}" in powerful pose, \
"限定" golden badge, character name in elegant Chinese calligraphy font with glow.

UI LAYOUT — gacha pull interface:
PITY BAR: thin progress bar below character — "保底进度 63/90" with milestone marker.
RATE INFO: small "概率详情 ▾" dropdown link below pity bar.
PULL BUTTONS: two large ornate rectangular buttons center-bottom;
  Left button "单抽 ×1" — shows 160 diamond icon + count, standard border;
  Right button "十连 ×10" — shows 1600 diamond icon, highlighted gold gradient border, \
  "FREE" small badge if daily free pull available.
BOTTOM TABS: "活动详情" and "兑换商店" text navigation links.

COLORS: {color_scheme}. Dramatic premium feel. Enticing golden glows.\
""",
    },

    "map": {
        "name": "地图界面",
        "prompt": """\
Modern mobile card RPG world map screen, portrait 9:16. {style_desc}.

MAP VISUAL: Illustrated top-down or isometric world map for "{game_name}", \
{background}, clear region divisions, stylized terrain.

UI LAYOUT — world map:
TOP BAR: back arrow, "世界地图" title, search icon.
MAP REGIONS: 4-6 distinct named regions on map, \
each with icon marker and Chinese name label; \
completed regions shown brighter, locked regions dimmed with lock icon.
CURRENT LOCATION: pulsing player location marker with character avatar icon.
SELECTED REGION PANEL (bottom): slides up when region tapped — \
region illustration thumbnail, region name bold, completion "12/20" progress, \
"进入" enter button in gold.
MINI COMPASS: top-right corner compass rose decoration.

COLORS: {color_scheme}. Clear readability over illustrated map. Adventurous feel.\
""",
    },
}


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def build_prompt(ui_type, game_name, genre="xianxia", style="card", character_name="主角"):
    tmpl = UI_TEMPLATES.get(ui_type)
    if not tmpl:
        available = ", ".join(UI_TEMPLATES.keys())
        raise ValueError(f"Unknown UI type '{ui_type}'. Available: {available}")

    style_desc = STYLE_PRESETS.get(style, STYLE_PRESETS["card"])
    game_style = GAME_GENRES.get(genre, GAME_GENRES["default"])

    # Pick background from genre; fall back to bg_default
    bg_key = "bg_xianxia" if genre == "xianxia" else "bg_default"
    background = game_style.get(bg_key, game_style.get("bg_default", "Beautiful illustrated game background"))

    return tmpl["prompt"].format(
        style_desc=style_desc,
        game_name=game_name,
        background=background,
        color_scheme=game_style["color_scheme"],
        art_style=game_style["art_style"],
        character_name=character_name,
    )


def generate_image(prompt, output_path, size="1024x1536"):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError("OPENAI_API_KEY environment variable is not set.")

    print(f"[gpt-image-2] Sending request ({size})...", flush=True)
    try:
        resp = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size},
            timeout=None,  # no timeout — wait as long as needed
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(f"Connection lost: {e}")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"API error {resp.status_code}: {resp.text}")

    result = resp.json()
    data = result["data"][0]
    if data.get("b64_json"):
        img_bytes = base64.b64decode(data["b64_json"])
    elif data.get("url"):
        img_bytes = requests.get(data["url"], timeout=None).content
    else:
        raise RuntimeError(f"Unexpected API response: {result}")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(img_bytes)

    return len(img_bytes)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Game AI Kit — UI Design Generator (gpt-image-2)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
UI types:  main_screen | character_detail | battle | shop | inventory | gacha | map
Genres:    xianxia | fantasy | scifi | default
Styles:    card | rpg | casual | dark

Examples:
  python game_ui_design.py --type main_screen --game "凡人修仙传" --genre xianxia --style card
  python game_ui_design.py --type character_detail --game "原神" --character "胡桃" --genre fantasy
  python game_ui_design.py --type gacha --game "明日方舟" --character "能天使" --style card --open
""",
    )
    parser.add_argument("--type", required=True, choices=list(UI_TEMPLATES.keys()),
                        help="UI screen type to generate")
    parser.add_argument("--game", required=True, help="Game title / IP name")
    parser.add_argument("--genre", default="xianxia", choices=list(GAME_GENRES.keys()),
                        help="Game genre / theme")
    parser.add_argument("--style", default="card", choices=list(STYLE_PRESETS.keys()),
                        help="Art rendering style")
    parser.add_argument("--character", default="主角",
                        help="Character name (used in character_detail and gacha screens)")
    parser.add_argument("--output", default=None, help="Custom output file path")
    parser.add_argument("--size", default="1024x1536",
                        choices=["1024x1024", "1024x1536", "1536x1024"],
                        help="Output image resolution")
    parser.add_argument("--open", action="store_true",
                        help="Open the image after generation")

    args = parser.parse_args()

    # Resolve output path — default to <cwd>/game-ai-kit-output/ at runtime
    if args.output:
        out_path = args.output
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_game = args.game.replace(" ", "_").replace("/", "_")
        filename = f"{args.type}_{safe_game}_{ts}.png"
        out_path = str(Path.cwd() / "game-ai-kit-output" / filename)

    # Build prompt
    prompt = build_prompt(
        ui_type=args.type,
        game_name=args.game,
        genre=args.genre,
        style=args.style,
        character_name=args.character,
    )

    ui_name = UI_TEMPLATES[args.type]["name"]
    print(f"[Game AI Kit] UI type: {ui_name} | Game: {args.game} | Genre: {args.genre} | Style: {args.style}", flush=True)

    # Generate
    size_bytes = generate_image(prompt, out_path, size=args.size)
    print(f"[Done] {out_path} ({size_bytes // 1024} KB)", flush=True)

    # Open if requested
    if args.open:
        import subprocess
        subprocess.Popen(["start", "", out_path], shell=True)

    return out_path


if __name__ == "__main__":
    main()
