import atexit
import logging
import queue
from datetime import datetime
from logging.handlers import QueueHandler, QueueListener

from app.core.config import STORAGE_DIR

LOGS_DIR = STORAGE_DIR / "logs"

_FORMAT = "[%(asctime)s] %(levelname)s in %(name)s (%(filename)s:%(lineno)d): %(message)s"


class DailyFileHandler(logging.FileHandler):
    def __init__(self) -> None:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        self._day = self._today()
        super().__init__(self._path(), encoding="utf-8", delay=True)

    @staticmethod
    def _today() -> str:
        return datetime.now().strftime("%Y-%m-%d")

    def _path(self) -> str:
        return str(LOGS_DIR / f"app-{self._day}.log")

    def emit(self, record: logging.LogRecord) -> None:
        today = self._today()
        if today != self._day:
            self.close()
            self._day = today
            self.baseFilename = self._path()
            self.stream = None
        super().emit(record)


_listener: QueueListener | None = None


def configure_logging(level: int = logging.WARNING) -> None:
    global _listener
    root = logging.getLogger()
    root.setLevel(level)
    if any(isinstance(h, QueueHandler) for h in root.handlers):
        return

    file_handler = DailyFileHandler()
    file_handler.setLevel(level)
    file_handler.setFormatter(logging.Formatter(_FORMAT))

    log_queue: queue.Queue = queue.Queue(-1)
    _listener = QueueListener(log_queue, file_handler, respect_handler_level=True)
    _listener.start()
    atexit.register(_listener.stop)

    queue_handler = QueueHandler(log_queue)
    queue_handler.setLevel(level)
    root.addHandler(queue_handler)
