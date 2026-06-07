import argparse
import base64
import json
from pathlib import Path

import numpy as np


def decode_data_url(data_url):
    if "," not in data_url:
        raise ValueError("expected data URL with comma separator")
    header, payload = data_url.split(",", 1)
    return base64.b64decode(payload)


def load_rollout(path):
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    rows = payload.get("rows", [])
    if not rows:
        raise ValueError(f"{path} has no rows")
    return payload, rows


def build_arrow_rows(files):
    episode_offset = 0
    out = {
        "episode_idx": [],
        "step_idx": [],
        "pixels": [],
        "pixels_h": [],
        "pixels_w": [],
        "action": [],
        "state": [],
        "reward": [],
        "done": [],
    }

    for file in files:
        payload, rows = load_rollout(file)
        seen_episode = {}
        for row in rows:
            source_ep = int(row.get("episode", 0))
            if source_ep not in seen_episode:
                seen_episode[source_ep] = episode_offset
                episode_offset += 1

            frame = decode_data_url(row["frame"])
            frame_size = int(payload.get("frameSize", 224))
            action = np.asarray(row["action"], dtype=np.float32).tolist()
            telemetry = np.asarray(row["telemetry"], dtype=np.float32).tolist()

            out["episode_idx"].append(seen_episode[source_ep])
            out["step_idx"].append(int(row.get("step", len(out["step_idx"]))))
            out["pixels"].append(frame)
            out["pixels_h"].append(frame_size)
            out["pixels_w"].append(frame_size)
            out["action"].append(action)
            out["state"].append(telemetry)
            out["reward"].append(float(row.get("reward", 0.0)))
            out["done"].append(bool(row.get("done", False)))

    return out


def write_lance(columns, out_path, mode):
    try:
        import lance
        import pyarrow as pa
    except ImportError as exc:
        raise SystemExit(
            "Missing lance/pyarrow. Install official data deps first, for example:\n"
            "  pip install 'stable-worldmodel[format]' pylance pyarrow\n"
        ) from exc

    table = pa.table(
        {
            "episode_idx": pa.array(columns["episode_idx"], type=pa.int32()),
            "step_idx": pa.array(columns["step_idx"], type=pa.int32()),
            "pixels": pa.array(columns["pixels"], type=pa.binary()),
            "pixels_h": pa.array(columns["pixels_h"], type=pa.int16()),
            "pixels_w": pa.array(columns["pixels_w"], type=pa.int16()),
            "action": pa.array(columns["action"], type=pa.list_(pa.float32())),
            "state": pa.array(columns["state"], type=pa.list_(pa.float32())),
            "reward": pa.array(columns["reward"], type=pa.float32()),
            "done": pa.array(columns["done"], type=pa.bool_()),
        }
    )
    lance.write_dataset(table, out_path, mode=mode)


def write_npz_debug(columns, out_path):
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_path,
        episode_idx=np.asarray(columns["episode_idx"], dtype=np.int32),
        step_idx=np.asarray(columns["step_idx"], dtype=np.int32),
        action=np.asarray(columns["action"], dtype=np.float32),
        state=np.asarray(columns["state"], dtype=np.float32),
        reward=np.asarray(columns["reward"], dtype=np.float32),
        done=np.asarray(columns["done"], dtype=bool),
        pixels=np.asarray(columns["pixels"], dtype=object),
        pixels_h=np.asarray(columns["pixels_h"], dtype=np.int16),
        pixels_w=np.asarray(columns["pixels_w"], dtype=np.int16),
    )


def main():
    parser = argparse.ArgumentParser(
        description="Convert browser-exported flight rollouts to a Lance table for official LeWM."
    )
    parser.add_argument("inputs", nargs="+", help="JSON rollout exports from lewmLogger.export().")
    parser.add_argument("--out", default="data/stablewm/flight_takeoff_train.lance")
    parser.add_argument("--mode", choices=["create", "overwrite", "append"], default="overwrite")
    parser.add_argument("--debug-npz", default=None, help="Optional NPZ output for schema inspection.")
    args = parser.parse_args()

    columns = build_arrow_rows(args.inputs)
    if args.debug_npz:
      write_npz_debug(columns, args.debug_npz)
    write_lance(columns, args.out, args.mode)
    print(f"wrote {len(columns['step_idx'])} rows to {args.out}")


if __name__ == "__main__":
    main()
