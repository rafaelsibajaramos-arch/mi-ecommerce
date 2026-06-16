"""
Worker de producción para el parser Bre-B / Llaves.

Este archivo NO reemplaza scripts/bank-email-parser.py.
Este worker lo ejecuta automáticamente cada X segundos, carga variables desde
.env.bank-parser y guarda logs en logs/bank-parser-worker.log.

Uso:
  py scripts\bank-email-worker.py --once
  py scripts\bank-email-worker.py
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env.bank-parser"
LOG_DIR = PROJECT_ROOT / "logs"
LOG_FILE = LOG_DIR / "bank-parser-worker.log"
LOCK_FILE = PROJECT_ROOT / ".bank-parser-worker.lock"
PARSER_FILE = PROJECT_ROOT / "scripts" / "bank-email-parser.py"
DEFAULT_INTERVAL_SECONDS = 30
MAX_LOG_BYTES = 5 * 1024 * 1024


REQUIRED_ENV_VARS = [
    "BANK_IMAP_HOST",
    "BANK_IMAP_PORT",
    "BANK_IMAP_USER",
    "BANK_IMAP_PASSWORD",
    "BANK_ALLOWED_SENDERS",
    "BANK_IMAP_MAILBOX",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
]


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def ensure_dirs() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def rotate_log_if_needed() -> None:
    if not LOG_FILE.exists():
        return

    if LOG_FILE.stat().st_size < MAX_LOG_BYTES:
        return

    backup = LOG_FILE.with_suffix(".log.1")
    try:
        if backup.exists():
            backup.unlink()
        LOG_FILE.rename(backup)
    except Exception:
        # Si no puede rotar, no detenemos el worker.
        pass


def log(message: str) -> None:
    ensure_dirs()
    rotate_log_if_needed()
    line = f"[{now()}] {message}"
    print(line, flush=True)
    with LOG_FILE.open("a", encoding="utf-8") as file:
        file.write(line + "\n")


def load_env_file(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(
            f"No existe {path.name}. Crea ese archivo en la raíz del proyecto "
            "con las variables del parser."
        )

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]

        os.environ[key] = value


def validate_env() -> None:
    missing = []
    example_values = []

    for key in REQUIRED_ENV_VARS:
        value = os.environ.get(key, "").strip()

        if not value:
            missing.append(key)
            continue

        upper = value.upper()
        if (
            upper.startswith("TU_")
            or upper.startswith("AQUI_")
            or "TU_URL" in upper
            or "TU_SERVICE" in upper
            or "CLAVE_DE_APP" in upper
            or "TU-PROYECTO" in upper
        ):
            example_values.append(key)

    if missing or example_values:
        details = []
        if missing:
            details.append("Faltan: " + ", ".join(missing))
        if example_values:
            details.append("Siguen con texto de ejemplo: " + ", ".join(example_values))
        raise RuntimeError("Variables inválidas. " + " | ".join(details))


def acquire_lock() -> None:
    if LOCK_FILE.exists():
        try:
            old_pid = LOCK_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            old_pid = "desconocido"
        raise RuntimeError(
            f"Ya existe un worker activo o quedó un lock viejo: {LOCK_FILE} "
            f"PID={old_pid}. Si estás seguro de que no hay otro worker, borra ese archivo."
        )

    LOCK_FILE.write_text(str(os.getpid()), encoding="utf-8")


def release_lock() -> None:
    try:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()
    except Exception:
        pass


def run_parser_once() -> int:
    if not PARSER_FILE.exists():
        log(f"ERROR: No existe {PARSER_FILE}")
        return 1

    command = [sys.executable, str(PARSER_FILE)]

    log("Ejecutando parser Bre-B / Llaves...")

    try:
        result = subprocess.run(
            command,
            cwd=str(PROJECT_ROOT),
            text=True,
            capture_output=True,
            timeout=120,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired:
        log("ERROR: El parser tardó más de 120 segundos y fue detenido.")
        return 1
    except Exception as exc:
        log(f"ERROR ejecutando parser: {exc}")
        return 1

    if result.stdout.strip():
        for line in result.stdout.strip().splitlines():
            log("OUT: " + line)

    if result.stderr.strip():
        for line in result.stderr.strip().splitlines():
            log("ERR: " + line)

    log(f"Parser finalizó con código {result.returncode}.")
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Ejecuta una sola revisión y sale.")
    parser.add_argument(
        "--interval",
        type=int,
        default=None,
        help="Segundos entre revisiones. Si no se indica, usa BANK_PARSER_INTERVAL_SECONDS o 30.",
    )
    args = parser.parse_args()

    ensure_dirs()

    try:
        load_env_file(ENV_FILE)
        validate_env()
    except Exception as exc:
        log(f"ERROR de configuración: {exc}")
        return 1

    interval = args.interval
    if interval is None:
        interval = int(os.environ.get("BANK_PARSER_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS))

    if interval < 10:
        interval = 10

    if args.once:
        return run_parser_once()

    try:
        acquire_lock()
    except Exception as exc:
        log(f"ERROR: {exc}")
        return 1

    log("Worker Bre-B / Llaves iniciado en modo producción.")
    log(f"Proyecto: {PROJECT_ROOT}")
    log(f"Intervalo: {interval} segundos")
    log(f"Log: {LOG_FILE}")

    try:
        while True:
            run_parser_once()
            log(f"Esperando {interval} segundos...")
            time.sleep(interval)
    except KeyboardInterrupt:
        log("Worker detenido manualmente con Ctrl+C.")
        return 0
    finally:
        release_lock()


if __name__ == "__main__":
    raise SystemExit(main())
