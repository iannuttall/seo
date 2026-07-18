#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

import mlx.core as mx
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model


DEFAULT_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16"
DEFAULT_INSTRUCTION = (
    "Calm, clear product demonstration narration. Neutral, matter-of-fact, "
    "natural pace, with short pauses between sentences."
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate local narration clips for the OAuth verification demo."
    )
    parser.add_argument("--script", required=True, help="Narration JSON file.")
    parser.add_argument("--output-dir", required=True, help="Directory for WAV files.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--speaker", default="Aiden")
    parser.add_argument("--instruction", default=DEFAULT_INSTRUCTION)
    parser.add_argument("--seed", type=int, default=548418788)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def scene_hash(scene, args):
    content = json.dumps(
        {
            "text": scene["text"],
            "model": args.model,
            "speaker": args.speaker,
            "instruction": args.instruction,
            "seed": args.seed,
        },
        sort_keys=True,
    )
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def read_manifest(path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def main():
    args = parse_args()
    script_path = Path(args.script)
    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    scenes = json.loads(script_path.read_text(encoding="utf-8"))
    manifest_path = output_dir / "manifest.json"
    previous = read_manifest(manifest_path).get("scenes", {})

    pending = []
    scene_records = {}
    for index, scene in enumerate(scenes, start=1):
        digest = scene_hash(scene, args)
        output_path = output_dir / scene["file"]
        scene_records[scene["id"]] = {
            "file": scene["file"],
            "sha256": digest,
            "text": scene["text"],
        }
        if (
            args.force
            or not output_path.exists()
            or previous.get(scene["id"], {}).get("sha256") != digest
        ):
            pending.append((index, scene, output_path))

    if pending:
        print(f"Loading {args.model}...")
        model = load_model(args.model)
        for index, scene, output_path in pending:
            print(f"Generating {index:02d}/{len(scenes):02d}: {scene['id']}")
            mx.random.seed(args.seed + index)
            results = list(
                model.generate_custom_voice(
                    text=scene["text"],
                    speaker=args.speaker,
                    language="English",
                    instruct=args.instruction,
                )
            )
            if not results:
                raise RuntimeError(f"No audio was generated for {scene['id']}.")
            result = results[-1]
            audio_write(
                str(output_path), result.audio, result.sample_rate, format="wav"
            )
    else:
        print("All narration clips already match the script.")

    manifest = {
        "model": args.model,
        "speaker": args.speaker,
        "instruction": args.instruction,
        "seed": args.seed,
        "scenes": scene_records,
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(f"Narration ready in {output_dir}")


if __name__ == "__main__":
    main()
