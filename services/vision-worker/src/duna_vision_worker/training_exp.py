from __future__ import annotations

import os

from yolox.exp import Exp as YoloXExp


class Exp(YoloXExp):
    """Trusted one-class YOLOX-S recipe for Duna ball detection."""

    def __init__(self) -> None:
        super().__init__()
        self.depth = 0.33
        self.width = 0.50
        self.num_classes = 1
        self.input_size = (640, 640)
        self.test_size = (640, 640)
        self.random_size = (14, 26)
        self.data_dir = os.environ["DUNA_TRAIN_DATA_DIR"]
        self.max_epoch = int(os.environ.get("DUNA_TRAIN_EPOCHS", "40"))
        self.warmup_epochs = min(3, max(1, self.max_epoch // 10))
        self.no_aug_epochs = min(5, max(1, self.max_epoch // 8))
        self.data_num_workers = int(os.environ.get("DUNA_TRAIN_WORKERS", "4"))
        self.eval_interval = max(1, min(5, self.max_epoch // 5))
        self.exp_name = "duna_yolox_s_ball"
