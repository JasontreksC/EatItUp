"""
입 벌림 감지 테스트 (Pygame 버전)
------------------------------------
1_mouth_tracking_test.py 와 인식 로직은 동일하다 (같은 모델, 같은 jawOpen 값,
같은 랜드마크 인덱스 13/14). 화면 표시만 OpenCV의 cv2.imshow 대신
Pygame 창으로 바꿔서, 이후 게임 로직(음식 낙하 애니메이션 등)을
같은 Pygame 창 위에 자연스럽게 이어 붙일 수 있게 했다.

설치: pip install opencv-python mediapipe pygame numpy
사운드: pygame.mixer 로 FOOD_EATEN_EVENT 시 sounds/eat.wav 재생

조작: ESC 키 또는 창 닫기 버튼으로 종료.
"""

import os
import sys
import time
import urllib.request
import random

import cv2
import numpy as np
import pygame
from pygame import Vector2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from pathlib import Path

from food import Food
import events

# ── 설정값 ──────────────────────────────────────────────────────────
JAW_OPEN_THRESHOLD = 0.35   # 여기를 조정하며 튜닝
CAM_WIDTH, CAM_HEIGHT = 640, 480
MODEL_PATH = "face_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)
# 경로
BASE_DIR = Path(__file__).parent
IMAGE_DIR = BASE_DIR / "foods"

# ── 모델 다운로드 (최초 1회) ─────────────────────────────────────────
if not os.path.exists(MODEL_PATH):
    print("모델 파일 다운로드 중...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("다운로드 완료.")


def create_landmarker() -> vision.FaceLandmarker:
    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        output_face_blendshapes=True,
        num_faces=1,
        running_mode=vision.RunningMode.VIDEO,
    )
    return vision.FaceLandmarker.create_from_options(options)


def get_jaw_open_value(result) -> float:
    if result.face_blendshapes:
        for category in result.face_blendshapes[0]:
            if category.category_name == "jawOpen":
                return category.score
    return 0.0


def get_mouth_center(result, frame_w: int, frame_h: int):
    """입 중심 좌표를 (x, y) 픽셀 단위로 반환. 얼굴 미검출 시 None."""
    if not result.face_landmarks:
        return None
    landmarks = result.face_landmarks[0]
    upper_lip = landmarks[13]
    lower_lip = landmarks[14]
    cx = int((upper_lip.x + lower_lip.x) / 2 * frame_w)
    cy = int((upper_lip.y + lower_lip.y) / 2 * frame_h)
    return cx, cy


def cv2_frame_to_pygame_surface(frame_bgr: np.ndarray) -> pygame.Surface:
    """OpenCV의 BGR numpy 프레임을 Pygame Surface(RGB)로 변환."""
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    # frame_rgb.shape == (height, width, 3) → pygame은 (width, height) 순서를 기대
    return pygame.image.frombuffer(frame_rgb.tobytes(), (frame_rgb.shape[1], frame_rgb.shape[0]), "RGB")


def main():
    # ── 웹캠 초기화 ──
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("웹캠을 열 수 없습니다.")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAM_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_HEIGHT)

    landmarker = create_landmarker()

    # ── Pygame 초기화 ──
    pygame.init()
    screen = pygame.display.set_mode((CAM_WIDTH, CAM_HEIGHT), pygame.SCALED, vsync=1)
    pygame.display.set_caption("Mouth Tracking Test (Pygame)")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 32)

    screen_w = pygame.display.Info().current_w
    screen_h = pygame.display.Info().current_h

    # 먹기 사운드 (pygame.mixer)
    eat_sound = None
    try:
        pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=512)
        eat_sound = pygame.mixer.Sound(str(BASE_DIR / "sounds" / "eat.wav"))
        eat_sound.set_volume(0.7)
    except pygame.error as e:
        print(f"사운드 초기화 실패 (무음으로 계속): {e}")

    # Timer
    timer = 0

    # foods
    food_img_paths: list[Path] = []
    for f in Path(f"{IMAGE_DIR}").glob("*.png"):
        food_img_paths.append(f)
    
    food_pool: list[Food] = []

    # Mouse
    mouth_center = Vector2(0, 0)

    # Score
    score = 0

    running = True
    while running:
        # 델타타임
        deltaTime = clock.tick() / 1000
        timer += deltaTime
        # ── 이벤트 처리 ──
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False
            elif event.type == events.FOOD_EATEN_EVENT:
                if eat_sound is not None:
                    eat_sound.play()
                score = max(score + event.target_food.healthy, 0)
                food_pool.remove(event.target_food)
                print(f"ATE! left foods count: {len(food_pool)}")
            elif event.type == events.FOOD_WASTE_EVENT:
                food_pool.remove(event.target_food)
                print(f"WASTE! left foods count: {len(food_pool)}")
                

        # ── 프레임 읽기 & 인식 ──
        ret, frame = cap.read()
        if not ret:
            continue
        frame = cv2.flip(frame, 1)  # 거울 모드

        rgb_for_mp = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_for_mp)
        result = landmarker.detect_for_video(mp_image, int(time.time() * 1000))

        jaw_open_value = get_jaw_open_value(result)
        is_mouth_open = jaw_open_value > JAW_OPEN_THRESHOLD
        
        landmarked = get_mouth_center(result, CAM_WIDTH, CAM_HEIGHT)
        if landmarked:
            mouth_center = Vector2(landmarked)
             
        # ── Pygame 화면 그리기 ──
        # 웹캠 화면
        surface = cv2_frame_to_pygame_surface(frame)
        screen.blit(surface, (0, 0))
        # 텍스트
        status_color = (80, 220, 100) if is_mouth_open else (220, 80, 80)
        status_text = f"jawOpen: {jaw_open_value:.3f}  ({'OPEN' if is_mouth_open else 'CLOSED'})"
        text_surface = font.render(status_text, True, status_color)
        screen.blit(text_surface, (10, 10))
        # 임계값 수치
        threshold_text = font.render(f"threshold = {JAW_OPEN_THRESHOLD}", True, (200, 200, 200))
        screen.blit(threshold_text, (10, 45))
        # 입 원
        if mouth_center is not None:
            pygame.draw.circle(screen, (0, 255, 0) if is_mouth_open else (255, 0, 0), mouth_center, 8)
        # 점수
        score_text = f"Score: {score}"
        score_surface = font.render(score_text, True, (255, 255, 255))
        screen.blit(score_surface, (10, 80))


        # 음식 스폰
        if timer >= 4.0:
            random_food = random.randint(0, len(food_img_paths) - 1)
            img_path = food_img_paths[random_food]
            if img_path.name.startswith('g'):
                new_food = Food(
                    img_path,
                    100,
                    1,
                    50,
                    screen_w + 10,
                    (int(screen_h * 0.2), int(screen_h * 0.8))
                )
            elif img_path.name.startswith('b'):
                new_food = Food(
                    img_path,
                    100,
                    -1,
                    50,
                    screen_w + 10,
                    (int(screen_h * 0.2), int(screen_h * 0.8))
                )

            food_pool.append(new_food)
            timer = 0
        
        for food in food_pool:
            food.update(deltaTime, mouth_center, is_mouth_open)
            food.draw(screen)

        pygame.display.flip()

    cap.release()
    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()