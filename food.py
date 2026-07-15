import cv2
import numpy as np
import random
from pathlib import Path
import pygame
from pygame import Vector2, Surface

import events
class Food:
    
    def __init__(
            self, 
            path: Path, 
            size: int, 
            healthy: int, 
            floating_speed: int, 
            spawn_x: int, 
            spawn_y_range: tuple[int, int]
        ):

        self.food_image = pygame.transform.scale(pygame.image.load(path), (size, size))
        self.size = size
        self.food_name = path.name
        self.healthy = healthy
        self.floating_speed = floating_speed
        self.center_pos = Vector2(spawn_x, random.randint(spawn_y_range[0], spawn_y_range[1]))
        self.eatingup_speed = 500

        self.is_eatingup = False
        self.is_ate = False

        self.tween_timer = 0
        self.tween_size_time = 0.5
    
    def update(self, deltaTime, mouth_center: Vector2, is_mouth_open: bool):
        if self.is_eatingup:
            self.tween_timer = max(self.tween_timer - deltaTime, 0)

            # dir_to_mouse = (mouth_center - self.center_pos).normalize()
            # self.center_pos += dir_to_mouse * self.eatingup_speed * deltaTime
            self.center_pos += (mouth_center - self.center_pos) * deltaTime

            decreasing_size = self.size * self.tween_timer / self.tween_size_time
            self.food_image = pygame.transform.scale(self.food_image, (decreasing_size, decreasing_size))
        
            if self.tween_timer <= 0.01:
                eaten_event = pygame.event.Event(events.FOOD_EATEN_EVENT, target_food=self)
                pygame.event.post(eaten_event)
        else:
            # 왼쪽으로 이동
            self.center_pos.x -= self.floating_speed * deltaTime
            if self.center_pos.x < self.size / 2 * -1:
                waste_event = pygame.event.Event(events.FOOD_WASTE_EVENT, target_food=self)
                pygame.event.post(waste_event)
            # 먹기 판정
            if self.center_pos.distance_to(mouth_center) <= 50 and is_mouth_open:
                self.tween_timer = self.tween_size_time
                self.is_eatingup = True
    
    def draw(self, screen: Surface):
        screen.blit(self.food_image, (self.center_pos - Vector2(self.food_image.get_rect().center)))