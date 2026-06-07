"""
export_flight_hdf5.py
lewm_data_logger.js 가 내보내는 JSON 롤아웃을 HDF5 파일로 변환하는 스크립트.

사용법:
    python export_flight_hdf5.py rollout.json --out flight_data.h5 --img-size 64

출력 HDF5 구조:
    observations/pixels  [T, H, W, 3]  uint8
    actions              [T, 6]         float32
    rewards              [T]            float32
    dones                [T]            bool
    telemetry            [T, 21]        float32

requirements: h5py, Pillow, numpy, tqdm
"""

import argparse
import base64
import io
import json
import os
import sys

import h5py
import numpy as np
from PIL import Image
from tqdm import tqdm


def decode_frame(data_url: str, img_size: int) -> np.ndarray:
    """base64 data URL → (H, W, 3) uint8 numpy 배열"""
    # "data:image/jpeg;base64,<data>" 형식에서 실제 base64 부분만 추출
    header, encoded = data_url.split(',', 1)
    raw = base64.b64decode(encoded)
    img = Image.open(io.BytesIO(raw)).convert('RGB')
    img = img.resize((img_size, img_size), Image.BILINEAR)
    return np.array(img, dtype=np.uint8)


def main():
    parser = argparse.ArgumentParser(
        description='lewm_data_logger JSON → HDF5 변환기'
    )
    parser.add_argument('input',              help='입력 JSON 파일 경로 (rollout.json)')
    parser.add_argument('--out',  default='flight_data.h5', help='출력 HDF5 파일 경로 (기본: flight_data.h5)')
    parser.add_argument('--img-size', type=int, default=64, help='이미지 리사이즈 크기 (기본: 64)')
    args = parser.parse_args()

    # ── JSON 로드 ─────────────────────────────────────────────────
    print(f'[*] JSON 파일 읽는 중: {args.input}')
    with open(args.input, 'r', encoding='utf-8') as f:
        data = json.load(f)

    rows         = data.get('rows', [])
    action_names = data.get('actionNames', [])
    telem_names  = data.get('telemetryNames', [])
    T            = len(rows)
    H = W        = args.img_size
    n_actions    = len(action_names)   # 6
    n_telem      = len(telem_names)    # 21

    if T == 0:
        print('[!] rows가 비어 있습니다. 종료합니다.')
        sys.exit(1)

    print(f'[*] 총 스텝 수: {T}  /  이미지 크기: {H}x{W}  /  액션 수: {n_actions}  /  텔레메트리 수: {n_telem}')

    # ── 배열 사전 할당 ────────────────────────────────────────────
    pixels    = np.zeros((T, H, W, 3), dtype=np.uint8)
    actions   = np.zeros((T, n_actions),  dtype=np.float32)
    rewards   = np.zeros((T,),            dtype=np.float32)
    dones     = np.zeros((T,),            dtype=bool)
    telemetry = np.zeros((T, n_telem),    dtype=np.float32)

    # ── 행 파싱 ───────────────────────────────────────────────────
    for i, row in enumerate(tqdm(rows, desc='프레임 디코딩 중', unit='frame')):
        pixels[i]    = decode_frame(row['frame'], args.img_size)
        actions[i]   = np.array(row['action'],    dtype=np.float32)
        rewards[i]   = float(row['reward'])
        dones[i]     = bool(row['done'])
        telemetry[i] = np.array(row['telemetry'], dtype=np.float32)

    # ── HDF5 저장 ─────────────────────────────────────────────────
    print(f'[*] HDF5 저장 중: {args.out}')
    with h5py.File(args.out, 'w') as hf:
        # 메타데이터
        hf.attrs['version']          = data.get('version', 1)
        hf.attrs['frame_encoding']   = data.get('frameEncoding', 'jpeg_data_url')
        hf.attrs['original_frame_size'] = data.get('frameSize', 224)
        hf.attrs['export_img_size']  = args.img_size
        hf.attrs['action_names']     = json.dumps(action_names)
        hf.attrs['telemetry_names']  = json.dumps(telem_names)

        # 데이터셋
        obs_grp = hf.create_group('observations')
        obs_grp.create_dataset('pixels',    data=pixels,    compression='gzip', compression_opts=4)

        hf.create_dataset('actions',   data=actions,   compression='gzip', compression_opts=4)
        hf.create_dataset('rewards',   data=rewards,   compression='gzip', compression_opts=4)
        hf.create_dataset('dones',     data=dones,     compression='gzip', compression_opts=4)
        hf.create_dataset('telemetry', data=telemetry, compression='gzip', compression_opts=4)

    # ── 완료 통계 ─────────────────────────────────────────────────
    file_size_mb = os.path.getsize(args.out) / (1024 ** 2)
    print()
    print('=' * 50)
    print(f'  완료!')
    print(f'  총 스텝 수   : {T}')
    print(f'  이미지 크기  : {H} x {W} x 3')
    print(f'  출력 파일    : {args.out}')
    print(f'  파일 크기    : {file_size_mb:.2f} MB')
    print('=' * 50)


if __name__ == '__main__':
    main()
